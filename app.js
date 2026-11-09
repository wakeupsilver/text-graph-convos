const choo = require('choo')
const html = require('choo/html')

const Video = require('./components/video.js')
const StopWords = require('./components/stopwords.js')
const SpeechToText = require('./components/speech.js')
const Universe = require('./components/universe.js')
const Transcript = require('./components/transcript.js')
const Speakers = require('./components/speakers.js')
const Pair = require('./components/pair.js')

const cogIcon = require('./components/icons/cog.svg')
const starIcon = require('./components/icons/star.svg')

const store = require('./store.js')

const mainView = (state, emit) => {
  let showSettings = html`
    <button onclick=${() => emit('showSettings')} title="Settings">
      <img class="icon" src=${cogIcon} alt="Settings" />
    </button>
  `
  let showUniverse = html`
    <button onclick=${() => emit('hideSettings')} title="Back to the universe">
      <img class="icon" src=${starIcon} alt="Universe" />
    </button>
  `
  return html`
    <body>
      <div class="menu">
        ${state.settingsOpened ? showUniverse : showSettings}
      </div>
      <div class="fullscreen ${state.settingsOpened ? 'hidden' : 'open'}">
        ${state.cache(Universe, 'universe').render()}
        ${SpeechToText(state, emit)}
        ${Pair(state, emit)}
      </div>
      <div class="settings ${state.settingsOpened ? 'open' : 'hidden'}">
        <h2>Speakers:</h2>
        <div>${Speakers(state, emit)}</div>
        <h2>Video:</h2>
        <div>${Video(state, emit)}</div>
        <h2>Stop words:</h2>
        <div>${StopWords(state, emit)}</div>
        <h2>Transcript:</h2>
        <div>${Transcript(state, emit)}</div>
      </div>
    </body>
  `
}

var app = choo()
app.use(store)
app.use((state, emitter) => {
  document.addEventListener('keydown', (e) => {
    if (state.settingsOpened) return
    let tag = e.target && e.target.tagName
    if (e.key === 'Escape' && state.pairOpen) return emitter.emit('togglePair')
    if (state.pairOpen) return
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (e.key === '1') emitter.emit('setSpeaker', 'A')
    else if (e.key === '2') emitter.emit('setSpeaker', 'B')
    else if (e.key === ' ') {
      e.preventDefault()
      emitter.emit('swapSpeaker')
    }
  })
})
app.route('*', mainView)
app.mount('body')
