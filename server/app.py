from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import numpy as np
import joblib
import cv2
import os

# =====================
# SETUP PATH
# =====================
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR  = os.path.join(BASE_DIR, '../static')
MODEL_PATH  = os.path.join(BASE_DIR, '../model/rf_model.pkl')
ENCODER_PATH = os.path.join(BASE_DIR, '../model/label_encoder.pkl')

app = Flask(__name__, static_folder=STATIC_DIR)
CORS(app)

# =====================
# LOAD MODEL
# =====================
try:
    model         = joblib.load(MODEL_PATH)
    label_encoder = joblib.load(ENCODER_PATH)
    print("✅ Model loaded:", label_encoder.classes_)
except Exception as e:
    print("❌ Gagal load model:", e)
    model         = None
    label_encoder = None

# =====================
# DATA SENSOR (in-memory)
# =====================
data_sensor = {'kadar_air': 0}

# =====================
# FEATURE EXTRACTION
# =====================
# PENTING: fungsi ini HARUS identik dengan train_model.py
# Total fitur: RGB(12) + HSV(12) + LAB(6) = 30 fitur
def extract_features(img):
    img = cv2.resize(img, (64, 64))
    features = []

    # Fitur RGB
    for channel in cv2.split(img):
        features.extend([
            float(np.mean(channel)),
            float(np.std(channel)),
            float(np.min(channel)),
            float(np.max(channel))
        ])

    # Fitur HSV
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    for channel in cv2.split(hsv):
        features.extend([
            float(np.mean(channel)),
            float(np.std(channel)),
            float(np.min(channel)),
            float(np.max(channel))
        ])

    # Fitur LAB
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    for channel in cv2.split(lab):
        features.extend([
            float(np.mean(channel)),
            float(np.std(channel))
        ])

    return np.array(features, dtype=np.float32).reshape(1, -1)


# =====================
# ESTIMASI KETAHANAN
# =====================
# Label disesuaikan dengan nama folder dataset: segar, cukup_segar, busuk
KETAHANAN_INFO = {
    'segar': {
        'base_jam': 72,
        'saran': 'Simpan di kulkas 0–4°C. Tahan hingga 3 hari.'
    },
    'cukup_segar': {
        'base_jam': 24,
        'saran': 'Segera masak dalam 24 jam atau simpan di kulkas.'
    },
    'busuk': {
        'base_jam': 0,
        'saran': 'Tidak layak dikonsumsi. Buang segera.'
    }
}

def hitung_ketahanan(label, conf_pct):
    info = KETAHANAN_INFO.get(label, {'base_jam': 0, 'saran': '-'})
    jam  = int(info['base_jam'] * (conf_pct / 100))

    if jam >= 48:
        durasi = f"{jam // 24} hari ({jam} jam)"
    elif jam >= 1:
        durasi = f"{jam} jam"
    else:
        durasi = "0 jam"

    return durasi, info['saran']


# =====================
# LABEL DISPLAY (untuk UI)
# =====================
LABEL_DISPLAY = {
    'segar':       {'text': 'Segar',        'color': '#22c55e'},
    'cukup_segar': {'text': 'Cukup Segar',  'color': '#f59e0b'},
    'busuk':       {'text': 'Busuk',         'color': '#ef4444'}
}


# =====================
# ROUTES
# =====================
@app.route('/')
def index():
    return send_from_directory(STATIC_DIR, 'index.html')


@app.route('/predict', methods=['POST'])
def predict():
    """
    Terima gambar dari frontend (atau ESP32 yang trigger via POST).
    Body: multipart/form-data dengan field 'image'.
    Response: JSON hasil prediksi.
    """
    if model is None:
        return jsonify({'error': 'Model belum diload. Jalankan train_model.py terlebih dahulu.'}), 500

    try:
        if 'image' not in request.files:
            return jsonify({'error': 'Field "image" tidak ditemukan di request'}), 400

        file      = request.files['image']
        img_bytes = np.frombuffer(file.read(), np.uint8)
        img       = cv2.imdecode(img_bytes, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({'error': 'Gambar tidak valid atau rusak'}), 400

        # Ekstrak fitur & prediksi
        features = extract_features(img)
        pred     = model.predict(features)
        proba    = model.predict_proba(features)[0]

        # Decode label
        label     = label_encoder.inverse_transform(pred)[0]
        conf      = float(np.max(proba) * 100)
        durasi, saran = hitung_ketahanan(label, conf)

        # Detail probabilitas semua kelas
        detail = {
            cls: round(float(p * 100), 2)
            for cls, p in zip(label_encoder.classes_, proba)
        }

        return jsonify({
            'label':      label,
            'label_text': LABEL_DISPLAY.get(label, {}).get('text', label),
            'color':      LABEL_DISPLAY.get(label, {}).get('color', '#888'),
            'confidence': round(conf, 2),
            'durasi':     durasi,
            'saran':      saran,
            'kadar_air':  data_sensor['kadar_air'],
            'detail':     detail
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/sensor', methods=['POST'])
def sensor():
    """
    Terima data dari ESP32.
    Body JSON: {"kadar_air": 65.3}
    """
    try:
        body = request.get_json(force=True)
        if body is None:
            return jsonify({'error': 'Body bukan JSON'}), 400

        kadar_air = body.get('kadar_air', 0)
        data_sensor['kadar_air'] = float(kadar_air)

        print(f"📡 Sensor update — kadar_air: {data_sensor['kadar_air']}%")
        return jsonify({'status': 'ok', 'kadar_air': data_sensor['kadar_air']})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/status', methods=['GET'])
def status():
    """Cek status server dan nilai sensor terkini."""
    return jsonify({
        'status':    'server berjalan',
        'model':     'loaded' if model is not None else 'not loaded',
        'classes':   list(label_encoder.classes_) if label_encoder else [],
        'kadar_air': data_sensor['kadar_air']
    })


# =====================
# MAIN
# =====================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    print(f"🚀 Server berjalan di http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)