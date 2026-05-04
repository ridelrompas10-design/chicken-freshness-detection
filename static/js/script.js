let stream = null
let cameraOn = false

const video        = document.getElementById('video')
const canvas       = document.getElementById('canvas')
const ctx          = canvas.getContext('2d')
const cameraSelect = document.getElementById('cameraSelect')

// =====================
// LOAD CAMERA
// =====================
async function loadCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cams    = devices.filter(d => d.kind === 'videoinput')

    cameraSelect.innerHTML = ''

    cams.forEach((cam, i) => {
        const option  = document.createElement('option')
        option.value  = cam.deviceId
        option.text   = cam.label || `Kamera ${i + 1}`
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
            cameraOn        = true
            btn.textContent = '🔴 Matikan Kamera'
            btn.style.background = '#ef4444'
            setStatus('🟢 Kamera aktif')

        } catch (e) {
            alert(e.message)
        }
    } else {
        stream.getTracks().forEach(t => t.stop())
        video.srcObject = null
        cameraOn        = false
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
    canvas.width  = video.videoWidth
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

    // Tampilkan loading
    document.getElementById('result').innerHTML = `
        <p style="color:#94a3b8">⏳ Menganalisis gambar...</p>
    `

    try {
        const res  = await fetch('/predict', { method: 'POST', body: fd })
        const data = await res.json()
        tampilHasil(data)

    } catch (e) {
        document.getElementById('result').innerHTML = `
            <p style="color:#ef4444">❌ Error: ${e.message}</p>
        `
    }
}

// =====================
// REMOVE IMAGE
// =====================
function removeImage() {
    document.getElementById('fileInput').value = ''
    const img       = document.getElementById('previewImg')
    img.style.display = 'none'
    document.getElementById('result').innerHTML = '<p>Belum ada prediksi</p>'
}

// =====================
// PREVIEW
// =====================
document.getElementById('fileInput').addEventListener('change', function () {
    const file = this.files[0]
    if (!file) return

    const img     = document.getElementById('previewImg')
    img.src       = URL.createObjectURL(file)
    img.style.display = 'block'
})

// =====================
// TAMPIL HASIL
// FIX: gunakan label & color dari backend, bukan hitung ulang dari confidence
// =====================
function tampilHasil(data) {

    // FIX: label dan warna dari backend (hasil model Random Forest)
    const labelText = data.label_text || 'Tidak diketahui'
    const color     = data.color      || '#94a3b8'
    const persen    = data.confidence || 0

    // FIX: kadar_air null → tampilkan 'Sensor belum terhubung'
    const kadarAirTampil = (data.kadar_air !== null && data.kadar_air !== undefined)
        ? `${data.kadar_air}%`
        : '<span style="color:#f59e0b">⚠️ Sensor belum terhubung</span>'

    // FIX: jika bukan ayam, tampilkan pesan khusus
    if (data.label === 'bukan_ayam') {
        document.getElementById('result').innerHTML = `
            <h3 style="color:#9ca3af">❓ ${labelText}</h3>

            <div class="progress-container">
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${persen}%; background:#9ca3af">
                        ${persen}%
                    </div>
                </div>
            </div>

            <p><b>Ketahanan:</b> -</p>
            <p><b>Saran:</b> ${data.saran}</p>
            <p><b>Kadar Air:</b> ${kadarAirTampil}</p>
        `
        return
    }

    // Tampilan normal (segar / cukup_segar / busuk)
    document.getElementById('result').innerHTML = `
        <h3 style="color:${color}">${labelText}</h3>

        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill" style="width:${persen}%; background:${color}">
                    ${persen}%
                </div>
            </div>
        </div>

        <p><b>Ketahanan:</b> ${data.durasi}</p>
        <p><b>Saran:</b> ${data.saran}</p>
        <p><b>Kadar Air:</b> ${kadarAirTampil}</p>
    `
}