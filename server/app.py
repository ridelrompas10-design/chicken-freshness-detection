from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import numpy as np
import joblib
import cv2
import os

# =====================
# SETUP PATH (AMAN UNTUK DEPLOY)
# =====================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, '../static')
)
CORS(app)

# =====================
# LOAD MODEL (FIX PATH)
# =====================
model = joblib.load(os.path.join(BASE_DIR, '../model/rf_model.pkl'))
label_encoder = joblib.load(os.path.join(BASE_DIR, '../model/label_encoder.pkl'))

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
            np.mean(ch), np.std(ch),
            np.min(ch),  np.max(ch)
        ])

    # HSV
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    for ch in cv2.split(hsv):
        features.extend([
            np.mean(ch), np.std(ch),
            np.min(ch),  np.max(ch)
        ])

    # LAB
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    for ch in cv2.split(lab):
        features.extend([
            np.mean(ch), np.std(ch)
        ])

    return np.array(features).reshape(1, -1)

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
# ROUTES
# =====================

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/predict', methods=['POST'])
def predict():
    try:
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
        body = request.json
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
    app.run(host='0.0.0.0', port=port, debug=False)