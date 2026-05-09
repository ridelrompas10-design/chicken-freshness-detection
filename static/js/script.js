const SERVER = ''

let stream = null
let cameraOn = false
let uploadedBlob = null

const $ = id => document.getElementById(id)
const video = $('video')

// ======================
// JAM
// ======================
setInterval(() => {
  $('clock').textContent =
    new Date().toLocaleTimeString('id-ID')
}, 1000)


// ======================
// SENSOR REALTIME
// ======================
async function updateSensor() {

  try {

    const d = await (await fetch(SERVER + '/sensor-status')).json()

    $('sdot').className = d.valid ? 'dot on' : 'dot off'
    $('stxt').textContent = d.valid ? 'Terhubung' : 'Offline'

    ;['1','2','3'].forEach(i => {

      const val = Number(d[`sensor_${i}`] || 0)

      $(`s${i}`).textContent = val.toFixed(1) + '%'

      warnaVal(`s${i}`, val)
    })

    const avg = Number(d.rata_rata || 0)

    $('avg').textContent = avg.toFixed(1) + '%'

    warnaVal('avg', avg)

    $('kondisi').textContent = d.kondisi || '-'
    $('waktu').textContent = d.waktu || '-'

    $('swarn').style.display =
      avg > 92 ? 'block' : 'none'

    $('swarn').textContent =
      'Daging kemungkinan masih beku. Tunggu 5-10 menit.'

  } catch(e) {

    $('stxt').textContent = 'Offline'
  }
}

setInterval(updateSensor, 2000)
updateSensor()


// ======================
// WARNA SENSOR
// ======================
function warnaVal(id, val) {

  $(id).style.color =
    val >= 75 ? '#ef4444' :
    val >= 60 ? '#f97316' :
                 '#22c55e'
}


// ======================
// BADGE
// ======================
function badge(txt, cls='off') {

  $('badge').textContent = txt
  $('badge').className = 'badge ' + cls
}


// ======================
// SWITCH TAB
// ======================
function switchTab(tab) {

  $('panel-cam').style.display =
    tab === 'cam' ? 'block' : 'none'

  $('panel-upload').style.display =
    tab === 'upload' ? 'block' : 'none'

  $('tab-cam').classList.toggle('active', tab === 'cam')
  $('tab-upload').classList.toggle('active', tab === 'upload')

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

    } catch(e) {

      alert(e.message)
    }

  } else {

    stream?.getTracks().forEach(t => t.stop())

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

  const c = document.createElement('canvas')

  c.width = video.videoWidth
  c.height = video.videoHeight

  c.getContext('2d').drawImage(video,0,0)

  return new Promise(r =>
    c.toBlob(r,'image/jpeg',0.9)
  )
}


// ======================
// PREDICT
// ======================
async function predict(blob=null) {

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

    const d = await (
      await fetch(SERVER + '/predict', {
        method:'POST',
        body:fd
      })
    ).json()

    if (d.error)
      return alert(d.error)

    tampilHasil(d)

    badge('Prediksi selesai', 'on')

  } catch(e) {

    alert(e.message)
  }
}


// ======================
// UPLOAD
// ======================
function handleFile(e) {

  const file = e.target.files[0]

  if (!file) return

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

  $('upload-placeholder').style.display = 'block'

  $('btn-hapus').style.display = 'none'

  $('upload-badge').style.display = 'none'

  resetHasil()
}


// ======================
// TAMPIL HASIL
// ======================
function tampilHasil(d) {

  const warna = {
    'Segar':'#22c55e',
    'Setengah Segar':'#f97316',
    'Busuk':'#ef4444'
  }

  const c = warna[d.label] || '#aaa'

  $('hlabel').textContent =
    d.label?.toUpperCase() || '-'

  $('hlabel').style.color = c

  $('hconf').textContent =
    'Keyakinan: ' + d.confidence + '%'

  $('hsumber').textContent =
    d.sumber || ''

  const det = d.detail_kamera || {}

  $('vsegar').textContent =
    (det['Segar'] || 0).toFixed(1) + '%'

  $('vsetengah').textContent =
    (det['Setengah Segar'] || 0).toFixed(1) + '%'

  $('vbusuk').textContent =
    (det['Busuk'] || 0).toFixed(1) + '%'

  $('durasi').textContent = d.durasi || '-'
  $('durasi').style.color = c

  $('saran').textContent = d.saran || ''

  $('est').textContent =
    d.estimasi ?
    'Estimasi: ' + d.estimasi : ''

  $('sumber').textContent =
    d.sumber || '-'
}


// ======================
// RESET
// ======================
function resetHasil() {

  ;[
    'hlabel','hconf','hsumber',
    'vsegar','vsetengah','vbusuk',
    'durasi','saran','est','sumber'
  ].forEach(id => $(id).textContent = '-')
}