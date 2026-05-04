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
// TOGGLE CAMERA ON/OFF
// =====================
async function toggleCamera() {
    const btn = document.getElementById('btn-cam')

    if (!navigator.mediaDevices) {
        alert("Browser tidak support kamera")
        return
    }

    if (!cameraOn) {
        try {
            const deviceId = cameraSelect.value

            stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: deviceId }
            })

            video.srcObject = stream
            cameraOn = true

            btn.textContent = '🔴 Matikan Kamera'
            btn.style.background = '#ef4444'

            setStatus('🟢 Kamera aktif')

        } catch (e) {
            alert('Gagal kamera: ' + e.message)
        }
    } else {
        stopCamera()
    }
}

// =====================
// STOP CAMERA (AMAN)
// =====================
function stopCamera() {
    const btn = document.getElementById('btn-cam')

    if (stream) {
        stream.getTracks().forEach(track => track.stop())
    }

    video.srcObject = null
    cameraOn = false

    btn.textContent = '🟢 Nyalakan Kamera'
    btn.style.background = '#22c55e'

    setStatus('🔴 Kamera mati')
}

// =====================
// STATUS
// =====================
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
    if (!cameraOn) {
        alert('Nyalakan kamera dulu!')
        return
    }

    const blob = await captureFrame()
    const fd = new FormData()
    fd.append('image', blob)

    try {
        const res = await fetch('/predict', {
            method: 'POST',
            body: fd
        })

        const data = await res.json()
        tampilHasil(data)

    } catch (e) {
        alert('Error: ' + e.message)
    }
}

// =====================
// UPLOAD IMAGE
// =====================
async function uploadImage() {
    const input = document.getElementById('fileInput')
    const file = input.files[0]

    if (!file) {
        alert('Pilih gambar dulu!')
        return
    }

    const fd = new FormData()
    fd.append('image', file)

    try {
        setStatus('Upload & analisis...')

        const res = await fetch('/predict', {
            method: 'POST',
            body: fd
        })

        const data = await res.json()
        tampilHasil(data)

        setStatus('Selesai (upload)')

    } catch (e) {
        alert('Error: ' + e.message)
    }
}

// =====================
// REMOVE IMAGE
// =====================
function removeImage() {
    document.getElementById('fileInput').value = ''

    const img = document.getElementById('previewImg')
    img.src = ''
    img.style.display = 'none'

    document.getElementById("result").innerHTML = `<p>Belum ada prediksi</p>`

    setStatus('Gambar dihapus')
}

// =====================
// PREVIEW IMAGE
// =====================
document.getElementById('fileInput').addEventListener('change', function() {
    const file = this.files[0]
    if (!file) return

    const img = document.getElementById('previewImg')
    img.src = URL.createObjectURL(file)
    img.style.display = 'block'
})

// =====================
// RESULT
// =====================
function tampilHasil(data) {
    document.getElementById("result").innerHTML = `
        <h3 style="color:${data.color}">
            ${data.label_text}
        </h3>
        <p><b>Confidence:</b> ${data.confidence}%</p>
        <p><b>Ketahanan:</b> ${data.durasi}</p>
        <p><b>Saran:</b> ${data.saran}</p>
        <p><b>Kadar Air:</b> ${data.kadar_air}%</p>
    `
}