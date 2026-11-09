// Reads the microphone's loudness so the speaker's star can pulse with their
// voice. Purely decorative: if it fails, the universe falls back to pulsing
// whenever new words arrive.

function createMic() {
  let stream = null
  let audio = null
  let analyser = null
  let data = null
  let smoothed = 0

  function start() {
    if (analyser || !navigator.mediaDevices || !window.AudioContext) return
    navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
      stream = s
      audio = new AudioContext()
      analyser = audio.createAnalyser()
      analyser.fftSize = 512
      data = new Uint8Array(analyser.fftSize)
      audio.createMediaStreamSource(s).connect(analyser)
    }).catch(() => {})
  }

  function stop() {
    if (stream) stream.getTracks().forEach(t => t.stop())
    if (audio) audio.close()
    stream = audio = analyser = data = null
    smoothed = 0
  }

  let lastRead = 0

  // 0..1, or null when there is no live microphone. Safe to call often:
  // the meter is read at most once per animation frame.
  function level() {
    if (!analyser) return null
    let now = performance.now()
    if (now - lastRead < 15) return smoothed
    lastRead = now
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      let v = (data[i] - 128) / 128
      sum += v * v
    }
    let rms = Math.sqrt(sum / data.length)
    smoothed += (Math.min(1, rms * 6) - smoothed) * 0.3
    return smoothed
  }

  return { start, stop, level }
}

module.exports = { createMic }
