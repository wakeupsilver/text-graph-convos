# Speech to text to cloud

## Conversation Universe

The main screen visualizes a conversation between two people as a living night sky:

- **Two stars, one per speaker.** Each star pulses with its speaker's voice.
- **Words become stars.** Distinctive words are born from the speaker's star and drift toward their side of the sky. Words both people use move to the middle, turn gold, and set off a burst of hearts.
- **Constellations.** Faint lines join words that were said in the same sentence.
- **Timeline ribbon.** Each turn shows as a glowing capsule, so you can see the rhythm of who talks when.
- **Balance heart.** It slides toward whoever is talking more and glows gold when the conversation is balanced.
- **Demo.** Plays a scripted conversation, so you can see the visualization without a microphone or Chrome.

Words are ranked by *distinctiveness*: how often they're said here, weighted by how rare they are in everyday spoken English (`word_frequencies.json`, built from the [SUBTLEX-US](https://github.com/words/subtlex-word-frequencies) subtitle frequency list). Very common words are left out automatically, so the stop word list only needs to catch what slips through. Speaker names and stop words can be edited under settings (the cog).

### Who said what

There are two ways to tell the speakers apart:

- **One device (pass the mic).** Tap a star, or press `1` / `2` / `space`, to choose who is speaking. Every phrase recognized after that is credited to them.
- **One device per person (Together).** Press **Together**, pick who is using this device, and start a room. Send the invite link to the other person (and, if you like, a "just watching" link to a big screen). Each person's words come from their own microphone, so attribution is automatic.

In a room, every device sends its speech to a small relay server (`server.js`). The relay stamps each phrase with a shared clock and broadcasts it to the whole room, so every screen shows the same universe. A phone on the table also overhears the other person. When two devices send nearly the same phrase within a few seconds, the relay keeps only the one that heard it louder. On top of that, a device only shares live captions while its own mic is loud enough. That threshold is adjustable in settings under "Ignore quiet sounds". Headphones remove the problem entirely.

### Running it

```
npm install
npm run build
npm start          # serves dist/ and the relay on http://localhost:8080 (PORT=… to change)
npm test           # relay tests
```

Use `npm run watch` in a second terminal while developing.

**Phones need https** for the microphone: browsers only allow it on `https://` pages or `localhost`. Either:
- start the server with a certificate (`HTTPS_CERT=cert.pem HTTPS_KEY=key.pem npm start`, for example one made with [mkcert](https://github.com/FiloSottile/mkcert) for your laptop's LAN address), or
- deploy it to any Node host that serves https, or put a tunnel such as `cloudflared` or `ngrok` in front of it.

Live speech recognition needs Chrome (desktop or Android). The demo and the "just watching" screen work in any modern browser.

## Original notes

This is an experiment inspired by [Amos Blanton's](http://www.amosamos.net/) project [speech2wordcloud](https://gitlab.com/Lightnin/speech2wordcloud).

**Disclaimers**:

- Only works with Google Chrome's native Speech recognition API, which uses cloud services and will potentially violate everything I personally believe about data privacy.
- The use of pre-selected stop words will not work for all contexts and as far as I experienced, the better it gets for one context, the worst it gets for other contexts.
- I have faced various situations where the final word cloud selected words that felt terribly wrong, pointing towards discrimination and racism.
- I do not recommend using this software for anything else than as evidence of how the technologies used are not adequate.
