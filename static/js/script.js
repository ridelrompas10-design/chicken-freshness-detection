let stream = null
let cameraOn = false

const video = document.getElementById('video')
const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')
const cameraSelect = document.getElementById('cameraSelect')

// ✅ load daftar kamera
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
            btn.textContent = 'Kamera OFF'
            setStatus('Kamera aktif', 'ok')

        } catch (e) {
            alert('Gagal kamera: ' + e.message)
        }
    } else {
        if (stream) stream.getTracks().forEach(t => t.stop())
        video.srcObject = null
        cameraOn = false
        btn.textContent = 'Kamera ON'
        setStatus('Kamera mati', 'off')
    }
}

function setStatus(text) {
    document.getElementById('cam-status').innerText = text
}

function captureFrame() {
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    return new Promise(res => canvas.toBlob(res, 'image/jpeg'))
}

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

function tampilHasil(data) {
    document.getElementById("result").innerHTML = `
        <h3 style="color:${data.color}">
            ${data.label_text}
        </h3>
        <p>Confidence: ${data.confidence}%</p>
        <p>Ketahanan: ${data.durasi}</p>
        <p>Saran: ${data.saran}</p>
        <p>Kadar Air: ${data.kadar_air}%</p>
    `
}