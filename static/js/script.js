let stream = null
let cameraOn = false

const video = document.getElementById('video')
const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')

// ❌ HAPUS localhost
// const SERVER = 'http://localhost:8080'

// ✅ Pakai relative path (otomatis ikut domain Railway / localhost)
const SERVER = ''

async function toggleCamera() {
    const btn = document.getElementById('btn-cam')

    // ✅ cek support browser
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Browser tidak support kamera atau harus pakai HTTPS / localhost")
        return
    }

    if (!cameraOn) {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: true
            })

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
        btn.textContent = 'Kamera ON'
        setStatus('Kamera mati', 'not-detected')
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

    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob)
        }, 'image/jpeg', 0.9)
    })
}

async function detectMeat() {
    if (!cameraOn) {
        alert('Nyalakan kamera dulu!')
        return
    }

    setStatus('Mendeteksi...', 'not-detected')

    const blob = await captureFrame()
    const fd = new FormData()
    fd.append('image', blob, 'frame.jpg')

    try {
        const res = await fetch('/predict', {
            method: 'POST',
            body: fd
        })

        const data = await res.json()

        if (data.label) {
            setStatus('Daging terdeteksi — tekan Prediksi', 'detected')
        }

    } catch (e) {
        setStatus('Error: ' + e.message, 'not-detected')
    }
}

async function predict() {
    if (!cameraOn) {
        alert('Nyalakan kamera dulu!')
        return
    }

    setStatus('Menganalisis...', 'not-detected')

    const blob = await captureFrame()
    const fd = new FormData()
    fd.append('image', blob, 'frame.jpg')

    try {
        const res = await fetch('/predict', {
            method: 'POST',
            body: fd
        })

        const data = await res.json()

        if (data.error) {
            alert(data.error)
            return
        }

        tampilHasil(data)
        setStatus('Prediksi selesai', 'detected')

    } catch (e) {
        alert('Gagal koneksi ke server: ' + e.message)
    }
}

function tampilHasil(data) {
    document.getElementById("result").innerHTML = `
        <h2 style="color:${data.color}">
            ${data.label_text}
        </h2>
        <p><b>Confidence:</b> ${data.confidence}%</p>
        <p><b>Ketahanan:</b> ${data.durasi}</p>
        <p><b>Saran:</b> ${data.saran}</p>
        <p><b>Kadar Air:</b> ${data.kadar_air}%</p>
    `
}