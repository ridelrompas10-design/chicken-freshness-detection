const SERVER = 'https://web-production-d351a.up.railway.app'

let stream = null
let cameraOn = false
let uploadedBlob = null

const $ = id => document.getElementById(id)
const video = $('video')


// ======================
// JAM REALTIME
// ======================
setInterval(() => {
  $('clock').textContent =
    new Date().toLocaleTimeString('id-ID')
}, 1000)


// ======================
// UPDATE SENSOR REALTIME
// ======================
async function updateSensor() {

  try {

    const res = await fetch(SERVER + '/sensor-status')
    const d = await res.json()

    // STATUS
    $('sdot').className = d.valid ? 'dot on' : 'dot off'
    $('stxt').textContent = d.valid ? 'Terhubung' : 'Offline'

    // SENSOR
    const s1 = Number(d.sensor_1 || 0)
    const s2 = Number(d.sensor_2 || 0)
    const s3 = Number(d.sensor_3 || 0)
    const avg = Number(d.rata_rata || 0)

    $('s1').textContent = s1.toFixed(1) + '%'
    $('s2').textContent = s2.toFixed(1) + '%'
    $('s3').textContent = s3.toFixed(1) + '%'
    $('avg').textContent = avg.toFixed(1) + '%'

    warnaVal('s1', s1)
    warnaVal('s2', s2)
    warnaVal('s3', s3)
    warnaVal('avg', avg)

    // KONDISI
    $('kondisi').textContent = d.kondisi || '-'
    $('waktu').textContent = d.waktu || '-'

    // WARNING
    $('swarn').style.display =
      avg > 92 ? 'block' : 'none'

    $('swarn').textContent =
      'Daging kemungkinan masih beku. Tunggu 5-10 menit.'

  } catch (e) {

    $('stxt').textContent = 'Offline'
    $('sdot').className = 'dot off'
  }
}

setInterval(updateSensor, 2000)
updateSensor()


// ======================
// WARNA SENSOR
// ======================
function warnaVal(id, val) {

  const el = $(id)

  el.style.color =
    val >= 75 ? '#22c55e' :
    val >= 60 ? '#f97316' :
                 '#ef4444'
}


// ======================
// BADGE KAMERA
// ======================
function badge(text, type='off') {

  $('badge').textContent = text
  $('badge').className = 'badge ' + type
}


// ======================
// SWITCH TAB
// ======================
function switchTab(tab) {

  $('panel-cam').style.display =
    tab === 'cam' ? 'block' : 'none'

  $('panel-upload').style.display =
    tab === 'upload' ? 'block' : 'none'

  $('tab-cam').classList.toggle(
    'active',
    tab === 'cam'
  )

  $('tab-upload').classList.toggle(
    'active',
    tab === 'upload'
  )

  // MATIKAN KAMERA SAAT PINDAH
  if (tab === 'upload' && cameraOn)
    toggleCamera()
}


// ======================
// TOGGLE CAMERA
// ======================
async function toggleCamera() {

  const btn = $('btn-cam')

  if (!cameraOn) {

    try {

      stream =
        await navigator.mediaDevices.getUserMedia({
          video: true
        })

      video.srcObject = stream

      cameraOn = true

      btn.textContent = 'Kamera OFF'

      badge('Kamera aktif', 'on')

    } catch (e) {

      alert('Gagal akses kamera')
    }

  } else {

    stream?.getTracks()
      .forEach(t => t.stop())

    video.srcObject = null

    cameraOn = false

    btn.textContent = 'Kamera ON'

    badge('Kamera belum aktif')
  }
}


// ======================
// CAPTURE FRAME
// ======================
function captureFrame() {

  const canvas =
    document.createElement('canvas')

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  canvas
    .getContext('2d')
    .drawImage(video, 0, 0)

  return new Promise(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9)
  )
}


// ======================
// PREDICT
// ======================
async function predict(blob = null) {

  if (!blob && !cameraOn) {
    alert('Nyalakan kamera dulu!')
    return
  }

  badge('Menganalisis...')

  if (!blob)
    blob = await captureFrame()

  const fd = new FormData()
  fd.append('image', blob, 'img.jpg')

  try {

    const res = await fetch(SERVER + '/predict', {
      method: 'POST',
      body: fd
    })

    const text = await res.text()
    console.log("RESPONSE:", text)

    let d
    try {
      d = JSON.parse(text)
    } catch {
      throw new Error("Response bukan JSON")
    }

    if (d.error) {
      alert(d.error)
      return
    }

    tampilHasil(d)
    badge('Prediksi selesai', 'on')

  } catch (e) {

    console.error("ERROR:", e)
    alert('Server error / response invalid')
  }
}


// ======================
// HANDLE FILE
// ======================
function handleFile(e) {

  const file = e.target.files[0]

  if (!file) return

  tampilPreview(file)
}


// ======================
// DRAG DROP
// ======================
function handleDrop(e) {

  e.preventDefault()

  const file = e.dataTransfer.files[0]

  if (!file ||
      !file.type.startsWith('image/')) {

    alert('File harus gambar')
    return
  }

  tampilPreview(file)
}


// ======================
// PREVIEW
// ======================
function tampilPreview(file) {

  uploadedBlob = file

  $('preview-img').src =
    URL.createObjectURL(file)

  $('preview-img').style.display = 'block'

  $('upload-placeholder').style.display = 'none'

  $('btn-hapus').style.display = 'inline-flex'

  $('upload-badge').style.display = 'block'

  $('upload-badge').className = 'badge on'

  $('upload-badge').textContent =
    '✅ ' + file.name
}


// ======================
// PREDICT UPLOAD
// ======================
function predictUpload() {

  if (!uploadedBlob)
    return alert('Upload foto dulu!')

  predict(uploadedBlob)
}


// ======================
// HAPUS FOTO
// ======================
function hapusFoto() {

  uploadedBlob = null

  $('preview-img').style.display = 'none'

  $('preview-img').src = ''

  $('upload-placeholder').style.display = 'block'

  $('btn-hapus').style.display = 'none'

  $('upload-badge').style.display = 'none'

  $('file-input').value = ''

  resetHasil()
}


// ======================
// TAMPIL HASIL
// ======================
function tampilHasil(d) {

  // =====================================
  // WARNA LABEL
  // =====================================
  const warna = {

    'segar': '#22c55e',
    'cukup_segar': '#f97316',
    'busuk': '#ef4444'
  }

  const label =
    String(d.label || '').toLowerCase()

  const c = warna[label] || '#aaa'

  // =====================================
  // FORMAT LABEL
  // =====================================
  const formatLabel = {

    'segar': 'SEGAR',
    'cukup_segar': 'CUKUP SEGAR',
    'busuk': 'BUSUK'
  }

  $('hlabel').textContent =
    formatLabel[label] || '-'

  $('hlabel').style.color = c

  // =====================================
  // CONFIDENCE
  // =====================================
  $('hconf').textContent =
    'Keyakinan: ' +
    Number(d.confidence || 0).toFixed(1) +
    '%'

  // =====================================
  // SUMBER
  // =====================================
  $('hsumber').textContent =
    d.sumber || '-'

  // =====================================
  // DETAIL MODEL
  // =====================================
  const det = d.detail_kamera || {}

  $('vsegar').textContent =
    Number(det['segar'] || 0).toFixed(1) + '%'

  $('vsetengah').textContent =
    Number(det['cukup_segar'] || 0).toFixed(1) + '%'

  $('vbusuk').textContent =
    Number(det['busuk'] || 0).toFixed(1) + '%'

  // =====================================
  // DURASI
  // =====================================
  $('durasi').textContent =
    d.durasi || '-'

  $('durasi').style.color = c

  // =====================================
  // SARAN
  // =====================================
  $('saran').textContent =
    d.saran || '-'

  // =====================================
  // ESTIMASI
  // =====================================
  $('est').textContent =
    d.estimasi
      ? 'Estimasi: ' + d.estimasi
      : '-'

  // =====================================
  // SUMBER FINAL
  // =====================================
  $('sumber').textContent =
    d.sumber || '-'
}


// ======================
// RESET HASIL
// ======================
function resetHasil() {

  $('hlabel').textContent = '-'
  $('hconf').textContent = '-'
  $('hsumber').textContent = '-'

  $('vsegar').textContent = '- %'
  $('vsetengah').textContent = '- %'
  $('vbusuk').textContent = '- %'

  $('durasi').textContent = '-'
  $('saran').textContent = '-'
  $('est').textContent = '-'
  $('sumber').textContent = '-'

  $('hlabel').style.color = '#fff'
  $('durasi').style.color = '#fff'
}