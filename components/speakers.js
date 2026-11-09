const html = require('choo/html')

const Speakers = (state, emit) => {
  let field = (s) => html`
    <label class="speaker-name speaker-${s}">
      <span>Speaker ${s === 'A' ? 1 : 2}</span>
      <input type="text" value=${state.names[s]}
        onchange=${(e) => emit('setName', { speaker: s, name: e.target.value })} />
    </label>
  `
  let gate = html`
    <label class="gate">
      <span>Ignore quiet sounds (rooms only): ${Math.round(state.gate * 100)}%</span>
      <input type="range" min="0" max="0.6" step="0.02" value=${state.gate}
        oninput=${(e) => emit('setGate', parseFloat(e.target.value))} />
      <small>When each person has their own device, a phone can overhear the other person. Live captions are only shared while this device's mic is louder than this. Turn it up if words show up on the wrong side.</small>
    </label>
  `
  return html`<div><div class="speakers">${field('A')}${field('B')}</div>${gate}</div>`
}

module.exports = Speakers
