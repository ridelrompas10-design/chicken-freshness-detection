from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import numpy as np
import joblib
import cv2
import os

# =====================
# SETUP PATH
# =====================
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR   = os.path.join(BASE_DIR, '../static')
MODEL_PATH   = os.path.join(BASE_DIR, '../model/rf_model.pkl')
ENCODER_PATH = os.path.join(BASE_DIR, '../model/label_encoder.pkl')

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='/static')
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
# DATA SENSOR
# sensor_connected = False  → ESP32 belum kirim data
# sensor_connected = True   → ESP32 sudah pernah kirim data
# =====================
data_sensor = {
    'kadar_air':        50.0,   # nilai fallback untuk model
    'sensor_connected': False   # FIX: status koneksi sensor
}

# =====================
# FEATURE EXTRACTION (30 fitur visual)
# =====================
def extract_features(img):
    img = cv2.resize(img, (64, 64))
    features = []

    # RGB
    for channel in cv2.split(img):
        features.extend([
            float(np.mean(channel)),
            float(np.std(channel)),
            float(np.min(channel)),
            float(np.max(channel))
        ])

    # HSV
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    for channel in cv2.split(hsv):
        features.extend([
            float(np.mean(channel)),
            float(np.std(channel)),
            float(np.min(channel)),
            float(np.max(channel))
        ])

    # LAB
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    for channel in cv2.split(lab):
        features.extend([
            float(np.mean(channel)),
            float(np.std(channel))
        ])

    return np.array(features, dtype=np.float32)  # shape: (30,)

# =====================
# INFO KETAHANAN
# =====================
KETAHANAN_INFO = {
    'segar': {
        'base_jam': 72,
        'saran': 'Simpan di kulkas 0-4°C. Tahan hingga 3 hari.'
    },
    'cukup_segar': {
        'base_jam': 24,
        'saran': 'Daging mulai menurun kualitasnya. Segera masak dalam 24 jam.'
    },
    'busuk': {
        'base_jam': 0,
        'saran': 'Tidak layak dikonsumsi. Buang segera.'
    }
}

def hitung_ketahanan(label, conf_pct):
    info = KETAHANAN_INFO.get(label, {'base_jam': 0, 'saran': '-'})

    # Logika ketahanan per label:
    # - busuk      → selalu 0, tidak peduli confidence
    # - cukup_segar → 0–24 jam proporsional dengan confidence
    # - segar       → 24–72 jam proporsional dengan confidence
    if label == 'busuk':
        return "Tidak layak konsumsi", info['saran']

    base = info['base_jam']  # segar=72, cukup_segar=24

    if label == 'segar':
        # confidence 30% → 24 jam, confidence 100% → 72 jam
        jam = int(24 + (base - 24) * (conf_pct / 100))
    elif label == 'cukup_segar':
        # confidence 30% → 6 jam, confidence 100% → 24 jam
        jam = int(6 + (base - 6) * (conf_pct / 100))
    else:
        jam = int(base * (conf_pct / 100))

    jam = max(0, min(jam, base))  # clamp antara 0 dan base

    if jam >= 48:
        durasi = f"{jam // 24} hari ({jam} jam)"
    elif jam >= 1:
        durasi = f"{jam} jam"
    else:
        durasi = "0 jam"

    return durasi, info['saran']

# =====================
# LABEL UI
# =====================
LABEL_DISPLAY = {
    'segar':       {'text': 'Segar',       'color': '#22c55e'},
    'cukup_segar': {'text': 'Cukup Segar', 'color': '#f59e0b'},
    'busuk':       {'text': 'Busuk',       'color': '#ef4444'}
}

# =====================
# ROUTE: INDEX
# =====================
@app.route('/')
def index():
    return send_from_directory(STATIC_DIR, 'index.html')

# =====================
# ROUTE: PREDICT
# =====================
@app.route('/predict', methods=['POST'])
def predict():

    if model is None:
        return jsonify({'error': 'Model belum diload'}), 500

    try:
        if 'image' not in request.files:
            return jsonify({'error': 'Field image tidak ada'}), 400

        file      = request.files['image']
        img_bytes = np.frombuffer(file.read(), np.uint8)
        img       = cv2.imdecode(img_bytes, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({'error': 'Gambar tidak valid'}), 400

        # EXTRACT 30 FITUR VISUAL
        visual_features = extract_features(img)  # shape: (30,)

        # GABUNG MOISTURE DARI SENSOR (fitur ke-31)
        # Jika sensor belum konek, pakai fallback 50.0 agar model tetap jalan
        kadar_air = float(np.clip(data_sensor['kadar_air'], 0, 100))

        final_features = np.concatenate([
            visual_features,
            [kadar_air]
        ]).reshape(1, -1)  # shape: (1, 31)

        print(f"Predict: 30 visual + moisture "
              f"({'sensor' if data_sensor['sensor_connected'] else 'fallback'}: "
              f"{kadar_air:.1f}%) = {final_features.shape[1]} fitur")

        # PREDIKSI
        pred  = model.predict(final_features)
        proba = model.predict_proba(final_features)[0]

        label = label_encoder.inverse_transform(pred)[0]
        conf  = float(np.max(proba) * 100)

        # FIX: THRESHOLD diturunkan ke 30%
        THRESHOLD = 30

        # FIX: kadar_air ke UI — None jika sensor belum konek
        kadar_air_display = (
            round(kadar_air, 1)
            if data_sensor['sensor_connected']
            else None
        )

        if conf < THRESHOLD:
            return jsonify({
                'label':            'bukan_ayam',
                'label_text':       'Bukan Daging Ayam',
                'color':            '#9ca3af',
                'confidence':       round(conf, 2),
                'durasi':           '-',
                'saran':            'Objek tidak dikenali sebagai daging ayam.',
                'kadar_air':        kadar_air_display,
                'sensor_connected': data_sensor['sensor_connected'],
                'detail':           {}
            })

        # HITUNG KETAHANAN
        durasi, saran = hitung_ketahanan(label, conf)

        detail = {
            cls: round(float(p * 100), 2)
            for cls, p in zip(label_encoder.classes_, proba)
        }

        return jsonify({
            'label':            label,
            'label_text':       LABEL_DISPLAY.get(label, {}).get('text', label),
            'color':            LABEL_DISPLAY.get(label, {}).get('color', '#888'),
            'confidence':       round(conf, 2),
            'durasi':           durasi,
            'saran':            saran,
            'kadar_air':        kadar_air_display,
            'sensor_connected': data_sensor['sensor_connected'],
            'detail':           detail
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# =====================
# ROUTE: SENSOR
# Dipanggil ESP32: POST /sensor  Body: {"kadar_air": 35.5}
# =====================
@app.route('/sensor', methods=['POST'])
def sensor():
    try:
        body      = request.get_json(force=True)
        kadar_air = float(body.get('kadar_air', 50.0))
        kadar_air = float(np.clip(kadar_air, 0, 100))

        # FIX: tandai sensor sudah terhubung
        data_sensor['kadar_air']        = kadar_air
        data_sensor['sensor_connected'] = True

        print(f"Sensor terhubung: kadar_air = {kadar_air:.1f}%")

        return jsonify({
            'status':    'ok',
            'kadar_air': kadar_air
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# =====================
# ROUTE: SENSOR RESET
# Untuk testing: simulasi sensor dicabut
# POST /sensor/reset
# =====================
@app.route('/sensor/reset', methods=['POST'])
def sensor_reset():
    data_sensor['kadar_air']        = 50.0
    data_sensor['sensor_connected'] = False
    print("Sensor direset")
    return jsonify({'status': 'ok', 'sensor_connected': False})

# =====================
# ROUTE: STATUS
# =====================
@app.route('/status')
def status():
    return jsonify({
        'status':           'ok',
        'model':            'loaded' if model else 'not loaded',
        'n_features':       model.n_features_in_ if model else None,
        'sensor_connected': data_sensor['sensor_connected'],
        'kadar_air': (
            round(data_sensor['kadar_air'], 1)
            if data_sensor['sensor_connected'] else None
        )
    })

# =====================
# MAIN
# =====================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    # FIX: debug=False di production agar tidak restart terus
    debug = os.environ.get('FLASK_ENV') == 'development'
    print(f"Server jalan di http://localhost:{port} (debug={debug})")
    app.run(host='0.0.0.0', port=port, debug=debug)