import * as THREE from 'three';
import { crewName } from '../game/crews.js';

/**
 * The crews talk.
 *
 * Small, and out of the way: a line of little text floating over the gun
 * whose crew said it, the kind of thing you catch if you are looking at
 * them and miss if you are not. No box, no bubble. One at a time, for long
 * enough to read, and a few seconds' quiet after it. The lines answer what
 * the battle actually did — a gun hit, a gun lost, a big piece down, the
 * airborne coming in — and between those, now and then, they complain,
 * because that is what soldiers do, and they are not polite about any of
 * it. Most lines are common; some are rare; a handful are one in a hundred.
 */

// [weight, text]. Weight 1 is rare, 0.15 is a legend.
const L = (...xs) => xs.map((x) => (Array.isArray(x) ? x : [6, x]));
const LINES = {
  deployed: L(
    "Gun's up. Somebody wake me when there's something worth shooting.",
    'Set. Lovely view. Shame about what we\'re about to do to it.',
    'In position. Whose brilliant idea was this spot?',
    "Ready. Tell the locals to kiss their windows goodbye.",
    "Emplaced. Where's the damn coffee?",
    [1, 'Recruiter said travel. Didn\'t say we\'d bring the demolition.'],
    [0.15, 'I was promised a beach. This is a car park with a view.'],
  ),
  unithit: L(
    'Taking fire! Who the hell told them where we are?',
    'Incoming! Somebody shoot back, I\'m busy flinching!',
    "They've got our range. Fantastic. Love that for us.",
    'Getting shot at. Is this in the brochure?',
    [1, 'Medic! ...False alarm. Spilled my coffee.'],
  ),
  unitlost: L(
    'We lost a gun! That\'s coming out of somebody\'s pay. Not mine.',
    'Gun down! It was a rental, you animals!',
    'Well, that one\'s scrap. Hope it was insured.',
    [1, 'They got the Paladin. Guy owed me twenty bucks. Typical.'],
  ),
  rank: L(
    'Promoted! Still doing the same job for the same pay. Hooah.',
    "We're getting good at this. Should probably worry about that.",
    "Another stripe. Mom's putting it on the fridge next to the restraining order.",
    [1, 'Sergeant. I want a chair. A real one. With a back.'],
  ),
  bigimpact: L(
    "Oh, that's gonna leave a mark.",
    'Did you SEE that? Somebody tell the gift shop to close early.',
    'That was load-bearing. Pretty sure. Mostly sure.',
    'Timber! Partial timber. Shut up, it counts.',
    "Five hundred years to build. Eleven minutes with us. You're welcome.",
    [1, 'Was that the bakery? I was told there\'d be a bakery.'],
    [0.15, 'Somewhere an architect just felt a chill.'],
  ),
  secondary: L(
    'Secondary! They kept their ammo in THERE? Idiots.',
    'Something in there did not enjoy that one bit.',
    'Free fireworks! Courtesy of their own damn supply sergeant.',
  ),
  strike: L(
    'Air support inbound. Here come the show-offs.',
    'Fly boys on the way. Everybody act casual.',
    "Danger close. For them. Mostly them.",
    [1, 'Fifty million bucks of jet to drop a rock on a rock. Your taxes.'],
  ),
  shotdown: L(
    'Bird down! That is a very expensive lawn dart.',
    "Plane's gone. Somebody find what shot it and make it regret it.",
    'There goes the Air Force budget. Again.',
  ),
  samlaunch: L(
    'SAM in the air! Flares, fly boy, flares!',
    'Missile launch! Somebody find that damn launcher!',
  ),
  airborne: L(
    'Paratroopers! Guns up, aim for the pretty canopies.',
    "They're dropping in. Literally. Shoot 'em on the way down.",
    'Reinforcements. Theirs. Of course theirs.',
  ),
  hqdown: L(
    'Command post is toast! They\'re deaf, dumb and dumber now.',
    "That's their phone bill sorted.",
  ),
  win: L(
    'TIMBER!',
    'Rounds complete. Next tourist trap!',
    "Somebody's getting a very strongly worded letter.",
    'And THAT is why you never skip leg day, architecture.',
    [1, 'Can we keep a brick? One brick. For my mom.'],
  ),
  idle: L(
    'Sarge, can we shoot the coffee shop? Nobody\'s using it.',
    'Is it lunch yet? It\'s lunch somewhere.',
    "Been staring at that thing so long I named it. It's Gary.",
    "Anyone else think it's leaning? No? Just me? Fine.",
    'My feet hurt. My back hurts. The gun\'s fine though.',
    'Remind me which one\'s the target. The big one? Great, got it.',
    [1, 'They said see the world. Didn\'t mention we\'d flatten it.'],
    [0.15, 'Pretty sure we\'re on the postcard now.'],
  ),
};

function choose(list, last) {
  let total = 0;
  for (const [w, t] of list) if (t !== last) total += w;
  let r = Math.random() * total;
  for (const [w, t] of list) {
    if (t === last) continue;
    r -= w;
    if (r <= 0) return t;
  }
  return list[0][1];
}

export class Barks {
  constructor({ camera, battle }) {
    this.camera = camera;
    this.battle = battle;
    this.el = document.createElement('div');
    this.el.className = 'bark';
    this.el.hidden = true;
    this.el.innerHTML = '<b></b><span></span>';
    (document.getElementById('ui') || document.body).appendChild(this.el);
    this.unit = null;
    this.until = 0;
    this.quiet = 0;          // global: nothing new before this
    this.cool = {};          // per kind
    this.last = {};          // last line per kind, never twice running
    this.t = 0;
    this.idleAt = 40 + Math.random() * 30;
    this._v = new THREE.Vector3();
    this.enabled = true;
  }

  /** Something happened: maybe a crew has something to say about it. */
  say(kind, near = null) {
    if (!this.enabled || !LINES[kind]) return;
    if (this.t < this.quiet || this.t < (this.cool[kind] || 0)) return;
    const live = this.battle.units.filter((u) => u.alive && u.crew);
    if (!live.length) return;
    let u = live[(Math.random() * live.length) | 0];
    if (near && near.x !== undefined) {
      let bd = Infinity;
      for (const c of live) {
        const d = (c.pos.x - near.x) ** 2 + (c.pos.z - near.z) ** 2;
        if (d < bd) { bd = d; u = c; }
      }
    }
    if (near && near.crew && near.alive) u = near;
    const line = choose(LINES[kind], this.last[kind]);
    this.last[kind] = line;
    this.unit = u;
    this.el.querySelector('b').textContent = crewName(u, { short: true });
    this.el.querySelector('span').textContent = line;
    this.el.hidden = false;
    this.el.classList.remove('in');
    void this.el.offsetWidth;
    this.el.classList.add('in');
    const read = 2.4 + line.length * 0.05;
    this.until = this.t + read;
    this.quiet = this.t + read + 4;
    this.cool[kind] = this.t + (kind === 'idle' ? 50 : 14);
  }

  update(dt) {
    this.t += dt;
    if (this.battle.state === 'playing' && this.t > this.idleAt) {
      this.idleAt = this.t + 45 + Math.random() * 40;
      this.say('idle');
    }
    if (this.el.hidden) return;
    const u = this.unit;
    if (this.t > this.until || !u || !u.alive) { this.el.hidden = true; return; }
    // In the talk band under the top bar, over the gun's column: never in
    // the lower middle of the screen, where the fingers are. Off screen,
    // not shown at all.
    const p = this._v.copy(u.pos);
    p.y += 4.5;
    p.project(this.camera);
    if (p.z > 1 || Math.abs(p.x) > 1.0 || Math.abs(p.y) > 1.0) { this.el.style.opacity = '0'; return; }
    this.el.style.opacity = '';
    const x = (p.x + 1) / 2 * innerWidth;
    const cx = Math.max(120, Math.min(innerWidth - 120, x));
    this.el.style.transform = `translate(${Math.round(cx)}px, 0) translate(-50%, 0)`;
  }
}
