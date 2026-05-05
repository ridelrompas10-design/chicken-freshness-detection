const SERVER = ''
let stream   = null
let cameraOn = false
const video  = document.getElementById('video')

// JAM
setInterval(() => {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('id-ID')
}, 1000)

// UPDATE SENSOR TIAP 2 DETIK
async function updateSensor() {
  try {
    const res  = await fetch(SERVER + '/sensor-status')
    const d    = await res.json()

    if (d.valid) {
      setTxt('sdot',  'dot on',  true)
      setTxt('stxt',  'Terhubung')
      setTxt('s1',    d.sensor_1 + '%')
      setTxt('s2',    d.sensor_2 + '%')
      setTxt('s3',    d.sensor_3 + '%')
      setTxt('avg',   d.rata_rata + '%')
      setTxt('kondisi', d.kondisi)
      setTxt('waktu',   d.waktu)

      // Warna berdasarkan nilai
      warnaVal('avg', d.rata_rata)
      warnaVal('s1',  d.sensor_1)
      warnaVal('s2',  d.sensor_2)
      warnaVal('s3',  d.sensor_3)

      // Warning beku
      const w = document.getElementById('swarn')
      if (d.rata_rata > 92) {
        w.style.display = 'block'
        w.textContent   = 'Daging kemungkinan masih beku. Tunggu 5-10 menit.'
      } else {
        w.style.display = 'none'
      }
    } else {
      setTxt('sdot', 'dot off', true)
      setTxt('stxt', 'Tidak terhubung')
    }
  } catch(e) {
    setTxt('stxt', 'Offline')
  }
}

setInterval(updateSensor, 2000)
updateSensor()

// HELPER
function setTxt(id, val, isClass = false) {
  const el = document.getElementById(id)
  if (!el) return
  if (isClass) el.className = val
  else el.textContent = val
}

function warnaVal(id, val) {
  const el = document.getElementById(id)
  if (!el) return
  if      (val >= 75) el.style.color = '#22c55e'
  else if (val >= 60) el.style.color = '#f97316'
  else                el.style.color = '#ef4444'
}

// KAMERA
async function toggleCamera() {
  const btn = document.getElementById('btn-cam')
  if (!cameraOn) {
    try {
      stream          = await navigator.mediaDevices.getUserMedia({ video: true })
      video.srcObject = stream
      cameraOn        = true
      btn.textContent = 'Kamera OFF'
      setBadge('Kamera aktif', 'badge on')
    } catch(e) {
      alert('Gagal akses kamera: ' + e.message)
    }
  } else {
    if (stream) stream.getTracks().forEach(t => t.stop())
    video.srcObject = null
    cameraOn        = false
    btn.textContent = 'Kamera ON'
    setBadge('Kamera belum aktif', 'badge off')
  }
}

function setBadge(txt, cls) {
  const el    = document.getElementById('badge')
  el.textContent = txt
  el.className   = cls
}

function captureFrame() {
  const c   = document.createElement('canvas')
  c.width   = video.videoWidth
  c.height  = video.videoHeight
  c.getContext('2d').drawImage(video, 0, 0)
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.9))
}

// PREDIKSI
async function predict() {
  if (!cameraOn) { alert('Nyalakan kamera dulu!'); return }
  setBadge('Menganalisis...', 'badge off')

  const blob = await captureFrame()
  const fd   = new FormData()
  fd.append('image', blob, 'frame.jpg')

  try {
    const res  = await fetch(SERVER + '/predict', { method: 'POST', body: fd })
    const d    = await res.json()
    if (d.error) { alert('Error: ' + d.error); return }
    tampilHasil(d)
    setBadge('Prediksi selesai', 'badge on')
  } catch(e) {
    alert('Gagal koneksi ke server: ' + e.message)
  }
}

// TAMPIL HASIL
function tampilHasil(d) {
  const warna = { Segar:'#22c55e', Setengah:'#f97316', Busuk:'#ef4444' }
  const wc    = warna[d.label] || '#aaa'

  const lbl      = document.getElementById('hlabel')
  lbl.textContent = d.label ? d.label.toUpperCase() : '-'
  lbl.style.color = wc
  lbl.className   = 'result-label'

  setTxt('hconf',    'Keyakinan: ' + d.confidence + '%')
  setTxt('hsumber',  d.sumber || '')

  const det = d.detail_kamera || {}
  setTxt('vsegar',    (det['Segar']    || 0).toFixed(1) + '%')
  setTxt('vsetengah', (det['Setengah'] || 0).toFixed(1) + '%')
  setTxt('vbusuk',    (det['Busuk']    || 0).toFixed(1) + '%')

  const dv      = document.getElementById('durasi')
  dv.textContent = d.durasi || '-'
  dv.style.color = wc
  setTxt('saran',  d.saran    || '')
  setTxt('est',    d.estimasi ? 'Estimasi: ' + d.estimasi : '')
  setTxt('sumber', d.sumber   || '-')
}