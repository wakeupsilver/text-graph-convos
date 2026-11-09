// Conversation model: who said what, when, and which words matter.
//
// Words are scored by "distinctiveness": how often they are said in this
// conversation, weighted by how rare they are in everyday spoken English
// (SUBTLEX-US subtitle frequencies). Common words fade out on their own, so
// the stop word list only has to catch what slips through.

const frequencies = require('./word_frequencies.json')

// Values in word_frequencies.json are Zipf scores x10
// (log10 of occurrences per billion words). Unknown words are treated as rare.
const UNKNOWN_ZIPF = 1.5
const MAX_ZIPF_KEPT = 7.0
// Words more common than this (Zipf > 5.2, e.g. "keep", "night") are
// counted but not shown.
const MIN_RARITY_SHOWN = MAX_ZIPF_KEPT - 5.2

function zipf(word) {
  if (word.indexOf("'") !== -1) return 6 // contractions are always common
  let f = frequencies[word]
  return f ? f / 10 : UNKNOWN_ZIPF
}

function rarity(word) {
  return Math.min(5, Math.max(0.15, MAX_ZIPF_KEPT - zipf(word)))
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/[\s-]+/)
    .map(w => w.replace(/^'+|'+$/g, ''))
    .filter(w => /^[a-z][a-z']*$/.test(w))
}

function createConversation() {
  const listeners = []
  const conv = {
    startedAt: now(),
    utterances: [], // { speaker, text, start, end }
    interims: { A: null, B: null }, // live, not-yet-final text: { speaker, text, start }
    words: {}, // word -> { word, A, B, first, firstAt, lastAt, sharedAt, score }
    pairs: {}, // 'a|b' -> count of utterances where both appear
    sharedCount: 0,
    talkTime: { A: 0, B: 0 },
    lastActivity: { A: -Infinity, B: -Infinity },
    stopWords: new Set(),

    time() {
      return now() - conv.startedAt
    },

    // Line our clock up with a shared one, so `elapsed` seconds have
    // already passed in this conversation (used when devices share a room).
    align(elapsed) {
      conv.startedAt = now() - elapsed
    },

    on(fn) {
      listeners.push(fn)
    },

    setStopWords(list) {
      conv.stopWords = new Set(list.map(w => w.toLowerCase()))
    },

    isStopWord(word) {
      return word.length < 3 || conv.stopWords.has(word)
    },

    // `start` (optional) identifies the phrase: a different start means a new
    // phrase, even if the previous one hasn't been finalized yet.
    setInterim(speaker, text, t, start) {
      if (t === undefined) t = conv.time()
      if (!text) {
        conv.interims[speaker] = null
        return
      }
      let current = conv.interims[speaker]
      if (!current || (start !== undefined && current.start !== start)) {
        conv.interims[speaker] = { speaker, text, start: start === undefined ? t : start }
      } else {
        conv.interims[speaker].text = text
      }
      conv.lastActivity[speaker] = t
      emit({ type: 'interim', speaker, text })
    },

    addFinal(speaker, text, start, end) {
      text = (text || '').trim()
      let t = end === undefined ? conv.time() : end
      let interim = conv.interims[speaker]
      // A final relayed with a delay can arrive after the same person has
      // started their next phrase; that newer caption belongs to them still.
      if (interim && interim.start > t) interim = null
      else conv.interims[speaker] = null
      if (start === undefined) {
        start = interim ? interim.start : t - Math.max(1, text.split(/\s+/).length * 0.35)
      }
      if (!text) return
      let utterance = { speaker, text, start, end: t }
      conv.utterances.push(utterance)
      conv.talkTime[speaker] += Math.max(0.3, t - start)
      conv.lastActivity[speaker] = t
      emit({ type: 'utterance', utterance })

      let seen = []
      tokenize(text).forEach((w) => {
        let entry = conv.words[w]
        if (!entry) {
          entry = conv.words[w] = {
            word: w, A: 0, B: 0, first: speaker, firstAt: t, lastAt: t,
            sharedAt: null, score: 0, rarity: rarity(w),
          }
        }
        entry[speaker] += 1
        entry.lastAt = t
        entry.score = (entry.A + entry.B) * Math.pow(entry.rarity, 1.5)
        let interesting = !conv.isStopWord(w) && entry.rarity >= MIN_RARITY_SHOWN
        if (interesting && seen.indexOf(w) === -1) seen.push(w)
        emit({ type: 'word', speaker, entry, interesting })
        if (entry.sharedAt === null && entry.A > 0 && entry.B > 0) {
          entry.sharedAt = t
          if (interesting) {
            conv.sharedCount += 1
            emit({ type: 'shared', speaker, entry })
          }
        }
      })
      for (let i = 0; i < seen.length; i++) {
        for (let j = i + 1; j < seen.length; j++) {
          let key = seen[i] < seen[j] ? seen[i] + '|' + seen[j] : seen[j] + '|' + seen[i]
          conv.pairs[key] = (conv.pairs[key] || 0) + 1
        }
      }
    },

    // The words worth showing right now: distinctive and, ideally, recent.
    topWords(limit) {
      let t = conv.time()
      return Object.values(conv.words)
        .filter(e => !conv.isStopWord(e.word) && e.rarity >= MIN_RARITY_SHOWN)
        .map(e => {
          let recency = Math.exp(-(t - e.lastAt) / 180)
          return { entry: e, rank: e.score * (0.35 + 0.65 * recency) }
        })
        .sort((a, b) => b.rank - a.rank)
        .slice(0, limit)
        .map(r => r.entry)
    },

    // -1 = all speaker A, +1 = all speaker B
    balance() {
      let a = conv.talkTime.A
      let b = conv.talkTime.B
      return a + b === 0 ? 0 : (b - a) / (a + b)
    },

    reset() {
      conv.startedAt = now()
      conv.utterances = []
      conv.interims = { A: null, B: null }
      conv.words = {}
      conv.pairs = {}
      conv.sharedCount = 0
      conv.talkTime = { A: 0, B: 0 }
      conv.lastActivity = { A: -Infinity, B: -Infinity }
      emit({ type: 'reset' })
    },
  }

  function emit(event) {
    listeners.forEach(fn => fn(event))
  }

  return conv
}

function now() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000
}

module.exports = { createConversation, tokenize, rarity }
