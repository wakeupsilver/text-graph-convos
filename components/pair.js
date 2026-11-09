const html = require('choo/html')

// The "Together" panel: put each person on their own device.
const Pair = (state, emit) => {
  if (!state.pairOpen) return html`<div class="pair-panel hidden"></div>`
  let room = state.room
  let names = state.names
  let close = html`<button class="close" onclick=${() => emit('togglePair')} title="Close">✕</button>`
  let insecure = !window.isSecureContext
    ? html`<p class="note">Phones only allow the microphone on <strong>https</strong> pages (or localhost). See the README for how to serve this over https.</p>`
    : ''
  let error = room.error ? html`<p class="note error">${room.error}</p>` : ''

  if (!room.code) {
    state.pairRole = state.pairRole || 'A'
    let rolePill = (role, label) => html`
      <button class="pill ${state.pairRole === role ? 'selected role-' + role : ''}"
        onclick=${() => { state.pairRole = role; emit('render') }}>${label}</button>
    `
    let join = (e) => {
      e.preventDefault()
      let code = e.target.querySelector('input[name="code"]').value
      emit('roomJoin', { code, role: state.pairRole })
    }
    return html`
      <div class="pair-panel">
        ${close}
        <h3>Talk together ✦</h3>
        <p>Each person opens this page on their own phone or laptop and speaks into it. Every word comes from its owner’s microphone, so the universe always knows who said what. A third screen can join just to watch.</p>
        <p class="label">Who is this device?</p>
        <div class="pills">
          ${rolePill('A', names.A)}
          ${rolePill('B', names.B)}
          ${rolePill('screen', 'Just watching')}
        </div>
        <button class="glow-button primary wide" onclick=${() => emit('roomCreate', state.pairRole)}>Start a new room</button>
        <form class="join" onsubmit=${join}>
          <input type="text" name="code" placeholder="Room code" maxlength="12" autocomplete="off" autocapitalize="characters" />
          <button class="glow-button" type="submit">Join</button>
        </form>
        ${error}
        ${insecure}
      </div>
    `
  }

  let roleName = room.role === 'screen' ? 'just watching' : names[room.role]
  let status = (s) => html`
    <li class="role-${s}">
      <span class="dot ${room.peers[s] ? 'on' : ''}"></span>
      ${s === 'screen' ? 'Screens' : names[s]}
      <em>${room.peers[s] ? (room.peers[s] > 1 ? room.peers[s] + ' devices' : 'connected') : 'not here yet'}</em>
    </li>
  `
  let invite = (role, label) => {
    let link = room.link(role)
    let copy = (e) => {
      let button = e.currentTarget
      let done = () => { button.textContent = 'Copied ✦' }
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => {})
      else window.prompt('Copy this link', link)
    }
    return html`
      <div class="invite">
        <span class="label">${label}</span>
        <div class="row">
          <input type="text" readonly value=${link} onclick=${(e) => e.target.select()} />
          <button class="glow-button" onclick=${copy}>Copy</button>
        </div>
      </div>
    `
  }
  let other = room.role === 'A' ? 'B' : 'A'
  return html`
    <div class="pair-panel">
      ${close}
      <p class="label">Room</p>
      <div class="code">${room.code}</div>
      <p>This device: <strong class="role-${room.role}">${roleName}</strong>
        ${room.connected ? '' : html`<em class="connecting"> · connecting…</em>`}</p>
      <ul class="peers">${status('A')}${status('B')}${status('screen')}</ul>
      ${room.role === 'screen'
        ? [invite('A', 'Link for ' + names.A), invite('B', 'Link for ' + names.B)]
        : invite(other, 'Send this to ' + names[other])}
      ${invite('screen', 'Link for a big screen')}
      <p class="small">Tip: if a phone keeps catching the other person’s words, turn up “Ignore quiet sounds” in settings, or use headphones.</p>
      ${error}
      ${insecure}
      <button class="glow-button wide" onclick=${() => emit('roomLeave')}>Leave room</button>
    </div>
  `
}

module.exports = Pair
