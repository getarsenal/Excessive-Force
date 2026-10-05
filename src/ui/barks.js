import * as THREE from 'three';
import { crewName } from '../game/crews.js';

/**
 * The crews talk.
 *
 * Not much, and never over each other: one line on screen at a time, over
 * the gun whose crew said it, for long enough to read, and a few seconds'
 * quiet after it. The lines answer what the battle actually did — a gun hit,
 * a gun lost, a big piece down, the airborne coming in, a crew ranking up —
 * and between those, now and then, they just complain, because that is what
 * soldiers do. Most lines are common; some are rare; a handful are one in a
 * hundred, there for the player who has heard everything else.
 */

// [weight, text]. Weight 1 is rare, 0.15 is a legend.
const L = (...xs) => xs.map((x) => (Array.isArray(x) ? x : [6, x]));
const LINES = {
  deployed: L(
    "Gun's down. Somebody tell the locals to cover their ears.",
    'Emplaced. Lovely view. Shame about it.',
    'Set up and ready. What are we breaking today?',
    'In position. Do we get a souvenir?',
    'Ready to fire. My therapist is going to hear about this.',
    [1, "Mom said I'd end up in Europe. She didn't say how."],
    [0.15, 'I was promised a beach. This is a parking lot.'],
  ),
  unithit: L(
    "We're taking fire! Rude!",
    'Incoming! Who told them where we are?',
    'They have our range! Somebody owes me a helmet!',
    'Getting shot at! Is this in my contract?',
    [1, "Medic! ...Never mind, it's the coffee."],
  ),
  unitlost: L(
    'We lost a gun! Somebody is paying for that.',
    'Gun down! That was a rental!',
    "That's coming out of somebody's pay. Not mine.",
    [1, 'They got the Paladin! I owed that guy twenty bucks!'],
  ),
  rank: L(
    "That's what I'm talking about! Promote us again!",
    'Crew is getting good at this. Should I be worried?',
    "Another chevron. Mom's putting it on the fridge.",
    [1, 'Sergeant now. I demand a better chair.'],
  ),
  bigimpact: L(
    "Ooh, that's gonna leave a mark!",
    'Did you see that? DID YOU SEE THAT?',
    "Somebody call the gift shop. Tell 'em to close early.",
    "That was load-bearing! I'm almost sure!",
    'Timber! ...Partial timber!',
    [1, 'Was that the bakery? I was told there would be a bakery.'],
    [0.15, 'Five hundred years it stood. Eleven minutes with us.'],
  ),
  secondary: L(
    'Secondary! They kept their ammo in THERE?',
    'Something in there did NOT like that.',
    'Ammo dump! Free fireworks!',
  ),
  strike: L(
    'Air support inbound. Show-offs.',
    'Here come the fly boys. Act natural.',
    "Danger close! For them, I mean.",
    [1, 'Fifty million dollars of airplane to drop a rock on a rock.'],
  ),
  shotdown: L(
    'Bird down! Bird down!',
    "That's a very expensive lawn dart.",
    'Somebody find whatever shot that and make it sorry.',
  ),
  samlaunch: L(
    'SAM in the air! Flares, fly boys, flares!',
    'Missile launch! Somebody find that launcher!',
  ),
  airborne: L(
    'Paratroopers! Guns up!',
    "They're dropping in. Literally.",
    'Here come the reinforcements. Theirs, unfortunately.',
  ),
  hqdown: L(
    'Command post is toast! They are deaf and dumb now. Dumber.',
    "That's their phone bill sorted.",
  ),
  win: L(
    'TIMBER!',
    'And that is why you never skip leg day, architecture.',
    'Rounds complete. Next tourist attraction!',
    "Somebody's getting a strongly worded letter.",
    [1, 'Can we keep a brick? Just one brick?'],
  ),
  idle: L(
    'Sarge, can we shoot the coffee shop? Nobody is using it.',
    'Is it lunch yet?',
    "I've been staring at that thing so long I named it.",
    "Anyone else think it's leaning? No? Just me?",
    'My feet hurt.',
    'Remind me which one is the target. The big one? Got it.',
    [1, 'When they said see the world I did not think redecorate it.'],
    [0.15, 'Pretty sure we are on the postcard now.'],
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
    const read = 2.2 + line.length * 0.045;
    this.until = this.t + read;
    this.quiet = this.t + read + 3.5;
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
    const p = this._v.copy(u.pos);
    p.y += 6;
    p.project(this.camera);
    if (p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) {
      // Off screen: pinned to the bottom edge, so it is still read.
      this.el.style.transform = `translate(${Math.round(innerWidth / 2)}px, ${Math.round(innerHeight * 0.72)}px) translate(-50%, -100%)`;
      return;
    }
    const x = (p.x + 1) / 2 * innerWidth, y = (1 - p.y) / 2 * innerHeight;
    const cx = Math.max(130, Math.min(innerWidth - 130, x));
    this.el.style.transform = `translate(${Math.round(cx)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }
}
