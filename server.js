// Serves the built app (./dist) and relays conversations between devices.
//
// Each person opens the page on their own device and joins the same room as
// "A" or "B" (a big screen can join as "screen"). Speech is recognized on each
// device, sent here, stamped with the server clock and broadcast to everyone
// in the room, so every screen shows the same universe.
//
// Mic bleed: a phone on the table also hears the other person. When two
// devices send nearly the same phrase within a few seconds, only the one that
// heard it louder is kept. Finals wait a moment before broadcast so they can
// be compared.
//
//   PORT=8080 node server.js
//   HTTPS_CERT=cert.pem HTTPS_KEY=key.pem node server.js   (phones need https for the mic)

const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const { WebSocketServer } = require('ws')

const PORT = Number(process.env.PORT) || 8080
const ROOT = path.join(__dirname, 'dist')
const FINAL_HOLD_MS = 1200 // how long a final waits for a possible duplicate
const DUPLICATE_WINDOW_MS = 4000
const ROOM_TTL_MS = 30 * 60 * 1000 // forget empty rooms after this long
const MAX_HISTORY = 5000

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.map': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
}

function serveStatic(req, res) {
  let url
  try {
    url = decodeURIComponent(req.url.split('?')[0])
  } catch (e) {
    res.writeHead(400).end()
    return
  }
  if (url.endsWith('/')) url += 'index.html'
  let file = path.normalize(path.join(ROOT, url))
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end()
    return
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found. Did you run `npm run build`?')
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
    res.end(data)
  })
}

// ---------------------------------------------------------------- rooms

const rooms = new Map()

function getRoom(code) {
  let room = rooms.get(code)
  if (!room) {
    room = {
      code, startedAt: Date.now(), history: [], clients: new Set(),
      names: {}, interimStart: { A: null, B: null }, pending: [], recent: [], expiry: null,
    }
    rooms.set(code, room)
  }
  clearTimeout(room.expiry)
  return room
}

function peers(room) {
  let count = { A: 0, B: 0, screen: 0 }
  room.clients.forEach(ws => { count[ws.role] += 1 })
  return count
}

function broadcast(room, msg) {
  let data = JSON.stringify(msg)
  room.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(data)
  })
}

function leave(ws) {
  let room = ws.room
  if (!room) return
  room.clients.delete(ws)
  ws.room = null
  broadcast(room, { type: 'peers', peers: peers(room) })
  if (room.clients.size === 0) {
    room.expiry = setTimeout(() => {
      room.pending.forEach(p => clearTimeout(p.timer))
      rooms.delete(room.code)
    }, ROOM_TTL_MS)
  }
}

function tokens(text) {
  return new Set(text.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean))
}

// Is one phrase (mostly) contained in the other?
function similar(a, b) {
  let small = a.size <= b.size ? a : b
  let big = small === a ? b : a
  if (small.size < 2) return false
  let shared = 0
  small.forEach(w => { if (big.has(w)) shared += 1 })
  return shared / small.size >= 0.6
}

function loudness(item) {
  return typeof item.level === 'number' ? item.level : 0.5
}

function handleFinal(room, speaker, text, level) {
  let now = Date.now()
  let candidate = {
    speaker, text, level, tokens: tokens(text), end: now,
    start: room.interimStart[speaker] || null,
  }
  room.interimStart[speaker] = null
  room.recent = room.recent.filter(r => now - r.end < DUPLICATE_WINDOW_MS)

  let others = room.pending.concat(room.recent)
    .filter(o => o.speaker !== speaker && now - o.end < DUPLICATE_WINDOW_MS && similar(o.tokens, candidate.tokens))
  for (let other of others) {
    if (loudness(candidate) <= loudness(other)) {
      // this device only overheard it
      broadcast(room, { type: 'interim', speaker, text: '', at: now })
      return
    }
    let i = room.pending.indexOf(other)
    if (i !== -1) {
      clearTimeout(other.timer)
      room.pending.splice(i, 1)
    }
  }

  candidate.timer = setTimeout(() => {
    room.pending.splice(room.pending.indexOf(candidate), 1)
    room.recent.push(candidate)
    let msg = { type: 'final', speaker, text, start: candidate.start, end: candidate.end }
    room.history.push(msg)
    if (room.history.length > MAX_HISTORY) room.history.shift()
    broadcast(room, msg)
  }, FINAL_HOLD_MS)
  room.pending.push(candidate)
}

function handle(ws, msg) {
  if (msg.type === 'join') {
    let code = String(msg.room || '').toUpperCase()
    let role = ['A', 'B', 'screen'].indexOf(msg.role) !== -1 ? msg.role : null
    if (!/^[A-Z0-9]{3,12}$/.test(code) || !role) return
    leave(ws)
    let room = getRoom(code)
    ws.room = room
    ws.role = role
    room.clients.add(ws)
    ws.send(JSON.stringify({
      type: 'welcome', room: code, role, now: Date.now(), startedAt: room.startedAt,
      history: room.history, names: room.names, peers: peers(room),
    }))
    broadcast(room, { type: 'peers', peers: peers(room) })
    return
  }

  let room = ws.room
  if (!room) return
  let speaker = ws.role === 'A' || ws.role === 'B' ? ws.role : null
  let text = typeof msg.text === 'string' ? msg.text.slice(0, 2000) : ''

  if (msg.type === 'interim' && speaker) {
    let now = Date.now()
    if (!text) room.interimStart[speaker] = null
    else if (!room.interimStart[speaker]) room.interimStart[speaker] = now
    broadcast(room, { type: 'interim', speaker, text, at: now, start: room.interimStart[speaker] })
  } else if (msg.type === 'final' && speaker && text.trim()) {
    let level = typeof msg.level === 'number' ? Math.max(0, Math.min(1, msg.level)) : null
    handleFinal(room, speaker, text, level)
  } else if (msg.type === 'level' && speaker && typeof msg.level === 'number') {
    broadcast(room, { type: 'level', speaker, level: Math.max(0, Math.min(1, msg.level)) })
  } else if (msg.type === 'name' && speaker && typeof msg.name === 'string' && msg.name.trim()) {
    room.names[speaker] = msg.name.trim().slice(0, 40)
    broadcast(room, { type: 'name', speaker, name: room.names[speaker] })
  } else if (msg.type === 'reset') {
    room.pending.forEach(p => clearTimeout(p.timer))
    room.pending = []
    room.recent = []
    room.history = []
    room.interimStart = { A: null, B: null }
    room.startedAt = Date.now()
    broadcast(room, { type: 'reset', now: Date.now(), startedAt: room.startedAt })
  }
}

// ---------------------------------------------------------------- start

function start(port) {
  let server = process.env.HTTPS_CERT && process.env.HTTPS_KEY
    ? https.createServer({
      cert: fs.readFileSync(process.env.HTTPS_CERT),
      key: fs.readFileSync(process.env.HTTPS_KEY),
    }, serveStatic)
    : http.createServer(serveStatic)

  let wss = new WebSocketServer({ server, path: '/relay', maxPayload: 16 * 1024 })
  wss.on('connection', (ws) => {
    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })
    ws.on('message', (data) => {
      let msg
      try {
        msg = JSON.parse(data)
      } catch (e) {
        return
      }
      if (msg && typeof msg === 'object') handle(ws, msg)
    })
    ws.on('close', () => leave(ws))
  })
  // drop connections that silently went away (phone locked, wifi lost)
  let heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate()
      ws.isAlive = false
      ws.ping()
    })
  }, 20000)
  wss.on('close', () => clearInterval(heartbeat))

  server.listen(port, () => {
    let scheme = server instanceof https.Server ? 'https' : 'http'
    console.log(`Conversation Universe on ${scheme}://localhost:${server.address().port}`)
  })
  return server
}

if (require.main === module) start(PORT)

module.exports = { start, similar, tokens }
