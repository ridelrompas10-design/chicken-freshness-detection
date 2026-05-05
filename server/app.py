from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import numpy as np
import joblib
import cv2
import os
import threading
import serial
import serial.tools.list_ports
import json
from datetime import datetime, timedelta

# =====================
# PATH SETUP
# =====================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ✅ FIX 1: static_folder dan template_folder pakai path absolut
app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, 'static'),
    static_url_path='/static',
    template_folder=os.path.join(BASE_DIR, 'static')
)
CORS(app)

# =====================
# LOAD MODEL
# =====================
model         = joblib.load(os.path.join(BASE_DIR, 'model', 'rf_model.pkl'))
label_encoder = joblib.load(os.path.join(BASE_DIR, 'model', 'label_encoder.pkl'))

# =====================
# DATA SENSOR GLOBAL
# =====================
data_sensor = {
    'sensor_1' : 0.0,
    'sensor_2' : 0.0,
    'sensor_3' : 0.0,
    'rata_rata' : 0.0,
    'kondisi'   : '-',
    'waktu'     : '-',
    'valid'     : False
}
sensor_lock = threading.Lock()

# =====================
# EKSTRAK FITUR GAMBAR
# =====================
def extract_features(img):
    img = cv2.resize(img, (64, 64))
    features = []
    for ch in cv2.split(img):
        features.extend([np.mean(ch), np.std(ch),
                         np.min(ch),  np.max(ch)])
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    for ch in cv2.split(hsv):
        features.extend([np.mean(ch), np.std(ch),
                         np.min(ch),  np.max(ch)])
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    for ch in cv2.split(lab):
        features.extend([np.mean(ch), np.std(ch)])
    return np.array(features).reshape(1, -1)

# =====================
# CEK KONDISI SENSOR
# =====================
def cek_kondisi_sensor(kadar_air):
    if kadar_air > 92:
        return {
            'valid' : False,
            'pesan' : 'Daging kemungkinan masih beku. Tunggu 5-10 menit.',
            'level' : 'warning'
        }
    elif kadar_air < 5:
        return {
            'valid' : False,
            'pesan' : 'Sensor tidak terbaca. Pastikan menempel pada daging.',
            'level' : 'error'
        }
    elif kadar_air >= 75:
        return {
            'valid' : True,
            'pesan' : 'Kadar air normal - daging segar',
            'level' : 'ok'
        }
    elif kadar_air >= 60:
        return {
            'valid' : True,
            'pesan' : 'Kadar air sedang - daging setengah segar',
            'level' : 'ok'
        }
    else:
        return {
            'valid' : True,
            'pesan' : 'Kadar air rendah - daging busuk',
            'level' : 'ok'
        }

# =====================
# HITUNG KETAHANAN
# =====================
def hitung_ketahanan(label, conf):
    base = {'Segar': 72, 'Setengah': 24, 'Busuk': 0}
    jam  = int(base.get(label, 0) * (conf / 100) * 1.1)
    if jam >= 48:
        return f"{jam//24} hari", "Simpan di kulkas 0-4°C"
    elif jam >= 1:
        return f"{jam} jam", "Segera masak atau simpan di kulkas"
    else:
        return "0", "Tidak layak dikonsumsi"

# =====================
# GABUNG KAMERA + SENSOR
# =====================
def gabung_hasil(label_kamera, conf_kamera, kadar_air):
    kondisi = cek_kondisi_sensor(kadar_air)

    if not kondisi['valid']:
        return {
            'label'       : label_kamera,
            'confidence'  : round(conf_kamera, 2),
            'sumber'      : 'Kamera saja (sensor tidak valid)',
            'pesan_sensor': kondisi['pesan'],
            'level_sensor': kondisi['level']
        }

    if   kadar_air >= 75: label_sensor = 'Segar'
    elif kadar_air >= 60: label_sensor = 'Setengah'
    else:                 label_sensor = 'Busuk'

    if label_kamera == label_sensor:
        label_final = label_kamera
        conf_final  = min(conf_kamera * 1.1, 99.9)
        sumber      = 'Kamera + Sensor (sepakat)'
    else:
        label_final = label_kamera
        conf_final  = conf_kamera * 0.85
        sumber      = f'Kamera utama (sensor: {label_sensor})'

    return {
        'label'       : label_final,
        'confidence'  : round(conf_final, 2),
        'sumber'      : sumber,
        'pesan_sensor': kondisi['pesan'],
        'level_sensor': kondisi['level']
    }

# =====================
# THREAD BACA SENSOR
# =====================
def cari_port_esp32():
    ports = serial.tools.list_ports.comports()
    for port in ports:
        if any(x in port.description for x in
               ['CP210', 'CH340', 'USB Serial', 'UART']):
            return port.device
    return None

def thread_sensor():
    print("Mencari ESP32...")
    port = cari_port_esp32()

    if port is None:
        print("ESP32 tidak ditemukan. Mode tanpa sensor.")
        return

    print(f"ESP32 ditemukan di: {port}")

    while True:
        try:
            ser    = serial.Serial(port, 115200, timeout=2)
            buffer = ""
            print(f"Sensor terhubung di {port}")

            while True:
                if ser.in_waiting > 0:
                    karakter = ser.read().decode('utf-8', errors='ignore')
                    if karakter == '\n':
                        baris  = buffer.strip()
                        buffer = ""
                        if baris.startswith('{'):
                            try:
                                data = json.loads(baris)
                                with sensor_lock:
                                    data_sensor['sensor_1'] = round(data.get('s1', 0), 1)
                                    data_sensor['sensor_2'] = round(data.get('s2', 0), 1)
                                    data_sensor['sensor_3'] = round(data.get('s3', 0), 1)
                                    data_sensor['rata_rata'] = round(data.get('avg', 0), 1)
                                    data_sensor['kondisi']  = cek_kondisi_sensor(
                                        data.get('avg', 0))['pesan']
                                    data_sensor['waktu']    = datetime.now().strftime('%H:%M:%S')
                                    data_sensor['valid']    = True
                                print(f"[Sensor] avg={data.get('avg',0):.1f}%")
                            except json.JSONDecodeError:
                                pass
                    else:
                        buffer += karakter

        except serial.SerialException as e:
            print(f"Koneksi sensor terputus: {e}")
            print("Mencoba reconnect dalam 5 detik...")
            with sensor_lock:
                data_sensor['valid'] = False
            import time
            time.sleep(5)
        except Exception as e:
            print(f"Error sensor: {e}")
            break

# Jalankan thread sensor
t = threading.Thread(target=thread_sensor, daemon=True)
t.start()

# =====================
# ENDPOINT
# =====================

# ✅ FIX 2: Pakai render_template agar Jinja2 {{ url_for() }} diproses
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    try:
        file = request.files.get('image')
        if not file:
            return jsonify({'error': 'Tidak ada gambar'}), 400

        img_bytes = np.frombuffer(file.read(), np.uint8)
        img       = cv2.imdecode(img_bytes, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({'error': 'Gambar tidak valid'}), 400

        features     = extract_features(img)
        pred         = model.predict(features)
        proba        = model.predict_proba(features)[0]
        label_kamera = label_encoder.inverse_transform(pred)[0]
        conf_kamera  = float(np.max(proba) * 100)

        with sensor_lock:
            kadar_air    = data_sensor['rata_rata']
            s1           = data_sensor['sensor_1']
            s2           = data_sensor['sensor_2']
            s3           = data_sensor['sensor_3']
            sensor_ok    = data_sensor['valid']
            waktu_sensor = data_sensor['waktu']

        hasil         = gabung_hasil(label_kamera, conf_kamera, kadar_air)
        durasi, saran = hitung_ketahanan(hasil['label'], hasil['confidence'])

        jam_est = 0
        if 'hari' in durasi:
            jam_est = int(durasi.split()[0]) * 24
        elif 'jam' in durasi:
            jam_est = int(durasi.split()[0])

        estimasi = (datetime.now() + timedelta(hours=jam_est)).strftime('%d %b %Y')

        return jsonify({
            'label'      : hasil['label'],
            'confidence' : hasil['confidence'],
            'sumber'     : hasil['sumber'],
            'durasi'     : durasi,
            'saran'      : saran,
            'estimasi'   : estimasi,
            'detail_kamera': {
                cls: round(float(p * 100), 2)
                for cls, p in zip(label_encoder.classes_, proba)
            },
            'sensor': {
                'sensor_1' : s1,
                'sensor_2' : s2,
                'sensor_3' : s3,
                'rata_rata': kadar_air,
                'kondisi'  : hasil.get('pesan_sensor', '-'),
                'level'    : hasil.get('level_sensor', '-'),
                'terhubung': sensor_ok,
                'waktu'    : waktu_sensor
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/sensor-status', methods=['GET'])
def sensor_status():
    with sensor_lock:
        return jsonify(data_sensor)

@app.route('/sensor', methods=['POST'])
def sensor_post():
    try:
        body      = request.json
        kadar_air = float(body.get('kadar_air', 0))
        kondisi   = cek_kondisi_sensor(kadar_air)
        with sensor_lock:
            data_sensor['rata_rata'] = round(kadar_air, 1)
            data_sensor['kondisi']   = kondisi['pesan']
            data_sensor['waktu']     = datetime.now().strftime('%H:%M:%S')
            data_sensor['valid']     = True
        return jsonify({'status': 'ok', 'kadar_air': kadar_air})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/status', methods=['GET'])
def status():
    return jsonify({
        'server': 'online',
        'sensor': data_sensor['valid'],
        'waktu' : datetime.now().strftime('%H:%M:%S')
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)