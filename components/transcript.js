const html = require('choo/html')

const Transcript = (state, emit) => {
  let conv = state.conv
  let lines = conv.utterances.map(u => html`
    <p class="line speaker-${u.speaker}"><strong>${state.names[u.speaker]}:</strong> ${u.text}</p>
  `)
  ;['A', 'B'].forEach((s) => {
    let interim = conv.interims[s]
    if (!interim) return
    lines.push(html`
      <p class="line interim speaker-${s}">
        <strong>${state.names[s]}:</strong> ${interim.text}
      </p>
    `)
  })
  return html`
    <div class="text">
      ${lines.length ? lines : html`<em>Nothing said yet.</em>`}
    </div>
  `
}

module.exports = Transcript
