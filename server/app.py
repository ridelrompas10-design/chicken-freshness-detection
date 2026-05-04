from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import numpy as np
import joblib
import cv2
import os

# =====================
# SETUP PATH
# =====================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

STATIC_DIR = os.path.join(BASE_DIR, '../static')
MODEL_PATH = os.path.join(BASE_DIR, '../model/rf_model.pkl')
ENCODER_PATH = os.path.join(BASE_DIR, '../model/label_encoder.pkl')

app = Flask(__name__, static_folder=STATIC_DIR)
CORS(app)

# =====================
# LOAD MODEL (AMAN)
# =====================
try:
    model = joblib.load(MODEL_PATH)
    label_encoder = joblib.load(ENCODER_PATH)
    print("✅ Model loaded successfully")
except Exception as e:
    print("❌ Gagal load model:", e)
    model = None
    label_encoder = None

# =====================
# DATA SENSOR
# =====================
data_sensor = {'kadar_air': 0}

# =====================
# FEATURE EXTRACTION
# =====================
def extract_features(img):
    img = cv2.resize(img, (64, 64))
    features = []

    # RGB
    for ch in cv2.split(img):
        features.extend([
            float(np.mean(ch)), float(np.std(ch)),
            float(np.min(ch)),  float(np.max(ch))
        ])

    # HSV
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    for ch in cv2.split(hsv):
        features.extend([
            float(np.mean(ch)), float(np.std(ch)),
            float(np.min(ch)),  float(np.max(ch))
        ])

    # LAB
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    for ch in cv2.split(lab):
        features.extend([
            float(np.mean(ch)), float(np.std(ch))
        ])

    return np.array(features, dtype=np.float32).reshape(1, -1)

# =====================
# HITUNG KETAHANAN
# =====================
def hitung_ketahanan(label, conf):
    base = {'Segar': 72, 'Setengah': 24, 'Busuk': 0}
    jam = int(base.get(label, 0) * (conf / 100) * 1.1)

    if jam >= 48:
        return f"{jam//24} hari", "Simpan di kulkas 0-4°C"
    elif jam >= 1:
        return f"{jam} jam", "Segera masak atau simpan di kulkas"
    else:
        return "0", "Tidak layak dikonsumsi"

# =====================
# ROUTES
# =====================
@app.route('/')
def index():
    return send_from_directory(STATIC_DIR, 'index.html')

@app.route('/predict', methods=['POST'])
def predict():
    if model is None:
        return jsonify({'error': 'Model belum diload'}), 500

    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image uploaded'}), 400

        file = request.files['image']
        img_bytes = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(img_bytes, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({'error': 'Gambar tidak valid'}), 400

        features = extract_features(img)
        pred = model.predict(features)
        proba = model.predict_proba(features)[0]

        label = label_encoder.inverse_transform(pred)[0]
        conf = float(np.max(proba) * 100)

        durasi, saran = hitung_ketahanan(label, conf)

        return jsonify({
            'label': label,
            'confidence': round(conf, 2),
            'durasi': durasi,
            'saran': saran,
            'kadar_air': data_sensor['kadar_air'],
            'detail': {
                cls: round(float(p * 100), 2)
                for cls, p in zip(label_encoder.classes_, proba)
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/sensor', methods=['POST'])
def sensor():
    try:
        body = request.get_json()
        data_sensor['kadar_air'] = body.get('kadar_air', 0)

        print(f"Sensor update: kadar_air = {data_sensor['kadar_air']}")
        return jsonify({'status': 'ok'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/status', methods=['GET'])
def status():
    return jsonify({
        'status': 'server berjalan',
        'kadar_air': data_sensor['kadar_air']
    })

# =====================
# MAIN
# =====================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)