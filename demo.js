// A scripted conversation that plays through the same path as live speech,
// so the universe can be seen without a microphone (or without Chrome).

const SCRIPT = [
  ['A', 'I keep thinking about that night we stayed up to watch the meteor shower on the roof'],
  ['B', 'Oh the meteor shower! We counted forty shooting stars and you brought that terrible lemonade'],
  ['A', 'The lemonade was perfect and you know it. My grandmother taught me that recipe with fresh mint from her garden'],
  ['B', 'Your grandmother had the most magical garden. Sunflowers taller than us and jasmine everywhere'],
  ['A', 'I want to plant a garden like that this spring. Sunflowers along the fence, jasmine by the window, maybe tomatoes'],
  ['B', 'Can we put lanterns in the garden too? Little paper lanterns so it glows at night'],
  ['A', 'Yes, lanterns! And a hammock, so we can lie there and look for constellations'],
  ['B', 'I only know the big dipper. You have to teach me the constellations'],
  ['A', 'Deal. I will borrow my uncle\'s telescope and we can find Orion and the Pleiades'],
  ['B', 'A telescope in the garden under the lanterns with a jug of lemonade. That sounds like heaven'],
  ['A', 'We should invite everyone. A summer picnic, music, the whole family'],
  ['B', 'A picnic with your grandmother\'s mint lemonade and a telescope for the kids'],
  ['A', 'And when the meteor shower comes back in August we count shooting stars again'],
  ['B', 'Forty one this time. I am making a wish on every single one'],
  ['A', 'I already know what I will wish for. More nights exactly like this'],
  ['B', 'Me too. Sunflowers, lanterns, constellations, and you'],
]

function createDemo(conv, { onSpeaker, onEnd }) {
  let timer = null
  let playing = false

  function play() {
    stop()
    playing = true
    let line = 0
    let word = 0
    let start = null
    const tick = () => {
      if (!playing) return
      if (line >= SCRIPT.length) {
        playing = false
        onEnd()
        return
      }
      let [speaker, text] = SCRIPT[line]
      let words = text.split(' ')
      if (word === 0) {
        onSpeaker(speaker)
        start = conv.time()
      }
      word += 1
      if (word < words.length) {
        conv.setInterim(speaker, words.slice(0, word).join(' '))
        timer = setTimeout(tick, 170 + Math.random() * 140)
      } else {
        conv.addFinal(speaker, text, start)
        line += 1
        word = 0
        timer = setTimeout(tick, 700 + Math.random() * 600)
      }
    }
    timer = setTimeout(tick, 400)
  }

  function stop() {
    playing = false
    clearTimeout(timer)
  }

  return { play, stop, isPlaying: () => playing }
}

module.exports = { createDemo }
