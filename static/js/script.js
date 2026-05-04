let stream = null
let cameraOn = false

const video = document.getElementById('video')
const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')
const cameraSelect = document.getElementById('cameraSelect')

// =====================
// LOAD CAMERA
// =====================
async function loadCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cams = devices.filter(d => d.kind === 'videoinput')

    cameraSelect.innerHTML = ''

    cams.forEach((cam, i) => {
        const option = document.createElement('option')
        option.value = cam.deviceId
        option.text = cam.label || `Kamera ${i+1}`
        cameraSelect.appendChild(option)
    })
}
loadCameras()

// =====================
// TOGGLE CAMERA
// =====================
async function toggleCamera() {
    const btn = document.getElementById('btn-cam')

    if (!cameraOn) {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: cameraSelect.value }
            })

            video.srcObject = stream
            cameraOn = true
            btn.textContent = '🔴 Matikan Kamera'
            btn.style.background = '#ef4444'
            setStatus('🟢 Kamera aktif')

        } catch (e) {
            alert(e.message)
        }
    } else {
        stream.getTracks().forEach(t => t.stop())
        video.srcObject = null
        cameraOn = false
        btn.textContent = '🟢 Nyalakan Kamera'
        btn.style.background = '#22c55e'
        setStatus('🔴 Kamera mati')
    }
}

function setStatus(text) {
    document.getElementById('cam-status').innerText = text
}

// =====================
// CAPTURE
// =====================
function captureFrame() {
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    return new Promise(res => canvas.toBlob(res, 'image/jpeg'))
}

// =====================
// PREDICT CAMERA
// =====================
async function predict() {
    if (!cameraOn) return alert('Nyalakan kamera dulu!')

    const blob = await captureFrame()
    sendToServer(blob)
}

// =====================
// UPLOAD IMAGE
// =====================
async function uploadImage() {
    const file = document.getElementById('fileInput').files[0]
    if (!file) return alert('Pilih gambar dulu!')
    sendToServer(file)
}

// =====================
// SEND DATA
// =====================
async function sendToServer(file) {
    const fd = new FormData()
    fd.append('image', file)

    try {
        const res = await fetch('/predict', {
            method: 'POST',
            body: fd
        })

        const data = await res.json()
        tampilHasil(data)

    } catch (e) {
        alert(e.message)
    }
}

// =====================
// REMOVE IMAGE
// =====================
function removeImage() {
    document.getElementById('fileInput').value = ''
    const img = document.getElementById('previewImg')
    img.style.display = 'none'
    document.getElementById('result').innerHTML = '<p>Belum ada prediksi</p>'
}

// =====================
// PREVIEW
// =====================
document.getElementById('fileInput').addEventListener('change', function() {
    const file = this.files[0]
    if (!file) return

    const img = document.getElementById('previewImg')
    img.src = URL.createObjectURL(file)
    img.style.display = 'block'
})

// =====================
// HASIL + PROGRESS BAR
// =====================
function tampilHasil(data) {

    let persen = data.confidence || 0
    let status = ""
    let color = ""

    if (persen <= 30) {
        status = "Busuk"
        color = "#ef4444"
    } else if (persen <= 70) {
        status = "Setengah Segar"
        color = "#f59e0b"
    } else {
        status = "Segar"
        color = "#22c55e"
    }

    document.getElementById('result').innerHTML = `
        <h3 style="color:${color}">${status}</h3>

        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill" style="width:${persen}%; background:${color}">
                    ${persen}%
                </div>
            </div>
        </div>

        <p><b>Ketahanan:</b> ${data.durasi}</p>
        <p><b>Saran:</b> ${data.saran}</p>
        <p><b>Kadar Air:</b> ${data.kadar_air}%</p>
    `
}