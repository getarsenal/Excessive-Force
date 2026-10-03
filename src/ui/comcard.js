/**
 * The generals, heckling from the corner.
 *
 * The stand-off puts the two of them on stage before the fight and then
 * they are never heard from again. This is the same pair, at a quarter of
 * the size, dropping in with a line at the moments the fight turns: the
 * enemy at a quarter of the building down, at half, when he sends for his
 * airborne, when he throws in the counter-attack, near the end and when his
 * SAMs bring an aeroplane down; Buck in answer, at the warning, when the
 * battery loses its first gun, and when it comes down. Typed, under the same
 * keys the stand-off uses, and gone in a few seconds; a tap sends it away
 * sooner.
 *
 * The enemy speaks the language he spoke in the stand-off, all the way
 * through (see `chatter.js`): his own, with the English underneath, or
 * English. Buck answers what he thinks he heard. Nothing repeats in a fight
 * until its list has run out.
 *
 * One card, reused. It lives inside #ui so the end-of-level rule that hides
 * the interface hides it too.
 */
import { CAST, DEFENDER_OF } from '../game/cast.js';
import { voiceFor } from '../game/chatter.js';
import { Typewriter } from './typewriter.js';

/** Buck, answering a man he did not understand. */
const BUCK_HEARD = {
  quarter: [
    "Translator says he's asking for a receipt. Give him another one.",
    "Couldn't tell you what that was. Sounded like he wants more. Load 'em up.",
    "My phone says \"the cheese is brave.\" I'll take that as a yes.",
  ],
  half: [
    "Was that a surrender? Sounded like a surrender. Keep firing.",
    "I'm told that was poetry. I'm also told I have no ear for it. Fire for effect.",
    "Half of that was swearing and the other half was swearing louder. Carry on.",
  ],
  airborne: [
    "Translator says that means \"the bus is late.\" Shoot the bus.",
    "No idea what he said. Fired the last translator for spying. Shoot the planes.",
    "He either called in paratroopers or ordered a pizza. Either way, MGs up.",
    "My app says \"the goat has wings.\" Close enough. Light 'em up.",
    "Interpreter quit mid-sentence. I'm guessing that's not a peace offer.",
    "I don't speak whatever that is, but I speak parachute. Kill the parachutes.",
  ],
  assault: [
    "No clue what he said, but the radar just turned white. Find me those mortars.",
    "Translator says \"the uncle is visiting.\" The uncle brought a brigade. Spread out.",
    "Whatever that was, it came with missiles. Somebody shell those launchers.",
    "He's yelling and the sky's full of parachutes. Spotters first, then the tubes.",
  ],
  last: [
    "He sounds sad. Or hungry. Either way, one more volley.",
    "I think that was a counter-offer. Counter-offer declined.",
    "My app gave up and just shows a crying face. Same, buddy. Fire.",
  ],
  samkill: [
    "Whatever he's crowing about, he just cost me a pilot. Find those launchers.",
    "That's my aeroplane he's laughing at. Shell the SAMs before the next one goes in.",
  ],
};

/** Buck, answering a man he did understand. */
const BUCK_REPLY = {
  quarter: [
    "Your grandmother should invest in a better roof.",
    "Pigeons don't bill by the hour. I do.",
  ],
  half: [
    "Tell your insurers I'm not finished.",
    "Half's a start. I'm a finisher.",
  ],
  airborne: [
    "Paratroopers. Great. MGs up, and aim for the big slow ones.",
    "Your cousins are welcome. Our machine guns are welcoming.",
  ],
  assault: [
    "That's the whole army? Good. Saves me looking for it. Spotters first.",
    "Mortars everywhere and missiles on pallets. Counter-battery, people. Now.",
  ],
  last: [
    "Send the invoice to Washington. Mark it urgent. They love urgent.",
    "Changing sides? We're full. Fire.",
  ],
  samkill: [
    "Lost a bird. I want those launchers in pieces before the next sortie.",
  ],
};

const BUCK_WARN = [
  "Intel says he's staging a whole brigade for the drop. Spread the guns, get the MGs up, and hit him before his SAMs are on the ground.",
  "Signals picked up a brigade on the move. Heavy drop at three quarters. Dig in, spread out, and keep some money back.",
  "He's emptying the barracks for one last throw. Guns apart, machine guns up, and buy me something that reaches.",
];
const BUCK_LOST = [
  "We lost a gun. Somebody owes me a gun.",
  "That was a perfectly good howitzer. Find whoever did that.",
  "Man down. Move the rest before they get the range.",
];
const BUCK_WIN = [
  "Textbook. Nobody wrote the textbook, but that's what's in it.",
  'Somebody get me a beer and a bulldozer. In that order.',
  "Call the UN. Tell 'em it fell over on its own.",
  "That's not a war crime, that's landscaping.",
  'Freedom: delivered. Signature required.',
  "I've seen prettier rubble. Not by much.",
  'Send the bill to whoever built it. They clearly skimped.',
  'Rubble. Lovely, patriotic rubble.',
  "Somebody tell the gift shop they're having a closing-down sale.",
  "And that's why you don't argue with a man who brought this many guns.",
];

/** A deck that deals without repeats until it is empty, then shuffles. */
function deck(list) {
  let left = [];
  return () => {
    if (!left.length) left = list.map((_, i) => i);
    const k = Math.floor(Math.random() * left.length);
    return list[left.splice(k, 1)[0]];
  };
}

export class ComCard {
  constructor({ level, audio = null }) {
    this.enemy = CAST[DEFENDER_OF[level.id]] || CAST.uk;
    this.voice = voiceFor(level.id);
    this.tw = new Typewriter(audio);
    this.el = null;
    this._t = 0;
    this._type = 0;
    this._decks = new Map();
  }

  _deal(key, list) {
    if (!this._decks.has(key)) this._decks.set(key, deck(list));
    return this._decks.get(key)();
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'comcard';
    el.hidden = true;
    el.innerHTML = '<img class="cc-fig" alt="" draggable="false"><div class="cc-body"><div class="cc-plate"></div><div class="cc-line" dir="auto"></div><div class="cc-sub" dir="ltr"></div></div>';
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.hide(); });
    (document.getElementById('ui') || document.body).appendChild(el);
    this.el = el;
    this.fig = el.querySelector('.cc-fig');
    this.plate = el.querySelector('.cc-plate');
    this.line = el.querySelector('.cc-line');
    this.sub = el.querySelector('.cc-sub');
    this.fig.addEventListener('error', () => { this.fig.hidden = true; });
  }

  /**
   * Put a commander up with a line; `side` is 'us' or 'enemy'. `sub` is the
   * English under a line in his own language, shown once the line is typed.
   */
  say(side, text, sub = null) {
    if (!this.el) this._build();
    const who = side === 'us' ? CAST.us : this.enemy;
    const el = this.el;
    clearTimeout(this._t);
    clearInterval(this._type);
    el.hidden = false;
    el.classList.remove('in', 'us', 'enemy');
    void el.offsetWidth;
    el.classList.add('in', side === 'us' ? 'us' : 'enemy');
    el.style.setProperty('--cc', who.colours ? who.colours[0] : '#e06c34');
    this.fig.hidden = false;
    if (this.fig.getAttribute('src') !== who.file) this.fig.src = who.file;
    this.plate.textContent = `${who.rank} ${who.name}`;
    this.line.textContent = '';
    this.line.classList.add('typing');
    this.sub.textContent = sub || '';
    this.sub.classList.remove('in');
    this.sub.hidden = !sub;
    this.tw.resume();
    const chars = [...text];
    let n = 0;
    this._type = setInterval(() => {
      n++;
      this.line.textContent = chars.slice(0, n).join('');
      this.tw.key(chars[n - 1]);
      if (n >= chars.length) {
        clearInterval(this._type);
        this.line.classList.remove('typing');
        this.tw.ding();
        if (sub) this.sub.classList.add('in');
      }
    }, 28);
    const read = Math.max(text.length, sub ? sub.length : 0);
    this._t = setTimeout(() => this.hide(), 2600 + read * 70 + (sub ? 1200 : 0));
  }

  hide() {
    if (!this.el || this.el.hidden) return;
    clearInterval(this._type);
    this.el.classList.remove('in');
    setTimeout(() => { if (!this.el.classList.contains('in')) this.el.hidden = true; }, 260);
  }

  _quiet() { return performance.now() < (this._quietUntil || 0); }

  /**
   * The enemy at a moment, and, `p` of the time, Buck after him: misreading
   * it if it was not English, answering it if it was.
   */
  _exchange(moment, p = 0.5, hold = 0) {
    const s = this.voice.say(moment);
    if (!s) return;
    this.say('enemy', s.line, s.sub);
    if (hold) this._quietUntil = performance.now() + hold;
    clearTimeout(this._reply);
    if (Math.random() >= p) return;
    const pool = (this.voice.native ? BUCK_HEARD : BUCK_REPLY)[moment];
    if (!pool) return;
    const wait = 3200 + Math.max(s.line.length, s.sub ? s.sub.length : 0) * 70 + (s.sub ? 1200 : 0);
    this._reply = setTimeout(() => {
      if (!document.body.classList.contains('ended')) this.say('us', this._deal(`buck-${moment}-${this.voice.native}`, pool));
    }, Math.min(9000, wait));
  }

  quarter() { if (!this._quiet()) this._exchange('quarter', 0.35); }
  half() { if (!this._quiet()) this._exchange('half', 0.5); }
  last() { this._exchange('last', 0.4); }
  /** The airborne: his boast, then Buck's answer. */
  airborne() { this._exchange('airborne', 1, 20000); }
  /** Signals hear the counter-attack coming: Buck, telling the battery. */
  assaultWarn() { this.say('us', this._deal('warn', BUCK_WARN)); this._quietUntil = performance.now() + 9000; }
  /** The counter-attack: his last throw, then Buck. */
  assault() { this._exchange('assault', 1, 20000); }
  /** One of the player's aeroplanes brought down by his SAMs. */
  samKill() { if (!this._quiet()) this._exchange('samkill', 0.6, 9000); }
  /** The battery's first loss. */
  firstLoss() {
    if (this._lostOnce || this._quiet()) return;
    this._lostOnce = true;
    this.say('us', this._deal('lost', BUCK_LOST));
  }
  win() { this.say('us', this._deal('win', BUCK_WIN)); }
}
