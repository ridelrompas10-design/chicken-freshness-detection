const SERVER = ''
let stream      = null
let cameraOn    = false
let uploadedBlob = null
let activeTab   = 'cam'
const video     = document.getElementById('video')

// =====================
// JAM
// =====================
setInterval(() => {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('id-ID')
}, 1000)

// =====================
// UPDATE SENSOR TIAP 2 DETIK
// =====================
async function updateSensor() {
  try {
    const res = await fetch(SERVER + '/sensor-status')
    const d   = await res.json()

    if (d.valid) {
      setTxt('sdot', 'dot on', true)
      setTxt('stxt', 'Terhubung')
      setTxt('s1',   d.sensor_1 + '%')
      setTxt('s2',   d.sensor_2 + '%')
      setTxt('s3',   d.sensor_3 + '%')
      setTxt('avg',  d.rata_rata + '%')
      setTxt('kondisi', d.kondisi)
      setTxt('waktu',   d.waktu)

      warnaVal('avg', d.rata_rata)
      warnaVal('s1',  d.sensor_1)
      warnaVal('s2',  d.sensor_2)
      warnaVal('s3',  d.sensor_3)

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

// =====================
// HELPER
// =====================
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

function setBadge(txt, cls) {
  const el       = document.getElementById('badge')
  el.textContent = txt
  el.className   = cls
}

// =====================
// TAB SWITCHER
// =====================
function switchTab(tab) {
  activeTab = tab
  document.getElementById('panel-cam').style.display    = tab === 'cam'    ? 'block' : 'none'
  document.getElementById('panel-upload').style.display = tab === 'upload' ? 'block' : 'none'
  document.getElementById('tab-cam').classList.toggle('active',    tab === 'cam')
  document.getElementById('tab-upload').classList.toggle('active', tab === 'upload')

  // Matikan kamera jika pindah ke upload
  if (tab === 'upload' && cameraOn) {
    if (stream) stream.getTracks().forEach(t => t.stop())
    video.srcObject = null
    cameraOn        = false
    document.getElementById('btn-cam').textContent = 'Kamera ON'
    setBadge('Kamera belum aktif', 'badge off')
    document.getElementById('cam-select-row').style.display = 'none'
  }
}

// =====================
// KAMERA — deteksi & pilih kamera
// =====================
async function listKamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cameras = devices.filter(d => d.kind === 'videoinput')
    const sel     = document.getElementById('cam-select')
    sel.innerHTML = ''
    cameras.forEach((cam, i) => {
      const opt   = document.createElement('option')
      opt.value   = cam.deviceId
      opt.textContent = cam.label || `Kamera ${i + 1}`
      sel.appendChild(opt)
    })
    document.getElementById('cam-select-row').style.display =
      cameras.length > 1 ? 'flex' : 'none'
  } catch(e) {
    console.warn('Gagal list kamera:', e)
  }
}

async function gantiKamera() {
  if (!cameraOn) return
  const deviceId = document.getElementById('cam-select').value
  if (stream) stream.getTracks().forEach(t => t.stop())
  try {
    stream          = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }
    })
    video.srcObject = stream
  } catch(e) {
    alert('Gagal ganti kamera: ' + e.message)
  }
}

async function toggleCamera() {
  const btn = document.getElementById('btn-cam')
  if (!cameraOn) {
    try {
      // Minta izin dulu untuk dapat label kamera
      stream          = await navigator.mediaDevices.getUserMedia({ video: true })
      video.srcObject = stream
      cameraOn        = true
      btn.textContent = 'Kamera OFF'
      setBadge('Kamera aktif', 'badge on')
      await listKamera()
    } catch(e) {
      alert('Gagal akses kamera: ' + e.message)
    }
  } else {
    if (stream) stream.getTracks().forEach(t => t.stop())
    video.srcObject = null
    cameraOn        = false
    btn.textContent = 'Kamera ON'
    setBadge('Kamera belum aktif', 'badge off')
    document.getElementById('cam-select-row').style.display = 'none'
  }
}

function captureFrame() {
  const c   = document.createElement('canvas')
  c.width   = video.videoWidth
  c.height  = video.videoHeight
  c.getContext('2d').drawImage(video, 0, 0)
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.9))
}

// =====================
// PREDIKSI KAMERA
// =====================
async function predict() {
  if (!cameraOn) { alert('Nyalakan kamera dulu!'); return }
  setBadge('Menganalisis...', 'badge off')

  const blob = await captureFrame()
  const fd   = new FormData()
  fd.append('image', blob, 'frame.jpg')

  try {
    const res = await fetch(SERVER + '/predict', { method: 'POST', body: fd })
    const d   = await res.json()
    if (d.error) { alert('Error: ' + d.error); return }
    tampilHasil(d)
    setBadge('Prediksi selesai', 'badge on')
  } catch(e) {
    alert('Gagal koneksi ke server: ' + e.message)
  }
}

// =====================
// UPLOAD FOTO
// =====================
function handleFile(event) {
  const file = event.target.files[0]
  if (!file) return
  tampilPreview(file)
}

function handleDrop(event) {
  event.preventDefault()
  const file = event.dataTransfer.files[0]
  if (!file || !file.type.startsWith('image/')) {
    alert('Hanya file gambar yang didukung!')
    return
  }
  tampilPreview(file)
}

function tampilPreview(file) {
  uploadedBlob = file
  const reader = new FileReader()
  reader.onload = (e) => {
    const img  = document.getElementById('preview-img')
    img.src    = e.target.result
    img.style.display = 'block'
    document.getElementById('upload-placeholder').style.display = 'none'
    document.getElementById('btn-hapus').style.display = 'inline-flex'

    // Tampilkan nama file
    const badge         = document.getElementById('upload-badge')
    badge.style.display = 'block'
    badge.className     = 'badge on'
    badge.textContent   = '✅ ' + file.name
  }
  reader.readAsDataURL(file)
}

function hapusFoto() {
  uploadedBlob = null
  document.getElementById('preview-img').style.display = 'none'
  document.getElementById('preview-img').src = ''
  document.getElementById('upload-placeholder').style.display = 'block'
  document.getElementById('btn-hapus').style.display = 'none'
  document.getElementById('file-input').value = ''

  const badge         = document.getElementById('upload-badge')
  badge.style.display = 'none'
  badge.textContent   = ''

  // Reset hasil prediksi
  resetHasil()
}

// =====================
// PREDIKSI UPLOAD
// =====================
async function predictUpload() {
  if (!uploadedBlob) {
    alert('Upload foto daging dulu!')
    return
  }

  const badge         = document.getElementById('upload-badge')
  badge.style.display = 'block'
  badge.className     = 'badge off'
  badge.textContent   = 'Menganalisis foto...'

  const fd = new FormData()
  fd.append('image', uploadedBlob, 'upload.jpg')

  try {
    const res = await fetch(SERVER + '/predict', { method: 'POST', body: fd })
    const d   = await res.json()
    if (d.error) {
      badge.className   = 'badge off'
      badge.textContent = '❌ Error: ' + d.error
      return
    }
    tampilHasil(d)
    badge.className   = 'badge on'
    badge.textContent = '✅ Prediksi selesai'
  } catch(e) {
    badge.className   = 'badge off'
    badge.textContent = '❌ Gagal koneksi: ' + e.message
  }
}

// =====================
// TAMPIL HASIL
// =====================
function tampilHasil(d) {
  const warna = {
    'Segar'          : '#22c55e',
    'Setengah Segar' : '#f97316',
    'Busuk'          : '#ef4444'
  }
  const wc = warna[d.label] || '#aaa'

  const lbl       = document.getElementById('hlabel')
  lbl.textContent = d.label ? d.label.toUpperCase() : '-'
  lbl.style.color = wc
  lbl.className   = 'result-label'

  setTxt('hconf',   'Keyakinan: ' + d.confidence + '%')
  setTxt('hsumber', d.sumber || '')

  const det = d.detail_kamera || {}
  setTxt('vsegar',    (det['Segar']            || 0).toFixed(1) + '%')
  setTxt('vsetengah', (det['Setengah Segar']   || det['Setengah'] || 0).toFixed(1) + '%')
  setTxt('vbusuk',    (det['Busuk']            || 0).toFixed(1) + '%')

  const dv       = document.getElementById('durasi')
  dv.textContent = d.durasi || '-'
  dv.style.color = wc

  setTxt('saran',  d.saran    || '')
  setTxt('est',    d.estimasi ? 'Estimasi: ' + d.estimasi : '')
  setTxt('sumber', d.sumber   || '-')
}

// =====================
// RESET HASIL
// =====================
function resetHasil() {
  setTxt('hlabel',   '-')
  setTxt('hconf',    '')
  setTxt('hsumber',  '')
  setTxt('vsegar',   '- %')
  setTxt('vsetengah','- %')
  setTxt('vbusuk',   '- %')
  setTxt('durasi',   '-')
  setTxt('saran',    '')
  setTxt('est',      '')
  setTxt('sumber',   '')
  document.getElementById('hlabel').style.color = ''
  document.getElementById('durasi').style.color = ''
}