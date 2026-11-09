// Connects this device to a shared room on the relay server (server.js).
//
// In a room, this device speaks for one person (role "A" or "B") or only
// watches ("screen"). Nothing goes straight into the local conversation:
// speech is sent to the relay, and what comes back (from either device) is
// what everyone draws, so all screens stay in sync.

const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function newCode() {
  let code = ''
  for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]
  return code
}

function relayUrl() {
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/relay'
}

function inviteLink(code, role) {
  return location.origin + location.pathname + '?room=' + code + '&as=' + role
}

function createRoom(state, emitter) {
  const conv = state.conv
  const room = {
    code: null,
    role: null, // 'A' | 'B' | 'screen'
    connected: false,
    error: null,
    peers: { A: 0, B: 0, screen: 0 },
    levels: { A: null, B: null }, // live voice level streamed from each device
    startedAt: 0, // server clock (ms) when the room's conversation began
  }
  let ws = null
  let everConnected = false
  let retryTimer = null

  const render = () => emitter.emit('render')
  const t = (at) => (at - room.startedAt) / 1000

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  function connect() {
    clearTimeout(retryTimer)
    if (!room.code) return
    try {
      ws = new WebSocket(relayUrl())
    } catch (e) {
      room.error = 'Could not reach the relay server.'
      render()
      return
    }
    let socket = ws
    socket.onopen = () => {
      send({ type: 'join', room: room.code, role: room.role })
    }
    socket.onmessage = (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch (e) {
        return
      }
      receive(msg)
    }
    socket.onclose = () => {
      if (socket !== ws) return
      room.connected = false
      if (!everConnected) {
        room.error = 'Can’t reach the relay server. Run it with `npm start` and open the page from there.'
      }
      render()
      if (room.code) retryTimer = setTimeout(connect, 2000)
    }
  }

  function receive(msg) {
    switch (msg.type) {
      case 'welcome':
        everConnected = true
        room.connected = true
        room.error = null
        room.peers = msg.peers
        room.startedAt = msg.startedAt
        conv.reset()
        conv.align((msg.now - msg.startedAt) / 1000)
        Object.keys(msg.names || {}).forEach((s) => { state.names[s] = msg.names[s] })
        msg.history.forEach(receive)
        if (room.role === 'A' || room.role === 'B') send({ type: 'name', name: state.names[room.role] })
        break
      case 'interim':
        conv.setInterim(msg.speaker, msg.text, t(msg.at), msg.start ? t(msg.start) : undefined)
        break
      case 'final':
        conv.addFinal(msg.speaker, msg.text, msg.start ? t(msg.start) : undefined, t(msg.end))
        break
      case 'level':
        room.levels[msg.speaker] = { level: msg.level, at: performance.now() }
        return // no re-render needed; the canvas reads this every frame
      case 'name':
        state.names[msg.speaker] = msg.name
        break
      case 'peers':
        room.peers = msg.peers
        break
      case 'reset':
        room.startedAt = msg.startedAt
        conv.reset()
        conv.align((msg.now - msg.startedAt) / 1000)
        break
    }
    render()
  }

  function setUrl(code, role) {
    try {
      let url = new URL(location.href)
      if (code) {
        url.searchParams.set('room', code)
        url.searchParams.set('as', role)
      } else {
        url.searchParams.delete('room')
        url.searchParams.delete('as')
      }
      history.replaceState(null, '', url)
    } catch (e) {}
  }

  room.join = (code, role) => {
    code = String(code || '').trim().toUpperCase()
    if (!/^[A-Z0-9]{3,12}$/.test(code)) {
      room.error = 'Room codes are 4 letters or numbers.'
      render()
      return
    }
    room.leave(true)
    room.code = code
    room.role = role
    room.error = null
    everConnected = false
    setUrl(code, role)
    connect()
    render()
  }

  room.create = (role) => room.join(newCode(), role)

  room.leave = (quiet) => {
    clearTimeout(retryTimer)
    let wasIn = !!room.code
    room.code = null
    room.role = null
    room.connected = false
    room.peers = { A: 0, B: 0, screen: 0 }
    if (ws) {
      let old = ws
      ws = null
      old.close()
    }
    if (wasIn && !quiet) {
      setUrl(null)
      conv.reset()
      render()
    }
  }

  room.isSpeaker = () => !!room.code && (room.role === 'A' || room.role === 'B')
  room.sendInterim = (text) => send({ type: 'interim', text })
  room.sendFinal = (text, level) => send({ type: 'final', text, level })
  room.sendLevel = (level) => send({ type: 'level', level })
  room.sendName = (name) => send({ type: 'name', name })
  room.sendReset = () => send({ type: 'reset' })
  room.link = (role) => inviteLink(room.code, role)

  // Rejoin from the URL (invite links look like ?room=KQPX&as=B)
  emitter.on('DOMContentLoaded', () => {
    try {
      let params = new URL(location.href).searchParams
      let code = params.get('room')
      let as = params.get('as')
      if (code) room.join(code, ['A', 'B', 'screen'].indexOf(as) !== -1 ? as : 'screen')
    } catch (e) {}
  })

  return room
}

module.exports = { createRoom }
