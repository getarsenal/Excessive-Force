/**
 * The generals, heckling from the corner.
 *
 * The stand-off puts the two of them on stage before the fight and then
 * they are never heard from again. This is the same pair, at a quarter of
 * the size, dropping in with a line at the moments the fight turns: the
 * enemy at half the building standing and again at a tenth, Buck when it
 * comes down. Typed, under the same keys the stand-off uses, and gone in a
 * few seconds; a tap sends it away sooner.
 *
 * One card, reused. It lives inside #ui so the end-of-level rule that hides
 * the interface hides it too.
 */
import { CAST, DEFENDER_OF } from '../game/cast.js';
import { Typewriter } from './typewriter.js';

const ENEMY_HALF = [
  'Half? My grandmother could do half with a garden hose.',
  "You've made a mess. My cleaners bill by the hour.",
  'A scratch. I have had worse from pigeons.',
  'Keep going. My insurers are watching, and they are furious.',
  'Half a building is still a building, you overfunded vandal.',
  'Is that the best America can do? Shocking. Truly.',
];
const ENEMY_LAST = [
  'Fine. FINE. It was ugly anyway.',
  "I hope you're proud. The gift shop was the best part.",
  'You will pay for this. Literally. There will be an invoice.',
  'One more round and I am defecting.',
  'My mother said not to trust a man with that many howitzers.',
];
const BUCK_WIN = [
  "Textbook. Nobody wrote the textbook, but that's what's in it.",
  'Somebody get me a beer and a bulldozer. In that order.',
  "Call the UN. Tell 'em it fell over on its own.",
  "That's not a war crime, that's landscaping.",
  'Freedom: delivered. Signature required.',
  "I've seen prettier rubble. Not by much.",
  'Send the bill to whoever built it. They clearly skimped.',
];

// When the airborne is called in. The enemy says it in his own language, or
// would if Buck had a translator who had not been fired.
const ENEMY_AIRBORNE = [
  'Look up, cowboy. My paratroopers are very keen to meet you.',
  'Reinforcements! Half my army again, and every one of them angry.',
  'You brought artillery. I brought the sky. Fair is fair.',
  'Gentlemen, the drop zone is the American. Go.',
  'I have called my cousins. My cousins own aeroplanes.',
  'Every man I have left is in the air. Duck, or do not. I prefer not.',
];
const BUCK_AIRBORNE = [
  "Translator says that means \"the bus is late.\" Shoot the bus.",
  "No idea what he said. Fired the last translator for spying. Shoot the planes.",
  "He either called in paratroopers or ordered a pizza. Either way, MGs up.",
  "My app says \"the goat has wings.\" Close enough. Light 'em up.",
  "Interpreter quit mid-sentence. I'm guessing that's not a peace offer.",
  "I don't speak whatever that is, but I speak parachute. Kill the parachutes.",
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class ComCard {
  constructor({ level, audio = null }) {
    this.enemy = CAST[DEFENDER_OF[level.id]] || CAST.uk;
    this.tw = new Typewriter(audio);
    this.el = null;
    this._t = 0;
    this._type = 0;
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'comcard';
    el.hidden = true;
    el.innerHTML = '<img class="cc-fig" alt="" draggable="false"><div class="cc-body"><div class="cc-plate"></div><div class="cc-line"></div></div>';
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.hide(); });
    (document.getElementById('ui') || document.body).appendChild(el);
    this.el = el;
    this.fig = el.querySelector('.cc-fig');
    this.plate = el.querySelector('.cc-plate');
    this.line = el.querySelector('.cc-line');
    this.fig.addEventListener('error', () => { this.fig.hidden = true; });
  }

  /** Put a commander up with a line; `side` is 'us' or 'enemy'. */
  say(side, text) {
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
    this.tw.resume();
    let n = 0;
    this._type = setInterval(() => {
      n++;
      this.line.textContent = text.slice(0, n);
      this.tw.key(text[n - 1]);
      if (n >= text.length) {
        clearInterval(this._type);
        this.line.classList.remove('typing');
        this.tw.ding();
      }
    }, 28);
    this._t = setTimeout(() => this.hide(), 2600 + text.length * 70);
  }

  hide() {
    if (!this.el || this.el.hidden) return;
    clearInterval(this._type);
    this.el.classList.remove('in');
    setTimeout(() => { if (!this.el.classList.contains('in')) this.el.hidden = true; }, 260);
  }

  half() { if (performance.now() < (this._quietUntil || 0)) return; this.say('enemy', pick(ENEMY_HALF)); }
  /** The airborne: his boast, then Buck's best guess at what it meant. */
  airborne() {
    this.say('enemy', pick(ENEMY_AIRBORNE));
    this._quietUntil = performance.now() + 20000;
    clearTimeout(this._reply);
    this._reply = setTimeout(() => {
      if (!document.body.classList.contains('ended')) this.say('us', pick(BUCK_AIRBORNE));
    }, 6500);
  }
  /** Signals hear the counter-attack coming: Buck, telling the battery. */
  assaultWarn() { this.say('us', "Intel says he's staging a whole brigade for the drop. Spread the guns, get the MGs up, and hit him before his SAMs are on the ground."); }
  /** The counter-attack: his last throw, then Buck. */
  assault() {
    this.say('enemy', 'Every man I have, every tube, every missile. Now we see who is besieging whom.');
    this._quietUntil = performance.now() + 20000;
    clearTimeout(this._reply);
    this._reply = setTimeout(() => {
      if (!document.body.classList.contains('ended')) this.say('us', 'Mortars all over the map. Find the spotters, kill the tubes, and somebody shell those launchers.');
    }, 6500);
  }
  last() { this.say('enemy', pick(ENEMY_LAST)); }
  win() { this.say('us', pick(BUCK_WIN)); }
}
