const { createConversation } = require('./conversation.js')
const { createDemo } = require('./demo.js')
const { createMic } = require('./mic.js')
const { createRoom } = require('./room.js')

let stopWords = require('./stop_words_nltk.json')

function getDefaultStopWords() {
  return stopWords.map(w => w.toUpperCase())
}

function getSavedStopWords() {
  try {
    let savedStopWords = JSON.parse(localStorage.getItem('stopWords')) || []
    return savedStopWords.map(w => w.toUpperCase())
  } catch (e) {
    console.log(e)
    return []
  }
}

function getSavedNames() {
  try {
    let saved = JSON.parse(localStorage.getItem('speakerNames'))
    if (saved && saved.A && saved.B) return saved
  } catch (e) {}
  return { A: 'Sun', B: 'Moon' }
}

function getSavedGate() {
  try {
    let v = parseFloat(localStorage.getItem('micGate'))
    if (v >= 0 && v <= 1) return v
  } catch (e) {}
  return 0.12
}

// Keeps a few seconds of mic levels: used to tell how loudly this device
// heard a phrase, and streamed to the room so the other screens can make
// this person's star pulse with their voice.
function createLevelHistory(state) {
  let samples = []
  let timer = null
  let lastSent = { level: -1, at: 0 }

  function tick() {
    let level = state.mic.level()
    if (level === null) return
    let now = performance.now()
    samples.push({ at: now, level })
    while (samples.length && now - samples[0].at > 5000) samples.shift()
    if (state.room.isSpeaker() && (Math.abs(level - lastSent.level) > 0.03 || now - lastSent.at > 1000)) {
      state.room.sendLevel(Math.round(level * 100) / 100)
      lastSent = { level, at: now }
    }
  }

  return {
    start() {
      if (!timer) timer = setInterval(tick, 80)
    },
    stop() {
      clearInterval(timer)
      timer = null
      samples = []
    },
    // loudest level in the last `ms`, or null if there is no mic meter
    peak(ms) {
      if (!samples.length) return null
      let now = performance.now()
      let max = 0
      samples.forEach(s => { if (now - s.at <= ms && s.level > max) max = s.level })
      return max
    },
  }
}

function saveStopWords(state) {
  try {
    localStorage.setItem('stopWords', JSON.stringify(state.stopWords))
  } catch (e) {}
  state.conv.setStopWords(state.stopWords)
}

module.exports = (state, emitter) => {
  state.videoUrl = null
  state.videoId = null
  state.videoError = null

  state.conv = createConversation()
  state.mic = createMic()
  state.room = createRoom(state, emitter)
  state.pairOpen = false
  // In a room, this device's live captions are only shared while its own mic
  // is loud enough, so a phone that overhears the other person stays quiet.
  state.gate = getSavedGate()
  state.levels = createLevelHistory(state)

  let defaultWords = getDefaultStopWords()
  let savedWords = getSavedStopWords()
  state.stopWords = savedWords.concat(defaultWords)
  state.conv.setStopWords(state.stopWords)

  // Which speaker currently "has the mic". Tap a star (or press 1, 2, space)
  // to hand it over; every phrase recognized from then on is theirs.
  state.speaker = 'A'
  state.names = getSavedNames()

  state.demoPlaying = false
  state.demo = createDemo(state.conv, {
    onSpeaker: (s) => { state.speaker = s; emitter.emit('render') },
    onEnd: () => { state.demoPlaying = false; emitter.emit('render') },
  })

  state.recognitionError = null
  state.recognizing = false
  if (window.webkitSpeechRecognition) {
    setupRecognition(state, emitter)
  } else {
    state.recognitionError = 'Live speech needs Google Chrome. The demo works everywhere ✦'
  }

  state.settingsOpened = false

  emitter.on('loadVideo', () => {
    let input = document.querySelector('.video-controls input[name="videoUrl"]')
    let value = input ? input.value : ''
    try {
      let url = new URL(value)
      state.videoId = url.searchParams.get('v')
      state.videoError = null
    } catch (e) {
      state.videoError = 'Invalid url'
    }
    emitter.emit('render')
  })

  emitter.on('removeStopWord', (i) => {
    state.stopWords.splice(i, 1)
    saveStopWords(state)
    emitter.emit('render')
  })
  emitter.on('addStopWord', () => {
    let input = document.querySelector('#word-form input[name="word"]')
    if (input && input.value !== '') {
      let words = input.value.split(',').map(w => w.trim().toUpperCase())
      state.stopWords = words.concat(state.stopWords)
      input.value = ''
    }
    saveStopWords(state)
    emitter.emit('render')
  })
  emitter.on('resetStopWords', () => {
    try { localStorage.removeItem('stopWords') } catch (e) {}
    state.stopWords = getDefaultStopWords()
    state.conv.setStopWords(state.stopWords)
    emitter.emit('render')
  })

  emitter.on('setSpeaker', (s) => {
    if (state.room.code) return // in a room each device is one person
    state.speaker = s
    emitter.emit('render')
  })
  emitter.on('swapSpeaker', () => {
    if (state.room.code) return
    state.speaker = state.speaker === 'A' ? 'B' : 'A'
    emitter.emit('render')
  })
  emitter.on('setName', ({ speaker, name }) => {
    state.names[speaker] = name.trim() || (speaker === 'A' ? 'Sun' : 'Moon')
    try { localStorage.setItem('speakerNames', JSON.stringify(state.names)) } catch (e) {}
    if (state.room.role === speaker) state.room.sendName(state.names[speaker])
    emitter.emit('render')
  })

  emitter.on('startRecognition', () => {
    if (!state.recognition || state.room.role === 'screen') return
    stopDemo()
    if (state.room.code) state.speaker = state.room.role
    state.recognizing = true
    state.recognition.start()
    state.mic.start()
    state.levels.start()
    emitter.emit('render')
  })
  emitter.on('stopRecognition', () => {
    state.recognizing = false
    if (state.recognition) state.recognition.stop()
    state.mic.stop()
    state.levels.stop()
    emitter.emit('render')
  })

  emitter.on('togglePair', () => {
    state.pairOpen = !state.pairOpen
    emitter.emit('render')
  })
  emitter.on('roomCreate', (role) => {
    stopDemo()
    if (role === 'screen' && state.recognizing) emitter.emit('stopRecognition')
    state.room.create(role)
  })
  emitter.on('roomJoin', ({ code, role }) => {
    stopDemo()
    if (role === 'screen' && state.recognizing) emitter.emit('stopRecognition')
    state.room.join(code, role)
  })
  emitter.on('roomLeave', () => {
    state.room.leave()
  })
  emitter.on('setGate', (value) => {
    state.gate = value
    try { localStorage.setItem('micGate', String(value)) } catch (e) {}
    emitter.emit('render')
  })

  emitter.on('playDemo', () => {
    if (state.room.code) return // the demo is local; leave the room first
    if (state.recognizing) emitter.emit('stopRecognition')
    state.conv.reset()
    state.demoPlaying = true
    state.demo.play()
    emitter.emit('render')
  })
  emitter.on('stopDemo', () => {
    stopDemo()
    emitter.emit('render')
  })
  emitter.on('clearConversation', () => {
    stopDemo()
    if (state.room.code) {
      state.room.sendReset() // clears every device in the room
      return
    }
    state.conv.reset()
    emitter.emit('render')
  })

  emitter.on('showSettings', () => {
    state.settingsOpened = true
    emitter.emit('render')
  })
  emitter.on('hideSettings', () => {
    state.settingsOpened = false
    emitter.emit('render')
  })

  function stopDemo() {
    state.demo.stop()
    state.demoPlaying = false
  }
}

function setupRecognition(state, emitter) {
  // The speaker is fixed when a phrase starts, so passing the mic halfway
  // through a sentence doesn't split it between people.
  let phraseSpeaker = null
  let sentInterim = false

  state.recognition = new webkitSpeechRecognition()
  state.recognition.continuous = true
  state.recognition.interimResults = true
  state.recognition.onstart = function() {
    state.recognizing = true
    emitter.emit('render')
  }
  state.recognition.onend = function() {
    if (state.recognizing) {
      state.recognition.start()
    }
    emitter.emit('render')
  }
  state.recognition.onresult = function(event) {
    let interim = ''
    let room = state.room
    if (room.isSpeaker()) {
      // Shared room: send to the relay; what it sends back is what we draw.
      let loudness = state.levels.peak(3000)
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          room.sendFinal(event.results[i][0].transcript, loudness)
          sentInterim = false
        } else {
          interim += event.results[i][0].transcript
        }
      }
      let audible = loudness === null || state.levels.peak(1500) >= state.gate
      if (interim && audible) {
        room.sendInterim(interim)
        sentInterim = true
      } else if (sentInterim && !interim) {
        room.sendInterim('')
        sentInterim = false
      }
      state.recognitionError = null
      return
    }
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (!phraseSpeaker) phraseSpeaker = state.speaker
      if (event.results[i].isFinal) {
        state.conv.addFinal(phraseSpeaker, event.results[i][0].transcript)
        phraseSpeaker = null
      } else {
        interim += event.results[i][0].transcript
      }
    }
    if (interim) {
      state.conv.setInterim(phraseSpeaker || state.speaker, interim)
    } else {
      phraseSpeaker = null
    }
    state.recognitionError = null
    emitter.emit('render')
  }
  state.recognition.onerror = function(event) {
    if (event.error == 'no-speech') {
      state.recognitionError = 'No speech heard yet'
      return // recognition keeps going; onend restarts it
    }
    state.recognizing = false
    state.mic.stop()
    if (event.error == 'audio-capture') {
      state.recognitionError = 'No microphone found'
    } else if (event.error == 'not-allowed') {
      state.recognitionError = 'Microphone access was blocked'
    } else {
      state.recognitionError = 'Speech recognition stopped: ' + event.error
    }
    emitter.emit('render')
  }
}
