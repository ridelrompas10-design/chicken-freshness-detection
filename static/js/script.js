const SERVER = ''
let stream   = null
let cameraOn = false
const video  = document.getElementById('video')

// =====================
// JAM REAL-TIME
// =====================
setInterval(() => {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('id-ID')
}, 1000)

// =====================
// UPDATE SENSOR OTOMATIS
// =====================
async function updateSensor() {
  try {
    const res  = await fetch(SERVER + '/sensor-status')
    const data = await res.json()

    if (data.valid) {
      setEl('sensor-dot',         'status-dot dot-on',  true)
      setEl('sensor-status-text', 'Terhubung')

      setVal('s1-val',  data.sensor_1 + '%')
      setVal('s2-val',  data.sensor_2 + '%')
      setVal('s3-val',  data.sensor_3 + '%')
      setVal('avg-val', data.rata_rata + '%')

      setBar('s1-bar',  data.sensor_1)
      setBar('s2-bar',  data.sensor_2)
      setBar('s3-bar',  data.sensor_3)

      warnaSensor('s1-val',  data.sensor_1)
      warnaSensor('s2-val',  data.sensor_2)
      warnaSensor('s3-val',  data.sensor_3)
      warnaSensor('avg-val', data.rata_rata)

      const warn = document.getElementById('sensor-warning')
      if (data.rata_rata > 92) {
        warn.style.display = 'block'
        warn.textContent   = 'Kemungkinan daging masih beku. Tunggu 5-10 menit.'
      } else {
        warn.style.display = 'none'
      }

      setVal('kondisi-sensor', data.kondisi)
      setVal('waktu-sensor',   data.waktu)

    } else {
      setEl('sensor-dot',         'status-dot dot-off', true)
      setVal('sensor-status-text', 'Tidak terhubung')
    }
  } catch(e) {
    setVal('sensor-status-text', 'Offline')
  }
}

setInterval(updateSensor, 2000)
updateSensor()

// =====================
// HELPER FUNGSI
// =====================
function setVal(id, val) {
  const el = document.getElementById(id)
  if (el) el.textContent = val
}

function setEl(id, val, isClass = false) {
  const el = document.getElementById(id)
  if (!el) return
  if (isClass) el.className = val
  else el.textContent = val
}

function setBar(id, persen) {
  const el = document.getElementById(id)
  if (el) el.style.width = Math.min(persen, 100) + '%'
}

function warnaSensor(id, val) {
  const el = document.getElementById(id)
  if (!el) return
  if      (val >= 75) el.style.color = '#22c55e'
  else if (val >= 60) el.style.color = '#f97316'
  else                el.style.color = '#ef4444'
}

// =====================
// KAMERA
// =====================
async function toggleCamera() {
  const btn = document.getElementById('btn-cam')
  if (!cameraOn) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true })
      video.srcObject = stream
      cameraOn        = true
      btn.textContent = 'Kamera OFF'
      setBadge('Kamera aktif', 'badge-on')
    } catch(e) {
      alert('Gagal akses kamera: ' + e.message)
    }
  } else {
    if (stream) stream.getTracks().forEach(t => t.stop())
    video.srcObject = null
    cameraOn        = false
    btn.textContent = 'Kamera ON'
    setBadge('Kamera belum aktif', 'badge-off')
  }
}

function setBadge(text, cls) {
  const el    = document.getElementById('cam-badge')
  el.textContent = text
  el.className   = 'cam-badge ' + cls
}

function captureFrame() {
  const canvas  = document.createElement('canvas')
  canvas.width  = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d').drawImage(video, 0, 0)
  return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9))
}

// =====================
// DETEKSI SAJA
// =====================
async function detectOnly() {
  if (!cameraOn) { alert('Nyalakan kamera dulu!'); return }
  const blob = await captureFrame()
  const fd   = new FormData()
  fd.append('image', blob, 'frame.jpg')
  try {
    const res  = await fetch(SERVER + '/predict', { method: 'POST', body: fd })
    const data = await res.json()
    if (data.label) setBadge('Terdeteksi: ' + data.label, 'badge-on')
  } catch(e) {
    alert('Error: ' + e.message)
  }
}

// =====================
// PREDIKSI LENGKAP
// =====================
async function predict() {
  if (!cameraOn) { alert('Nyalakan kamera dulu!'); return }
  setBadge('Menganalisis...', 'badge-off')

  const blob = await captureFrame()
  const fd   = new FormData()
  fd.append('image', blob, 'frame.jpg')

  try {
    const res  = await fetch(SERVER + '/predict', { method: 'POST', body: fd })
    const data = await res.json()
    if (data.error) { alert('Error: ' + data.error); return }
    tampilHasil(data)
    setBadge('Prediksi selesai', 'badge-on')
  } catch(e) {
    alert('Gagal koneksi ke server: ' + e.message)
  }
}

// =====================
// TAMPIL HASIL
// =====================
function tampilHasil(data) {
  const warna = {
    'Segar'   : '#22c55e',
    'Setengah': '#f97316',
    'Busuk'   : '#ef4444'
  }
  const wc = warna[data.label] || '#aaa'

  // Label utama
  const lbl      = document.getElementById('hasil-label')
  lbl.textContent = data.label.toUpperCase()
  lbl.style.color = wc

  setVal('hasil-conf',   'Keyakinan: ' + data.confidence + '%')
  setVal('hasil-sumber', data.sumber || '')

  // Bar detail
  const det = data.detail_kamera || {}
  setBar('bar-segar',    det['Segar']    || 0)
  setBar('bar-setengah', det['Setengah'] || 0)
  setBar('bar-busuk',    det['Busuk']    || 0)
  setVal('val-segar',    (det['Segar']    || 0).toFixed(1) + '%')
  setVal('val-setengah', (det['Setengah'] || 0).toFixed(1) + '%')
  setVal('val-busuk',    (det['Busuk']    || 0).toFixed(1) + '%')

  // Ketahanan
  const dv      = document.getElementById('durasi-val')
  dv.textContent = data.durasi || '-'
  dv.style.color = wc
  setVal('durasi-saran', data.saran    || '')
  setVal('durasi-est',   data.estimasi ? 'Estimasi: ' + data.estimasi : '')

  // Sumber info
  setVal('sumber-info', data.sumber || '-')
}