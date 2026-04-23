
let stream = null
let cameraOn = false
let isDetected = false

const video = document.getElementById('video')
const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')

const SERVER = ''

async function toggleCamera() {
    const btn = document.getElementById('btn-cam')
    if (!cameraOn) {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true })
            video.srcObject = stream
            cameraOn = true
            btn.textContent = 'Kamera OFF'
            setStatus('Arahkan ke daging ayam...', 'not-detected')
        } catch (e) {
            alert('Gagal akses kamera: ' + e.message)
        }
    } else {
        if (stream) stream.getTracks().forEach(t => t.stop())
        video.srcObject = null
        cameraOn = false
        isDetected = false
        btn.textContent = 'Kamera ON'
        setStatus('Kamera belum aktif', 'not-detected')
    }
}

function setStatus(text, cls) {
    const el = document.getElementById('cam-status')
    el.textContent = text
    el.className = cls
}

function captureFrame() {
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9))
}

async function detectMeat() {
    if (!cameraOn) { alert('Nyalakan kamera dulu!'); return }
    setStatus('Mendeteksi...', 'not-detected')

    const blob = await captureFrame()
    const fd = new FormData()
    fd.append('image', blob, 'frame.jpg')

    try {
        const res = await fetch(SERVER + '/predict', { method: 'POST', body: fd })
        const data = await res.json()

        if (data.label) {
            isDetected = true
            setStatus('Daging terdeteksi — tekan Prediksi', 'detected')
        }
    } catch (e) {
        setStatus('Error: ' + e.message, 'not-detected')
    }
}

async function predict() {
    if (!cameraOn) { alert('Nyalakan kamera dulu!'); return }

    setStatus('Menganalisis...', 'not-detected')

    const blob = await captureFrame()
    const fd = new FormData()
    fd.append('image', blob, 'frame.jpg')

    try {
        const res = await fetch(SERVER + '/predict', { method: 'POST', body: fd })
        const data = await res.json()

        if (data.error) {
            alert('Error: ' + data.error)
            return
        }

        tampilHasil(data)
        setStatus('Prediksi selesai', 'detected')
    } catch (e) {
        alert('Gagal koneksi ke server: ' + e.message)
    }
}
