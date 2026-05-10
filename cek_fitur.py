import joblib
import numpy as np
import cv2

m   = joblib.load('model/rf_model.pkl')
img = np.zeros((64,64,3), dtype=np.uint8)

features = []

for ch in cv2.split(img):
    features.extend([np.mean(ch), np.std(ch), np.min(ch), np.max(ch)])

hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
for ch in cv2.split(hsv):
    features.extend([np.mean(ch), np.std(ch), np.min(ch), np.max(ch)])

lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
for ch in cv2.split(lab):
    features.extend([np.mean(ch), np.std(ch)])

features.append(70.0)

arr = np.array(features).reshape(1, -1)

print('Fitur dikirim    :', arr.shape[1])
print('Fitur dibutuhkan :', m.n_features_in_)
print('Cocok            :', arr.shape[1] == m.n_features_in_)

try:
    pred = m.predict(arr)
    print('Prediksi berhasil:', pred)
except Exception as e:
    print('Error prediksi   :', e)