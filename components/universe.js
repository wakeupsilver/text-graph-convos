// The Universe: a living canvas for a two-person conversation.
//
// - Each speaker is a glowing star (orb). Tap one to hand it the mic.
// - Distinctive words are born from the star of whoever said them and drift
//   toward that speaker's side. Words both people use settle in the middle,
//   turn golden, and set off a burst of hearts.
// - Words said in the same sentence are joined by faint constellation lines.
// - A light ribbon along the bottom shows the turns over the last two minutes.
// - A heart at the top slides toward whoever is talking more.

const Component = require('choo/component')
const html = require('choo/html')

const PALETTE = {
  A: { core: [255, 248, 222], mid: [255, 160, 140], outer: [255, 92, 140], text: [255, 178, 168] },
  B: { core: [226, 251, 255], mid: [128, 226, 252], outer: [150, 118, 255], text: [148, 222, 255] },
  gold: [255, 218, 140],
}
const FONT = 'Quicksand, "Trebuchet MS", sans-serif'
const TAU = Math.PI * 2

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const rand = (lo, hi) => lo + Math.random() * (hi - lo)

class Universe extends Component {
  constructor(id, state, emit) {
    super(id)
    this.state = state
    this.emit = emit
    this.conv = state.conv
    this.words = new Map() // word -> particle
    this.spawnFrom = {} // word -> speaker whose star it should be born from
    this.fx = [] // sparkles, hearts, rings
    this.comets = []
    this.toasts = []
    this.shooting = []
    this.activity = { A: 0, B: 0 }
    this.widthCache = {}
    this.running = false
    this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.conv.on(e => this.onEvent(e))
  }

  createElement() {
    return html`<canvas class="universe" aria-label="Animated visualization of the conversation"></canvas>`
  }

  update() {
    return false
  }

  load(el) {
    this.canvas = el
    this.ctx = el.getContext('2d')
    this.makeSky()
    this.running = true
    this.last = performance.now()
    this.onClick = (e) => this.handleClick(e)
    this.onMove = (e) => this.handleMove(e)
    el.addEventListener('click', this.onClick)
    el.addEventListener('mousemove', this.onMove)
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { this.widthCache = {} })
    }
    const loop = (t) => {
      if (!this.running) return
      this.frame(t)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  unload() {
    this.running = false
    this.canvas.removeEventListener('click', this.onClick)
    this.canvas.removeEventListener('mousemove', this.onMove)
  }

  // ---------------------------------------------------------------- layout

  resize() {
    let el = this.canvas
    let w = el.clientWidth
    let h = el.clientHeight
    if (!w || !h) return false
    let dpr = Math.min(2, window.devicePixelRatio || 1)
    if (w !== this.W || h !== this.H || dpr !== this.dpr) {
      this.W = w
      this.H = h
      this.dpr = dpr
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
      this.layout()
    }
    return true
  }

  layout() {
    let W = this.W
    let H = this.H
    let portrait = W < H * 0.9
    let L = { portrait }
    if (portrait) {
      L.orbR = Math.min(W * 0.09, H * 0.05)
      L.orbs = { A: { x: W * 0.2, y: H * 0.145 }, B: { x: W * 0.8, y: H * 0.145 } }
      L.field = { x0: W * 0.05, x1: W * 0.95, y0: H * 0.3, y1: H * 0.68 }
    } else {
      L.orbR = Math.min(W, H) * 0.07
      L.orbs = { A: { x: W * 0.12, y: H * 0.4 }, B: { x: W * 0.88, y: H * 0.4 } }
      L.field = { x0: W * 0.23, x1: W * 0.77, y0: H * 0.15, y1: H * 0.68 }
    }
    L.timeline = { x0: W * 0.05, x1: W * 0.95, y0: H * 0.745, y1: H * 0.855 }
    L.balanceY = portrait ? H * 0.035 : H * 0.05
    L.toastY = portrait ? H * 0.275 : H * 0.12
    L.captionY = H * 0.715
    L.maxFont = clamp(Math.min(W, H) * (portrait ? 0.085 : 0.075), 26, 78)
    L.minFont = clamp(L.maxFont * 0.3, 12, 20)
    L.maxWords = portrait ? 24 : 36
    L.window = portrait ? 60 : 120 // seconds visible on the timeline
    this.L = L
  }

  makeSky() {
    this.stars = []
    let n = this.reducedMotion ? 140 : 240
    for (let i = 0; i < n; i++) {
      let depth = Math.random()
      this.stars.push({
        x: Math.random(), y: Math.random(), depth,
        r: 0.4 + depth * 1.4, phase: rand(0, TAU), speed: rand(0.6, 2.2),
        tint: Math.random() < 0.15 ? (Math.random() < 0.5 ? PALETTE.A.mid : PALETTE.B.mid) : [255, 255, 255],
      })
    }
    this.nebulae = [
      { x: 0.25, y: 0.3, r: 0.55, c: [255, 92, 160], a: 0.10, p: 0 },
      { x: 0.75, y: 0.35, r: 0.6, c: [110, 90, 255], a: 0.12, p: 2 },
      { x: 0.5, y: 0.75, r: 0.5, c: [60, 200, 255], a: 0.07, p: 4 },
      { x: 0.55, y: 0.15, r: 0.45, c: [255, 190, 110], a: 0.06, p: 1 },
    ]
  }

  // ---------------------------------------------------------------- events

  onEvent(e) {
    if (!this.L) return
    if (e.type === 'word' && e.interesting) {
      let p = this.words.get(e.entry.word)
      if (p && p.alpha > 0.3) {
        this.comet(this.L.orbs[e.speaker], p, PALETTE[e.speaker].mid)
      } else {
        this.spawnFrom[e.entry.word] = e.speaker
      }
    } else if (e.type === 'shared') {
      let word = e.entry.word
      this.toasts.push({ text: `✦ you both said “${word}” ✦`, life: 0, max: 4.5 })
      this.pendingShared = this.pendingShared || []
      this.pendingShared.push(word)
    } else if (e.type === 'utterance') {
      if (!this.reducedMotion) this.shootingStar()
    } else if (e.type === 'reset') {
      this.words.clear()
      this.spawnFrom = {}
      this.fx = []
      this.comets = []
      this.toasts = []
    }
  }

  celebrate(p) {
    let { orbs } = this.L
    this.comet(orbs.A, p, PALETTE.A.mid)
    this.comet(orbs.B, p, PALETTE.B.mid)
    p.goldenFlash = 1
    let n = this.reducedMotion ? 6 : 16
    for (let i = 0; i < n; i++) {
      let a = rand(0, TAU)
      let s = rand(40, 150)
      this.fx.push({
        kind: 'heart', x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        life: 0, max: rand(1.2, 2.2), size: rand(7, 15), rot: rand(-0.5, 0.5),
        color: Math.random() < 0.5 ? PALETTE.A.outer : (Math.random() < 0.5 ? PALETTE.gold : PALETTE.B.outer),
      })
    }
    this.fx.push({ kind: 'ring', x: p.x, y: p.y, life: 0, max: 1.2, color: PALETTE.gold })
  }

  sparkles(x, y, color, n, speed) {
    if (this.reducedMotion) n = Math.ceil(n / 3)
    for (let i = 0; i < n; i++) {
      let a = rand(0, TAU)
      let s = rand(20, speed || 120)
      this.fx.push({
        kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0, max: rand(0.6, 1.4), size: rand(2, 6), rot: rand(0, TAU), color,
      })
    }
  }

  comet(from, target, color) {
    this.comets.push({ x0: from.x, y0: from.y, target, t: 0, dur: rand(0.8, 1.1), color, trail: [] })
  }

  shootingStar() {
    let { W, H } = this
    let fromLeft = Math.random() < 0.5
    this.shooting.push({
      x: fromLeft ? rand(-50, W * 0.4) : rand(W * 0.6, W + 50), y: rand(-20, H * 0.25),
      vx: (fromLeft ? 1 : -1) * rand(500, 800), vy: rand(150, 300), life: 0, max: rand(0.9, 1.4),
    })
  }

  // ---------------------------------------------------------------- input

  orbAt(e) {
    if (!this.L) return null
    let rect = this.canvas.getBoundingClientRect()
    let x = e.clientX - rect.left
    let y = e.clientY - rect.top
    for (let s of ['A', 'B']) {
      let o = this.L.orbs[s]
      if (Math.hypot(x - o.x, y - o.y) < this.L.orbR * 1.8) return s
    }
    return null
  }

  handleClick(e) {
    let s = this.orbAt(e)
    if (s && this.state.room.code) {
      // in a room each device speaks for one person: no mic to pass
      let o = this.L.orbs[s]
      this.sparkles(o.x, o.y, PALETTE[s].mid, 12, 140)
    } else if (s) {
      this.emit('setSpeaker', s)
      let o = this.L.orbs[s]
      this.sparkles(o.x, o.y, PALETTE[s].mid, 18, 180)
    }
  }

  handleMove(e) {
    this.canvas.style.cursor = this.orbAt(e) && !this.state.room.code ? 'pointer' : 'default'
  }

  // ---------------------------------------------------------------- simulation

  textWidth(word, size) {
    let w100 = this.widthCache[word]
    if (w100 === undefined) {
      this.ctx.font = `700 100px ${FONT}`
      w100 = this.widthCache[word] = this.ctx.measureText(word).width
    }
    return w100 * size / 100
  }

  syncWords() {
    let { L } = this
    let top = this.conv.topWords(L.maxWords)
    let maxScore = top.length ? top[0].score : 1
    let visible = new Set()
    top.forEach((entry) => {
      visible.add(entry.word)
      let p = this.words.get(entry.word)
      if (!p) {
        let speaker = this.spawnFrom[entry.word] || entry.first
        let orb = L.orbs[speaker]
        p = {
          word: entry.word, entry, x: orb.x, y: orb.y,
          vx: (L.field.x0 + L.field.x1) / 2 > orb.x ? rand(80, 200) : -rand(80, 200), vy: rand(-80, 80),
          size: L.minFont * 0.5, alpha: 0, xJitter: rand(-1, 1), yOffset: rand(-1, 1),
          seed: rand(0, TAU), pulse: 1, goldenFlash: 0,
        }
        this.words.set(entry.word, p)
        this.sparkles(orb.x, orb.y, PALETTE[speaker].mid, 10)
      }
      p.entry = entry
      p.targetAlpha = 1
      p.sizeFrac = Math.sqrt(entry.score / maxScore)
      p.targetSize = L.minFont + (L.maxFont - L.minFont) * p.sizeFrac
      delete this.spawnFrom[entry.word]
    })
    this.words.forEach((p, word) => {
      if (!visible.has(word)) p.targetAlpha = 0
    })
    if (this.pendingShared) {
      this.pendingShared.forEach((word) => {
        let p = this.words.get(word)
        if (p) p.celebrate = true // fires once the word has arrived
      })
      this.pendingShared = null
    }
  }

  step(dt, t) {
    let { L } = this
    let f = L.field
    let cx = (f.x0 + f.x1) / 2
    let cy = (f.y0 + f.y1) / 2
    let halfW = (f.x1 - f.x0) / 2
    let halfH = (f.y1 - f.y0) / 2
    let damp = Math.pow(0.04, dt)
    let list = []

    this.words.forEach((p, word) => {
      p.alpha += (p.targetAlpha - p.alpha) * Math.min(1, dt * 2.5)
      p.size += (p.targetSize - p.size) * Math.min(1, dt * 3)
      p.pulse = Math.max(0, p.pulse - dt * 1.5)
      p.goldenFlash = Math.max(0, p.goldenFlash - dt * 0.6)
      if (p.targetAlpha === 0 && p.alpha < 0.02) {
        this.words.delete(word)
        return
      }
      let e = p.entry
      let share = (e.B - e.A) / Math.max(1, e.A + e.B)
      let tx = cx + share * halfW * 0.7 + p.xJitter * halfW * 0.3
      let ty = cy + p.yOffset * halfH * (0.3 + 0.6 * (1 - (p.sizeFrac || 0)))
      p.vx += (tx - p.x) * 2.2 * dt
      p.vy += (ty - p.y) * 1.2 * dt
      p.vx *= damp
      p.vy *= damp
      p.x += p.vx * dt
      p.y += p.vy * dt
      let scale = 1 + p.pulse * 0.18 + p.goldenFlash * 0.25
      p.w = this.textWidth(word, p.size) * scale
      p.h = p.size * 0.95 * scale
      if (p.celebrate && p.alpha > 0.7) {
        p.celebrate = false
        this.celebrate(p)
      }
      list.push(p)
    })

    // keep words from overlapping
    let pad = 6
    let keepInside = (p) => {
      if (p.alpha < 0.5) return
      p.x = p.w > f.x1 - f.x0 ? cx : clamp(p.x, f.x0 + p.w / 2, f.x1 - p.w / 2)
      p.y = clamp(p.y, f.y0 + p.h / 2, f.y1 - p.h / 2)
    }
    for (let pass = 0; pass < 4; pass++) {
      list.forEach(keepInside)
      for (let i = 0; i < list.length; i++) {
        let a = list[i]
        if (a.alpha < 0.05) continue
        for (let j = i + 1; j < list.length; j++) {
          let b = list[j]
          if (b.alpha < 0.05) continue
          let dx = b.x - a.x
          let dy = b.y - a.y
          let ox = (a.w + b.w) / 2 + pad - Math.abs(dx)
          let oy = (a.h + b.h) / 2 + pad * 0.5 - Math.abs(dy)
          if (ox > 0 && oy > 0) {
            if (ox / (a.w + b.w) < oy / (a.h + b.h)) {
              let s = (dx >= 0 ? 1 : -1) * ox * 0.5
              a.x -= s; b.x += s
            } else {
              let s = (dy >= 0 ? 1 : -1) * oy * 0.5
              a.y -= s; b.y += s
            }
          }
        }
      }
    }

    // effects
    this.fx = this.fx.filter((q) => {
      q.life += dt
      if (q.vx !== undefined) {
        q.x += q.vx * dt
        q.y += q.vy * dt
        q.vx *= Math.pow(0.3, dt)
        q.vy = q.vy * Math.pow(0.3, dt) + (q.kind === 'heart' ? -25 * dt : 0)
      }
      return q.life < q.max
    })
    this.comets = this.comets.filter((c) => {
      c.t += dt / c.dur
      let pos = this.cometPos(c)
      c.trail.push(pos)
      if (c.trail.length > 18) c.trail.shift()
      if (c.t >= 1) {
        if (c.target.word) c.target.pulse = 1
        this.sparkles(pos.x, pos.y, c.color, 8, 90)
        return false
      }
      return true
    })
    this.shooting = this.shooting.filter((s) => {
      s.life += dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      return s.life < s.max
    })
    this.toasts = this.toasts.filter((q) => (q.life += dt) < q.max)
    if (!this.reducedMotion && Math.random() < dt / 9) this.shootingStar()

    // speaker activity: voice level if we have it (from this device's mic,
    // or streamed from the other person's device), else recent transcription
    let ct = this.conv.time()
    let mic = this.state.mic && this.state.mic.level()
    let room = this.state.room
    ;['A', 'B'].forEach((s) => {
      let recent = ct - this.conv.lastActivity[s] < 0.7 ? 0.75 : 0
      let target = recent
      let local = room.code ? room.role === s : this.state.speaker === s
      if (local && mic !== null && mic !== undefined && this.state.recognizing) {
        target = Math.max(recent * 0.6, mic)
      } else if (room.code && room.role !== s) {
        let remote = room.levels[s]
        if (remote && performance.now() - remote.at < 500) target = Math.max(recent * 0.6, remote.level)
      }
      this.activity[s] += (target - this.activity[s]) * Math.min(1, dt * 6)
    })
  }

  cometPos(c) {
    let t = Math.min(1, c.t)
    let e = t * t * (3 - 2 * t)
    let x1 = c.target.x
    let y1 = c.target.y
    let mx = (c.x0 + x1) / 2
    let my = Math.min(c.y0, y1) - 90
    let u = 1 - e
    return { x: u * u * c.x0 + 2 * u * e * mx + e * e * x1, y: u * u * c.y0 + 2 * u * e * my + e * e * y1 }
  }

  // ---------------------------------------------------------------- drawing

  frame(now) {
    let dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    if (!this.resize()) return
    let t = now / 1000
    this.syncWords()
    this.step(dt, t)

    let ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.drawSky(ctx, t)
    this.drawConstellations(ctx)
    this.drawComets(ctx)
    this.drawWords(ctx, t)
    this.drawOrbs(ctx, t)
    this.drawFx(ctx)
    this.drawBalance(ctx, t)
    this.drawTimeline(ctx, t)
    this.drawCaption(ctx)
    this.drawToasts(ctx)
    this.drawIntro(ctx, t)
  }

  drawSky(ctx, t) {
    let { W, H } = this
    let g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#08051c')
    g.addColorStop(0.55, '#140a30')
    g.addColorStop(1, '#071628')
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)

    ctx.globalCompositeOperation = 'lighter'
    let R = Math.max(W, H)
    this.nebulae.forEach((n) => {
      let x = (n.x + Math.sin(t * 0.05 + n.p) * 0.05) * W
      let y = (n.y + Math.cos(t * 0.04 + n.p) * 0.05) * H
      let r = n.r * R * (1 + Math.sin(t * 0.1 + n.p) * 0.08)
      let ng = ctx.createRadialGradient(x, y, 0, x, y, r)
      ng.addColorStop(0, rgba(n.c, n.a))
      ng.addColorStop(1, rgba(n.c, 0))
      ctx.fillStyle = ng
      ctx.fillRect(0, 0, W, H)
    })
    // each speaker warms their half of the sky while they talk
    ;['A', 'B'].forEach((s) => {
      let o = this.L.orbs[s]
      let a = 0.05 + this.activity[s] * 0.16
      let r = R * 0.5
      let sg = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r)
      sg.addColorStop(0, rgba(PALETTE[s].outer, a))
      sg.addColorStop(1, rgba(PALETTE[s].outer, 0))
      ctx.fillStyle = sg
      ctx.fillRect(0, 0, W, H)
    })

    let drift = this.reducedMotion ? 0.002 : 0.008
    this.stars.forEach((s) => {
      let x = ((s.x - t * drift * (0.3 + s.depth)) % 1 + 1) % 1 * W
      let y = s.y * H
      let a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase)) * (0.4 + s.depth * 0.6)
      ctx.fillStyle = rgba(s.tint, a)
      ctx.beginPath()
      ctx.arc(x, y, s.r, 0, TAU)
      ctx.fill()
    })

    this.shooting.forEach((s) => {
      let k = s.life / s.max
      let a = Math.sin(k * Math.PI)
      let tail = 0.12
      let lg = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * tail, s.y - s.vy * tail)
      lg.addColorStop(0, `rgba(255,255,255,${a})`)
      lg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.strokeStyle = lg
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(s.x - s.vx * tail, s.y - s.vy * tail)
      ctx.stroke()
    })
    ctx.globalCompositeOperation = 'source-over'
  }

  drawConstellations(ctx) {
    let pairs = this.conv.pairs
    let list = []
    this.words.forEach(p => { if (p.alpha > 0.1) list.push(p) })
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineWidth = 1
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        let a = list[i]
        let b = list[j]
        let key = a.word < b.word ? a.word + '|' + b.word : b.word + '|' + a.word
        let n = pairs[key]
        if (!n) continue
        let alpha = Math.min(0.3, 0.07 * n) * Math.min(a.alpha, b.alpha)
        let lg = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
        lg.addColorStop(0, rgba(this.wordColor(a.entry), alpha))
        lg.addColorStop(1, rgba(this.wordColor(b.entry), alpha))
        ctx.strokeStyle = lg
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  wordColor(e) {
    let share = e.B / Math.max(1, e.A + e.B)
    if (e.A > 0 && e.B > 0) {
      return mix(PALETTE.gold, share < 0.5 ? PALETTE.A.text : PALETTE.B.text, Math.abs(share - 0.5))
    }
    return mix(PALETTE.A.text, PALETTE.B.text, share)
  }

  drawWords(ctx, t) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let sorted = Array.from(this.words.values()).sort((a, b) => a.size - b.size)
    sorted.forEach((p) => {
      if (p.alpha < 0.01) return
      let e = p.entry
      let shared = e.A > 0 && e.B > 0
      let bob = Math.sin(t * 0.7 + p.seed) * 3
      let x = p.x
      let y = p.y + bob
      let scale = 1 + p.pulse * 0.18 + p.goldenFlash * 0.25
      let size = p.size * scale
      let color = this.wordColor(e)
      ctx.font = `700 ${size.toFixed(1)}px ${FONT}`
      ctx.globalAlpha = p.alpha

      if (shared) {
        // soft golden halo behind shared words
        let hr = Math.max(p.w, p.h) * 0.75
        let hg = ctx.createRadialGradient(x, y, 0, x, y, hr)
        hg.addColorStop(0, rgba(PALETTE.gold, 0.08 + p.goldenFlash * 0.22))
        hg.addColorStop(1, rgba(PALETTE.gold, 0))
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = hg
        ctx.fillRect(x - hr, y - hr, hr * 2, hr * 2)
        ctx.globalCompositeOperation = 'source-over'
        let half = p.w / 2
        let fg = ctx.createLinearGradient(x - half, y, x + half, y)
        fg.addColorStop(0, rgba(PALETTE.A.text, 1))
        fg.addColorStop(0.5, rgba(mix(PALETTE.gold, [255, 255, 255], 0.3), 1))
        fg.addColorStop(1, rgba(PALETTE.B.text, 1))
        ctx.fillStyle = fg
      } else {
        ctx.fillStyle = rgba(color, 1)
      }
      ctx.shadowColor = rgba(color, 0.9)
      ctx.shadowBlur = size * (0.35 + p.pulse * 0.5)
      ctx.fillText(p.word, x, y)
      ctx.shadowBlur = 0

      if (shared) {
        let glint = 0.5 + 0.5 * Math.sin(t * 2.2 + p.seed * 3)
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = rgba([255, 250, 230], 0.9 * glint * p.alpha)
        sparklePath(ctx, x + p.w / 2 + 4, y - p.h * 0.45, 3 + size * 0.12 * glint, t * 0.8 + p.seed)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
      }
      ctx.globalAlpha = 1
    })
  }

  drawComets(ctx) {
    ctx.globalCompositeOperation = 'lighter'
    this.comets.forEach((c) => {
      c.trail.forEach((pt, i) => {
        let k = (i + 1) / c.trail.length
        ctx.fillStyle = rgba(c.color, 0.5 * k)
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 1 + 3.5 * k, 0, TAU)
        ctx.fill()
      })
      let head = c.trail[c.trail.length - 1]
      if (head) {
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.beginPath()
        ctx.arc(head.x, head.y, 2.5, 0, TAU)
        ctx.fill()
      }
    })
    ctx.globalCompositeOperation = 'source-over'
  }

  drawOrbs(ctx, t) {
    let { L } = this
    let names = this.state.names
    let total = this.conv.talkTime.A + this.conv.talkTime.B
    ;['A', 'B'].forEach((s, idx) => {
      let o = L.orbs[s]
      let pal = PALETTE[s]
      let act = this.activity[s]
      let active = this.state.speaker === s
      let breathe = 1 + Math.sin(t * 1.6 + idx * 2) * 0.03
      let r = L.orbR * breathe * (1 + act * 0.18)

      ctx.globalCompositeOperation = 'lighter'
      let glow = ctx.createRadialGradient(o.x, o.y, r * 0.5, o.x, o.y, r * 3.2)
      glow.addColorStop(0, rgba(pal.outer, 0.35 + act * 0.35))
      glow.addColorStop(1, rgba(pal.outer, 0))
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(o.x, o.y, r * 3.2, 0, TAU)
      ctx.fill()

      // light rays
      let rays = 14
      ctx.lineCap = 'round'
      for (let i = 0; i < rays; i++) {
        let a = (i / rays) * TAU + t * (idx ? -0.15 : 0.15)
        let len = r * (1.35 + 0.35 * Math.sin(t * 2 + i * 1.7) + act * 0.8)
        ctx.strokeStyle = rgba(pal.mid, 0.12 + act * 0.25)
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(o.x + Math.cos(a) * r * 1.05, o.y + Math.sin(a) * r * 1.05)
        ctx.lineTo(o.x + Math.cos(a) * len, o.y + Math.sin(a) * len)
        ctx.stroke()
      }
      ctx.globalCompositeOperation = 'source-over'

      let body = ctx.createRadialGradient(o.x - r * 0.3, o.y - r * 0.35, r * 0.05, o.x, o.y, r)
      body.addColorStop(0, rgba(pal.core, 1))
      body.addColorStop(0.45, rgba(pal.mid, 1))
      body.addColorStop(1, rgba(pal.outer, 1))
      ctx.fillStyle = body
      ctx.shadowColor = rgba(pal.mid, 1)
      ctx.shadowBlur = r * 0.8
      ctx.beginPath()
      ctx.arc(o.x, o.y, r, 0, TAU)
      ctx.fill()
      ctx.shadowBlur = 0

      let room = this.state.room
      if (room.code) active = room.peers[s] > 0
      if (active) {
        ctx.save()
        ctx.translate(o.x, o.y)
        ctx.rotate(t * 0.6)
        ctx.setLineDash([4, 9])
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(0, 0, r * 1.38, 0, TAU)
        ctx.stroke()
        ctx.setLineDash([])
        for (let i = 0; i < 3; i++) {
          let a = (i / 3) * TAU
          ctx.fillStyle = 'rgba(255,255,255,0.95)'
          sparklePath(ctx, Math.cos(a) * r * 1.38, Math.sin(a) * r * 1.38, 5, -t)
          ctx.fill()
        }
        ctx.restore()
      }

      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      let fs = clamp(r * 0.42, 13, 26)
      ctx.font = `700 ${fs}px ${FONT}`
      ctx.fillStyle = rgba(pal.core, 0.95)
      ctx.shadowColor = rgba(pal.outer, 0.9)
      ctx.shadowBlur = 10
      ctx.fillText(names[s], o.x, o.y + r * 1.6)
      ctx.shadowBlur = 0
      ctx.font = `500 ${fs * 0.6}px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      let sub
      if (room.code) {
        sub = room.role === s ? 'this device' : (room.peers[s] > 0 ? 'connected' : 'waiting to join')
      } else {
        sub = active ? (this.state.recognizing || this.state.demoPlaying ? 'speaking' : 'has the mic') : 'tap to pass the mic'
      }
      if (total > 0) sub = Math.round(this.conv.talkTime[s] / total * 100) + '% · ' + sub
      ctx.fillText(sub, o.x, o.y + r * 1.6 + fs * 1.25)
    })
  }

  drawFx(ctx) {
    ctx.globalCompositeOperation = 'lighter'
    this.fx.forEach((q) => {
      let k = q.life / q.max
      let a = 1 - k
      if (q.kind === 'spark') {
        ctx.fillStyle = rgba(q.color, a)
        sparklePath(ctx, q.x, q.y, q.size * (1 - k * 0.5), q.rot + k * 3)
        ctx.fill()
      } else if (q.kind === 'heart') {
        ctx.save()
        ctx.translate(q.x, q.y)
        ctx.rotate(q.rot + Math.sin(k * 6) * 0.2)
        ctx.fillStyle = rgba(q.color, a)
        ctx.shadowColor = rgba(q.color, a)
        ctx.shadowBlur = 8
        heartPath(ctx, 0, 0, q.size * (0.6 + Math.min(1, k * 4) * 0.4))
        ctx.fill()
        ctx.restore()
      } else if (q.kind === 'ring') {
        ctx.strokeStyle = rgba(q.color, a * 0.8)
        ctx.lineWidth = 3 * a + 0.5
        ctx.beginPath()
        ctx.arc(q.x, q.y, 10 + k * 120, 0, TAU)
        ctx.stroke()
      }
    })
    ctx.globalCompositeOperation = 'source-over'
  }

  drawBalance(ctx, t) {
    let { W, L } = this
    let conv = this.conv
    let total = conv.talkTime.A + conv.talkTime.B
    let half = Math.min(W * 0.18, 170)
    let cx = W / 2
    let y = L.balanceY + 8
    let bal = conv.balance()
    this.balShown = (this.balShown || 0) + (bal - (this.balShown || 0)) * 0.05

    let lg = ctx.createLinearGradient(cx - half, y, cx + half, y)
    lg.addColorStop(0, rgba(PALETTE.A.outer, 0.75))
    lg.addColorStop(0.5, rgba(PALETTE.gold, 0.6))
    lg.addColorStop(1, rgba(PALETTE.B.outer, 0.75))
    ctx.strokeStyle = lg
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - half, y)
    ctx.lineTo(cx + half, y)
    ctx.stroke()

    let hx = cx + this.balShown * half
    let balanced = total > 4 && Math.abs(bal) < 0.2
    let beat = 1 + Math.pow(Math.max(0, Math.sin(t * (balanced ? 4 : 2.2))), 8) * (balanced ? 0.35 : 0.15)
    let hs = 22 * beat
    let col = balanced ? PALETTE.gold : mix(PALETTE.A.outer, PALETTE.B.outer, (this.balShown + 1) / 2)
    ctx.fillStyle = rgba(col, 1)
    ctx.shadowColor = rgba(col, 1)
    ctx.shadowBlur = balanced ? 22 : 10
    heartPath(ctx, hx, y, hs)
    ctx.fill()
    ctx.shadowBlur = 0

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = `600 13px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    let label = conv.sharedCount === 1 ? '1 word in common' : conv.sharedCount + ' words in common'
    if (balanced) label = 'in harmony · ' + label
    ctx.fillText(label, cx, y + 16)
  }

  drawTimeline(ctx, t) {
    let { L } = this
    let tl = L.timeline
    let conv = this.conv
    let now = conv.time()
    let laneH = (tl.y1 - tl.y0) / 2
    let width = tl.x1 - tl.x0
    let win = L.window
    let xOf = (time) => tl.x1 - (now - time) / win * width

    ;['A', 'B'].forEach((s, i) => {
      let y = tl.y0 + laneH * (i + 0.5)
      let lg = ctx.createLinearGradient(tl.x0, y, tl.x1, y)
      lg.addColorStop(0, rgba(PALETTE[s].mid, 0))
      lg.addColorStop(1, rgba(PALETTE[s].mid, 0.25))
      ctx.strokeStyle = lg
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(tl.x0, y)
      ctx.lineTo(tl.x1, y)
      ctx.stroke()
    })

    let pill = (s, start, end, glow) => {
      let x0 = Math.max(tl.x0, xOf(start))
      let x1 = Math.min(tl.x1, xOf(end))
      if (x1 < tl.x0 || x1 - x0 < 0) return
      let i = s === 'A' ? 0 : 1
      let yc = tl.y0 + laneH * (i + 0.5)
      let h = laneH * 0.55
      let fade = clamp((x0 - tl.x0) / (width * 0.25), 0, 1) * 0.7 + 0.3
      let w = Math.max(h, x1 - x0)
      let pg = ctx.createLinearGradient(x0, yc - h / 2, x0, yc + h / 2)
      pg.addColorStop(0, rgba(PALETTE[s].core, 0.95 * fade))
      pg.addColorStop(1, rgba(PALETTE[s].outer, 0.85 * fade))
      ctx.fillStyle = pg
      ctx.shadowColor = rgba(PALETTE[s].mid, 1)
      ctx.shadowBlur = glow
      roundRect(ctx, x1 - w, yc - h / 2, w, h, h / 2)
      ctx.fill()
      ctx.shadowBlur = 0
    }

    conv.utterances.forEach((u) => {
      if (now - u.end > win) return
      pill(u.speaker, u.start, u.end, 10)
    })
    ;['A', 'B'].forEach((s) => {
      let interim = conv.interims[s]
      if (interim) pill(s, interim.start, now, 14 + Math.sin(t * 8) * 6)
    })

    // the "now" spark
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    sparklePath(ctx, tl.x1 + 4, (tl.y0 + tl.y1) / 2, 7 + Math.sin(t * 3) * 2, t)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    ctx.font = `500 11px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(win >= 120 ? '2 min ago' : '1 min ago', tl.x0, tl.y1 + 4)
    ctx.textAlign = 'right'
    ctx.fillText('now', tl.x1, tl.y1 + 4)
  }

  drawCaption(ctx) {
    let interims = this.conv.interims
    let both = interims.A && interims.B
    ;['A', 'B'].forEach((s) => {
      if (interims[s]) this.drawCaptionFor(ctx, interims[s], both ? this.W * 0.43 : this.W * 0.9)
    })
  }

  drawCaptionFor(ctx, interim, maxW) {
    let { W, L } = this
    let s = interim.speaker
    ctx.font = `italic 500 ${clamp(W * 0.014, 13, 18)}px ${FONT}`
    ctx.textBaseline = 'middle'
    let text = interim.text.trim()
    while (text.length > 4 && ctx.measureText('… ' + text).width > maxW) {
      text = text.slice(text.indexOf(' ') + 1 || 1)
    }
    if (text !== interim.text.trim()) text = '… ' + text
    ctx.textAlign = s === 'A' ? 'left' : 'right'
    ctx.fillStyle = rgba(PALETTE[s].core, 0.8)
    ctx.shadowColor = rgba(PALETTE[s].outer, 0.8)
    ctx.shadowBlur = 8
    ctx.fillText(text, s === 'A' ? W * 0.05 : W * 0.95, L.captionY)
    ctx.shadowBlur = 0
  }

  drawToasts(ctx) {
    let { W, L } = this
    // one at a time: a newer toast hurries the current one along
    if (this.toasts.length > 1) this.toasts[0].life = Math.max(this.toasts[0].life, this.toasts[0].max - 0.3)
    this.toasts.slice(0, 1).forEach((q) => {
      let k = q.life / q.max
      let a = Math.min(1, q.life * 3) * Math.min(1, (q.max - q.life) * 1.5)
      let y = L.toastY - k * 10
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `700 ${clamp(W * 0.016, 14, 20)}px ${FONT}`
      ctx.fillStyle = rgba(PALETTE.gold, a)
      ctx.shadowColor = rgba(PALETTE.gold, a)
      ctx.shadowBlur = 14
      ctx.fillText(q.text, W / 2, y)
      ctx.shadowBlur = 0
    })
  }

  drawIntro(ctx, t) {
    if (this.conv.utterances.length || this.conv.interims.A || this.conv.interims.B) return
    let { W, L } = this
    let f = L.field
    let a = 0.55 + 0.25 * Math.sin(t * 1.5)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${clamp(W * 0.03, 20, 40)}px ${FONT}`
    ctx.fillStyle = `rgba(255,240,250,${a})`
    ctx.shadowColor = 'rgba(255,170,220,0.8)'
    ctx.shadowBlur = 18
    let cy = (f.y0 + f.y1) / 2
    ctx.fillText('Talk, and your words become stars', W / 2, cy - 18)
    ctx.shadowBlur = 0
    ctx.font = `500 ${clamp(W * 0.013, 13, 17)}px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    let room = this.state.room
    let hint = 'press Listen, or watch the demo'
    if (room.code) {
      let other = room.role === 'A' ? 'B' : 'A'
      if (room.role === 'screen') hint = 'waiting for someone to speak'
      else if (!room.peers[other]) hint = 'press Listen · waiting for ' + this.state.names[other] + ' to join'
      else hint = 'press Listen on both devices'
    }
    ctx.fillText(hint, W / 2, cy + 22)
  }
}

function sparklePath(ctx, x, y, r, rot) {
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    let a = rot + i * Math.PI / 4
    let rr = i % 2 ? r * 0.28 : r
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
}

function heartPath(ctx, x, y, s) {
  ctx.beginPath()
  ctx.moveTo(x, y + s * 0.38)
  ctx.bezierCurveTo(x - s * 0.1, y + s * 0.28, x - s * 0.52, y + s * 0.05, x - s * 0.52, y - s * 0.18)
  ctx.bezierCurveTo(x - s * 0.52, y - s * 0.45, x - s * 0.15, y - s * 0.55, x, y - s * 0.3)
  ctx.bezierCurveTo(x + s * 0.15, y - s * 0.55, x + s * 0.52, y - s * 0.45, x + s * 0.52, y - s * 0.18)
  ctx.bezierCurveTo(x + s * 0.52, y + s * 0.05, x + s * 0.1, y + s * 0.28, x, y + s * 0.38)
  ctx.closePath()
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

module.exports = Universe
