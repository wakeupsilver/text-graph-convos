// Exercises the relay in server.js with fake devices: node test/relay.test.js
const assert = require('assert')
const WebSocket = require('ws')
const { start, similar, tokens } = require('../server.js')

const wait = ms => new Promise(r => setTimeout(r, ms))

function device(port, room, role) {
  return new Promise((resolve) => {
    let ws = new WebSocket(`ws://localhost:${port}/relay`)
    ws.inbox = []
    ws.on('message', d => ws.inbox.push(JSON.parse(d)))
    ws.say = msg => ws.send(JSON.stringify(msg))
    ws.finals = () => ws.inbox.filter(m => m.type === 'final').map(m => m.speaker + ': ' + m.text)
    ws.on('open', () => {
      ws.say({ type: 'join', room, role })
      let check = setInterval(() => {
        if (ws.inbox.some(m => m.type === 'welcome')) { clearInterval(check); resolve(ws) }
      }, 10)
    })
  })
}

async function main() {
  assert(similar(tokens('we counted forty shooting stars'), tokens('counted forty shooting stars')))
  assert(!similar(tokens('I love the garden'), tokens('the meteor shower was amazing')))
  assert(!similar(tokens('yes'), tokens('yes')), 'single words are never treated as duplicates')

  let server = start(0)
  await new Promise(r => server.on('listening', r))
  let port = server.address().port
  let results = []
  const test = async (name, fn) => {
    try { await fn(); results.push('✓ ' + name) } catch (e) { results.push('✗ ' + name + '\n    ' + e.message); process.exitCode = 1 }
  }

  let a = await device(port, 'TEST', 'A')
  let b = await device(port, 'test', 'B') // codes are case-insensitive
  let screen = await device(port, 'TEST', 'screen')

  await test('peers are counted per role', async () => {
    await wait(50)
    let peers = screen.inbox.filter(m => m.type === 'peers').pop().peers
    assert.deepStrictEqual(peers, { A: 1, B: 1, screen: 1 })
  })

  await test('speech is relayed to every device, labelled by the sender', async () => {
    a.say({ type: 'interim', text: 'I keep thinking' })
    await wait(300)
    a.say({ type: 'final', text: 'I keep thinking about the garden', level: 0.6 })
    await wait(1400)
    assert.deepStrictEqual(screen.finals(), ['A: I keep thinking about the garden'])
    assert.deepStrictEqual(b.finals(), ['A: I keep thinking about the garden'])
    let f = screen.inbox.find(m => m.type === 'final')
    assert(f.start && f.end - f.start >= 250, 'phrase start comes from the first interim')
  })

  await test('a screen cannot speak, and a role cannot be faked', async () => {
    screen.say({ type: 'final', text: 'I am a screen speaking', speaker: 'A' })
    b.say({ type: 'final', text: 'pretending to be someone else', speaker: 'A', level: 0.5 })
    await wait(1400)
    assert(!screen.finals().some(t => t.includes('screen speaking')))
    assert(screen.finals().includes('B: pretending to be someone else'))
  })

  await test('overheard phrase (quieter, arriving later) is dropped', async () => {
    let before = screen.finals().length
    b.say({ type: 'final', text: 'can we put lanterns in the garden too', level: 0.7 })
    await wait(200)
    a.say({ type: 'final', text: 'put lanterns in the garden', level: 0.2 })
    await wait(1500)
    assert.deepStrictEqual(screen.finals().slice(before), ['B: can we put lanterns in the garden too'])
  })

  await test('overheard phrase (quieter, arriving first) is replaced by the louder one', async () => {
    let before = screen.finals().length
    b.say({ type: 'final', text: 'my grandmother taught me that recipe', level: 0.15 })
    await wait(300)
    a.say({ type: 'final', text: 'my grandmother taught me that recipe with mint', level: 0.8 })
    await wait(1500)
    assert.deepStrictEqual(screen.finals().slice(before), ['A: my grandmother taught me that recipe with mint'])
  })

  await test('different phrases at the same time are both kept', async () => {
    let before = screen.finals().length
    a.say({ type: 'final', text: 'look at the sunflowers', level: 0.6 })
    b.say({ type: 'final', text: 'I see the telescope over there', level: 0.6 })
    await wait(1500)
    assert.deepStrictEqual(screen.finals().slice(before).sort(), ['A: look at the sunflowers', 'B: I see the telescope over there'])
  })

  await test('names and levels are shared', async () => {
    a.say({ type: 'name', name: 'Jay' })
    a.say({ type: 'level', level: 0.42 })
    await wait(100)
    assert(screen.inbox.some(m => m.type === 'name' && m.speaker === 'A' && m.name === 'Jay'))
    assert(screen.inbox.some(m => m.type === 'level' && m.speaker === 'A' && m.level === 0.42))
  })

  await test('late joiners receive history, names and the shared clock', async () => {
    let late = await device(port, 'TEST', 'screen')
    let welcome = late.inbox.find(m => m.type === 'welcome')
    assert.strictEqual(welcome.history.length, screen.finals().length)
    assert.strictEqual(welcome.names.A, 'Jay')
    assert(welcome.now >= welcome.startedAt)
    late.close()
  })

  await test('rooms are separate', async () => {
    let other = await device(port, 'ELSE', 'screen')
    let welcome = other.inbox.find(m => m.type === 'welcome')
    assert.strictEqual(welcome.history.length, 0)
    other.close()
  })

  await test('reset clears the room for everyone', async () => {
    b.say({ type: 'reset' })
    await wait(100)
    assert(screen.inbox.some(m => m.type === 'reset'))
    let late = await device(port, 'TEST', 'screen')
    assert.strictEqual(late.inbox.find(m => m.type === 'welcome').history.length, 0)
    late.close()
  })

  await test('static files are served, paths outside dist are not', async () => {
    let res = await fetch(`http://localhost:${port}/`)
    assert.strictEqual(res.status, 200)
    let bad = await fetch(`http://localhost:${port}/..%2fserver.js`)
    assert.notStrictEqual(bad.status, 200)
  })

  ;[a, b, screen].forEach(ws => ws.close())
  server.close()
  console.log(results.join('\n'))
  setTimeout(() => process.exit(), 100)
}

main()
