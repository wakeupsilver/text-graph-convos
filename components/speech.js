const html = require('choo/html')

const micIcon = require('./icons/microphone.svg')
const stopIcon = require('./icons/media-stop.svg')
const starIcon = require('./icons/star.svg')
const clearIcon = require('./icons/reload.svg')
const peopleIcon = require('./icons/people.svg')

const SpeechToText = (state, emit) => {
  let room = state.room
  let mic = null
  if (state.recognition && room.role !== 'screen') {
    mic = state.recognizing
      ? html`<button class="glow-button live" onclick=${() => emit('stopRecognition')} title="Stop listening">
          <img src=${stopIcon} alt="" /> <span>Stop</span>
        </button>`
      : html`<button class="glow-button primary" onclick=${() => emit('startRecognition')} title="Start listening">
          <img src=${micIcon} alt="" /> <span>Listen</span>
        </button>`
  }
  let demo = null
  if (!room.code) {
    demo = state.demoPlaying
      ? html`<button class="glow-button" onclick=${() => emit('stopDemo')} title="Stop the demo">
          <img src=${stopIcon} alt="" /> <span>Stop demo</span>
        </button>`
      : html`<button class="glow-button" onclick=${() => emit('playDemo')} title="Play a demo conversation">
          <img src=${starIcon} alt="" /> <span>Demo</span>
        </button>`
  }
  let together = html`
    <button class="glow-button ${room.code ? 'in-room' : ''}" onclick=${() => emit('togglePair')} title="Use one device per person">
      <img src=${peopleIcon} alt="" /> <span>${room.code ? 'Room ' + room.code : 'Together'}</span>
    </button>
  `
  let hint = 'Tap a star to pass the mic · keys 1 / 2 or space to swap'
  if (room.code) {
    hint = room.role === 'screen'
      ? 'Watching room ' + room.code
      : 'This device is ' + state.names[room.role] + (room.connected ? '' : ' · connecting…')
  }
  if (state.recognitionError && room.role !== 'screen') hint = state.recognitionError
  if (room.error) hint = room.error
  return html`
    <div class="speech-to-text">
      <div class="buttons">
        ${mic}
        ${together}
        ${demo}
        <button class="glow-button" onclick=${() => emit('clearConversation')} title="Start over">
          <img src=${clearIcon} alt="" /> <span>Clear</span>
        </button>
      </div>
      <div class="hint">${hint}</div>
    </div>
  `
}

module.exports = SpeechToText
