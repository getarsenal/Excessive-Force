import * as THREE from 'three';
import { access } from '../core/access.js';
import { UNITS_BY_ID } from '../game/units.js';
import { Typewriter } from './typewriter.js';

/**
 * Boot Camp: the guided first level.
 *
 * Short on words by design. Each step puts a pulsing ring on the real control
 * — the dock button, the card, the readout, or the spot on the map to tap —
 * and a two-line card beside it: what it is, and what it does. A step moves
 * on when the player actually does the thing (opens the drawer, arms the gun,
 * puts it down, designates the tower), or on GOT IT where there is nothing to
 * do but look. SKIP ends it at any point; SKIP STEP turns up on a step that
 * has not taken after forty seconds.
 *
 * Five chapters: the screen, the battery (the guns, the airlift, a line of
 * them, the machine gun, a gun's own card), fire control (designating, the
 * survey, fire modes, smoke), the high-value targets on a practice SAM
 * compound and command post that main.js builds for Boot Camp alone, and the
 * enemy (defenders, the drops, the hunt at the end). Steps whose subject is
 * not there are left out. Between steps the General answers what the battle
 * actually does, once each — see `onEvent`.
 *
 * It is written against the HUD as it is. Anything that changes the dock, the
 * drawers, the cards, targeting or the strikes changes a step here in the same
 * commit (CLAUDE.md says so), and the tutorial level's suite run is how that
 * is caught when it is forgotten.
 */

const DONE_KEY = 'tt.tutorial';
const CHAPTERS = ['ORIENTATION', 'THE BATTERY', 'FIRE CONTROL', 'HIGH-VALUE TARGETS', 'THE ENEMY'];
// A step the player is doing rather than reading offers SKIP STEP after this
// long, so one that will not take (a gun that will not fit, a drop that did
// not come) never strands them.
const STUCK_S = 40;

/** Has this browser been offered Boot Camp yet? */
export function tutorialSeen() {
  try { return !!localStorage.getItem(DONE_KEY); } catch { return true; }
}
export function markTutorialSeen(v = 'offered') {
  try { if (localStorage.getItem(DONE_KEY) !== 'done') localStorage.setItem(DONE_KEY, v); } catch { /* private mode */ }
}

export class Tutorial {
  /**
   * @param {object} o
   * @param {object} o.hud  @param {object} o.battle  @param {object} o.rig
   * @param {THREE.Camera} o.camera  @param {THREE.Vector3} o.origin
   * @param {number} o.groundY  @param {object} o.level
   */
  constructor(o) {
    Object.assign(this, o);
    const L = o.level;
    // Where to tap: the tower's shaft, and open ground between it and the
    // camera, a gun's comfortable distance out.
    const aim = L.tutorialAim || { x: 0, y: 30, z: -6 };
    this.towerAt = new THREE.Vector3(o.origin.x + aim.x, o.groundY + aim.y, o.origin.z + aim.z);
    const yaw = L.camera?.yaw ?? 0.5;
    // Inside the ground the town was cleared from, just off the buildings.
    // Open ground off to one side, clear of the trench line round the tower
    // and the garden inside it, still well inside the cleared practice ground.
    const R = Math.max(60, (L.cityExcludeRadius ?? 80) - 20);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);        // toward the camera
    const sx = Math.cos(yaw), sz = -Math.sin(yaw);       // to the camera's right
    const at = (f, r) => {
      const x = o.origin.x + fx * f + sx * r, z = o.origin.z + fz * f + sz * r;
      return new THREE.Vector3(x, o.groundY, z);
    };
    // Level with the tower, out to its side: on screen that is the middle
    // band, clear of the dock — a ring nearer the camera sits under the
    // buttons, and a tap on it is a tap on UNITS.
    this.groundAt = at(0, R * 0.7);
    // The battery: a row on the other flank.
    this.rowFrom = at(0, -R * 0.4);
    this.rowTo = at(0, -R * 0.8);
    this.yaw0 = null;
    this.i = -1;
    this._w2 = new THREE.Vector3();
    this._w3 = new THREE.Vector3();
    this._queue = [];
    this._told = new Set();
    this._build();
    // A step about something this Boot Camp has not got (no practice SAM on
    // a suite run, say) is left out, so the count is honest.
    this.steps = this._steps().filter((s) => !s.skip || !s.skip());
    if (typeof window !== 'undefined') window.__tutorial = this;   // for the harness and the console
    this.next();
  }

  _steps() {
    const h = this.hud, b = this.battle;
    const armedGun = () => !!b.selectedUnitId && !this._isStrike(b.selectedUnitId);
    const site = () => b.sams?.sites?.[0] || null;
    const siteLive = () => {
      const st = site();
      if (!st) return null;
      const l = st.launchers.find((x) => x.alive);
      if (l) return new THREE.Vector3(l.x, l.y + 2, l.z);
      if (st.radar?.alive) return new THREE.Vector3(st.radar.x, this.groundY + 2, st.radar.z);
      return new THREE.Vector3(st.x, st.y + 2, st.z);
    };
    const hqAt = () => (b.hq ? new THREE.Vector3(b.hq.x, b.hq.y + 3, b.hq.z) : null);
    return [
      // ── 1. Orientation.
      { ch: 0, el: '#topbar .tb-center', title: 'TARGET', ok: true,
        text: 'The range tower. The bar fills as it comes down, and the number is how much is down: fill it to the WIN mark at 90%. In a real battle the marks along the bar are weapon unlocks. Tap the name any time to fly back here.',
        say: "Welcome to Fort Irwin, maggot. That tower cost the taxpayer eleven million dollars. Let's waste it." },
      { ch: 0, el: null, title: 'LOOK AROUND', text: 'Drag to orbit the camera round the target.',
        enter: () => { this.yaw0 = this.rig.yaw; },
        done: () => this.yaw0 != null && Math.abs(this.rig.yaw - this.yaw0) > 0.35 },
      { ch: 0, el: null, title: 'ZOOM', text: 'Pinch, or scroll, to zoom in and out.',
        enter: () => { this.dist0 = this.rig.distance; },
        done: () => this.dist0 != null && Math.abs(this.rig.distance - this.dist0) / this.dist0 > 0.22 },
      { ch: 0, el: '#topbar .tb-block:first-child', title: 'FUNDS', ok: true,
        text: 'Funds pay for guns and strikes; income ticks in, and everything you knock down pays: stone, men, and the gold-marked targets most of all. Everything is free in Boot Camp.',
        say: "It's all free today. Don't get used to it. Congress reads the receipts like a hawk with a hangover." },

      // ── 2. The battery.
      { ch: 1, el: '#dock-units', title: 'UNITS', text: 'Your guns and troops, cheapest first. Tap to open.',
        done: () => h.openDrawer === 'units' || armedGun() },
      { ch: 1, el: '#buildbar .unit-card[data-id="m119"]', fallback: '#dock-units', title: 'M119 HOWITZER',
        text: 'The cheapest gun: a light shell and a fast reload. Tap to arm it.', done: () => armedGun() || this._placed(),
        say: 'A howitzer. The loud end goes toward the building. Even a second lieutenant can manage that.' },
      { ch: 1, world: () => this.groundAt, fallback: '#dock-units', title: 'DEPLOY',
        text: 'Tap open ground. The ring is its reach. Roads and flat roofs take guns too.', done: () => this._placed() },
      { ch: 1, world: () => this._dropAt(), title: 'AIRLIFT',
        text: 'Guns come by air. Everything placed in the next 8 s ships on one aircraft, so place more now if you want them.',
        done: () => this._inbound() || this._deployed() },
      { ch: 1, world: () => this._liftAt() || this._dropAt(), title: 'INBOUND',
        text: 'A C-130 drops it by parachute; heavy guns hang under a Chinook. In a real battle their flak and SAMs fire at the transports, and one shot down takes its cargo with it.',
        done: () => this._deployed(),
        say: "Watch the Herc. If they shoot it down, it comes out of your pay. You don't get paid. Figure it out." },
      { ch: 1, world: () => this.rowFrom, world2: () => this.rowTo, title: 'A BATTERY',
        text: 'M119 is armed again. Press on open ground and drag: one gun every 11 m, all in one lift.',
        enter: () => {
          if (!armedGun()) b.selectUnit('m119');
          h.closeDrawer?.();
          // Both ends of the drag on screen, wherever the camera has wandered.
          this._fly(this._w3.copy(this.rowFrom).lerp(this.rowTo, 0.5).setY(this.groundY + 2), 150);
        },
        done: () => this._count() >= 3,
        say: 'One gun is a hobby. A row of them is a foreign policy.' },
      { ch: 1, el: '#buildbar .unit-card[data-id="m240"]', fallback: '#dock-units', title: 'M240 MG',
        text: 'Two men and a machine gun, $40. Light damage, but whatever it hits is pinned and fires a third as often, and it shoots at aircraft and parachutes. Arm it and put one down within 340 m of the enemy.',
        enter: () => { b.selectedUnitId = null; if (h.openDrawer !== 'units') h.setDrawer?.('units'); },
        done: () => this._has('m240'),
        say: "Two boys and a belt of ammo. They won't knock anything down, but nobody shoots straight with their face in the dirt." },
      { ch: 1, world: () => this._unitAt(), title: 'YOUR GUNS',
        text: 'Tap one of your guns. Its card shows its health, its kills and its rank: crews that land rounds reload faster and group tighter. SELL gets half its price back.',
        enter: () => { b.selectedUnitId = null; h.closeDrawer?.(); this._fly(this._unitAt(), 110); },
        done: () => !!this.unitCard?.unit },

      // ── 3. Fire control.
      { ch: 2, world: () => this.towerAt, title: 'DESIGNATE', text: 'Tap the tower. Every gun lays on that spot.',
        done: () => !!b.target,
        enter: () => {
          b.selectedUnitId = null; h.closeDrawer?.(); h.hidePrompt?.(); this.unitCard?.hide?.();
          this._fly(this.towerAt, this.level.camera?.distance);
        } },
      { ch: 2, el: '#targetcard', title: 'TARGET CARD', text: 'What you are hitting, how high it stands, and how many guns are on it.', ok: true },
      { ch: 2, el: '#survey-btn', title: 'SURVEY', text: `Paints the load on every stone. ${access.cb ? 'Yellow' : 'Red'} stone holds the rest up: cut it and what is above comes down.`, done: () => h.survey,
        say: access.cb ? 'Yellow is holding the rest up. Shoot the yellow. They taught you colours in basic, right?'
          : 'Red is holding the rest up. Shoot the red. They taught you colours in basic, right?' },
      { ch: 2, el: '#survey-btn', title: 'SURVEY OFF', text: 'Tap again to see the stone. V on a keyboard.', done: () => !h.survey, ok: true },
      { ch: 2, el: '#dock-orders', title: 'ORDERS', text: 'How the guns shoot. Tap to open.', done: () => h.openDrawer === 'orders' },
      { ch: 2, el: '#orders-modes [data-mode="area"]', fallback: '#orders-modes', title: 'FIRE MODE',
        text: 'POINT keeps the group tight on the spot. AREA walks it over the ground round it, for a face or a trench line. DELAY bursts inside the stone. Tap AREA.',
        enter: () => { if (h.openDrawer !== 'orders') h.setDrawer?.('orders'); },
        done: () => b.fireMode === 'area' },
      { ch: 2, el: '#orders-smoke', fallback: '#dock-orders', title: 'SMOKE',
        text: 'A smoke screen between your guns and the target: the garrison cannot shoot through it. Tap SMOKE.',
        enter: () => { if (h.openDrawer !== 'orders') h.setDrawer?.('orders'); },
        done: () => b.smokeCooldown > 0,
        say: 'Smoke. The poor man\'s invisibility cloak. Works better than the expensive kind.' },
      { ch: 2, el: '#uc2-lay', fallback: '#dock-units', title: 'LAY IT YOURSELF',
        text: 'Tap a gun, then LAY: you are standing at the breech. Drag to aim it — the line is the shell\'s flight, the mark where it lands — and ZOOM looks through the gun\'s own sight, its cross on the point of impact. Press FIRE; the ring round it fills as the crew reload. A machine gun held on FIRE heats, and run hot it locks till it cools. SURVEY still works here. A hand-laid hit pays a bonus. DONE hands it back.',
        enter: () => {
          b.selectedUnitId = null; h.closeDrawer?.();
          const u = b.units.find((x) => x.alive && b.canLay(x));
          if (u) { this.unitCard?.show?.(u); this._fly(u.pos, 110); }
        },
        done: () => b.handShots > 0,
        say: 'Lay it yourself. If you want a thing hit properly, you put your own thumb on it.' },

      // ── 4. High-value targets.
      { ch: 3, world: () => siteLive(), title: 'GOLD DIAMONDS', ok: true, skip: () => !site(),
        text: 'Gold diamonds mark the targets worth the most. This is a SAM compound: an earth ring, two launchers and a radar. In a real battle it is guarded, and it fires on every aircraft you send, the airlift too. This one is a dummy.',
        enter: () => { h.closeDrawer?.(); this._fly(siteLive(), 170); },
        say: 'That is a missile site. In a real war it shoots down my airplanes. I hate it already.' },
      { ch: 3, world: () => siteLive(), title: 'TAKE IT OUT', skip: () => !site(),
        text: 'Tap a launcher or the radar and every gun lays on it: a launcher takes about three square hits. The radar first pays a bonus. Or call a strike on it. Wreck everything in the ring and the compound is down.',
        enter: () => { this._fly(siteLive(), 170); },
        done: () => !!site()?.down },
      { ch: 3, el: '#strikebar .unit-card.free', fallback: '#dock-strikes', title: 'FREE STRIKE', skip: () => !site(),
        text: 'A compound down pays $15,000 and a free air strike, any up to the F-15: the cards say FREE. Open STRIKES and call one. The A-10 strafes a line you drag; the rest make one pass at what you tap; LOITER cards stay on station, and with a gunship or an Apache up, GUNNER puts you at its guns.',
        enter: () => { this.credits0 = b.strikeCredits; },
        done: () => b.strikeCredits < (this.credits0 ?? 0) || this._striking(),
        say: 'A free one. Nothing in the Army is free. Somebody shot down a missile site for that.' },
      { ch: 3, world: () => hqAt(), title: 'COMMAND POST', skip: () => !b.hq,
        text: 'The command post runs their garrison: bunker, mast, dish. Destroy it and for 90 s their crews fire slower and their mortars go blind, and any drop they send for comes a third short.',
        enter: () => { h.closeDrawer?.(); this._fly(hqAt(), 120); },
        done: () => !!b.hq && !b.hq.alive,
        say: 'Cut off the head and the body runs around for a while. That is a military term.' },
      { ch: 3, el: null, title: 'MORE GOLD', ok: true,
        text: 'In a real battle, also in gold: the ammo depot (they fire slower for the rest of the fight); their artillery battery (silence it and your guns reload faster); the road checkpoint (no more trucks of men up the road); and the general\'s own car when he drives in, $20,000. Three gold kills in a minute brings a free fire mission.',
        enter: () => this._fly(this.towerAt, null) },

      // ── 5. The enemy.
      { ch: 4, el: '#topbar .tb-block.right', title: 'DEFENDERS', ok: true,
        text: 'How many are left. They shoot your guns, and their flak fires at aircraft. Hit their posts: the crates and drums by their guns go up.' },
      { ch: 4, el: null, title: 'DROPS', ok: true,
        text: 'Halfway down, transports drop more men round the building; at three quarters a counter-attack lands all over the map with mortars and SAMs. Shoot the planes and the parachutes. A drop has to be cleared to win: once the building falls, every man left gets a red marker, and any hiding in the town break cover.',
        say: 'You will want machine guns up when the airborne come. Lots of them. I am not asking.' },
      { ch: 4, el: '#dock-menu', title: 'MENU', ok: true,
        text: 'RESUME, RESTART and MAIN MENU; SETTINGS holds sound, OPTICS (thermal and night vision, or T), accessibility and quality. Leave mid-fight and the battle is saved: CONTINUE picks it up.' },
      { ch: 4, el: null, title: 'STARS', ok: true,
        text: 'Every battle has three stars: win it, beat two of its par marks, and its own challenge. The campaign is eight operations of four battles and a boss; six stars in an operation open its boss. Stars also buy DOCTRINE: permanent upgrades, refundable any time.',
        say: 'Stars. Like a hotel, but for destruction. Collect them. I want a five-star war.' },
      { ch: 4, el: '.integrity-wrap', title: 'BRING IT DOWN',
        text: 'Keep firing until it falls. Every battle pays XP toward your next rank, won or not; Boot Camp pays your first.',
        done: () => b.state === 'won',
        say: "Stop admiring it and knock the damn thing over. I've got a tee time." },
    ];
  }

  _isStrike(id) { return !!UNITS_BY_ID[id]?.strike; }
  _deployed() { return this.battle.units.some((u) => u.alive); }
  _placed() { return this.battle.pending.length > 0 || this._deployed(); }
  _count() { return this.battle.units.filter((u) => u.alive).length + this.battle.pending.length; }
  _has(id) {
    return this.battle.units.some((u) => u.alive && u.def.id === id) || this.battle.pending.some((d) => d.def?.id === id);
  }
  _unitAt() {
    const u = this.battle.units.find((x) => x.alive);
    return u ? this._w2.copy(u.pos).setY(u.pos.y + 2) : this.groundAt;
  }
  _inbound() { return !!this.battle.air?.sorties.some((s) => s.lift); }
  _dropAt() { const d = this.battle.pending[0]; return d ? d.pos : this.groundAt; }
  _liftAt() {
    const s = this.battle.air?.sorties.find((x) => x.lift);
    return s?.model ? s.model.getWorldPosition(this._w || (this._w = new THREE.Vector3())) : null;
  }
  _striking() {
    const a = this.battle.air;
    return !!a && (a.sorties.some((s) => !s.lift && !s.heli) || (a.loiterStatus && a.loiterStatus().length > 0));
  }
  /** Fly the camera to a point, for a step about something off screen. */
  _fly(p, dist) { if (p && this.rig?.focus) this.rig.focus(p, dist || undefined); }

  _build() {
    const root = document.createElement('div');
    root.id = 'tut';
    root.innerHTML = `
      <div class="tut-ring" hidden></div>
      <div class="tut-gen" hidden>
        <img class="tut-gen-face" src="assets/characters/us-general.png" alt="">
        <div class="tut-gen-body"><b>GEN. BUCK HOLLISTER</b><span class="tut-gen-line"></span>
          <button type="button" class="tut-gen-ok">CARRY ON</button></div>
      </div>
      <div class="tut-ring tut-ring2" hidden></div>
      <div class="tut-card">
        <div class="tut-ch"></div>
        <div class="tut-head"><b class="tut-title"></b><span class="tut-count"></span><button type="button" class="tut-skip">SKIP</button></div>
        <div class="tut-text"></div>
        <div class="tut-foot">
          <button type="button" class="tut-ok" hidden>GOT IT</button>
          <button type="button" class="tut-skipstep" hidden>SKIP STEP</button>
        </div>
        <div class="tut-progress"><i></i></div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.ring = root.querySelector('.tut-ring');
    this.card = root.querySelector('.tut-card');
    this.ring2 = root.querySelector('.tut-ring2');
    this.gen = root.querySelector('.tut-gen');
    this.genLine = root.querySelector('.tut-gen-line');
    root.querySelector('.tut-skip').addEventListener('click', () => this.finish('skipped'));
    root.querySelector('.tut-ok').addEventListener('click', () => this.next());
    root.querySelector('.tut-skipstep').addEventListener('click', () => this.next());
    root.querySelector('.tut-gen-ok').addEventListener('click', () => this.hush());
    this._v = new THREE.Vector3();
  }

  next() {
    if (!this.root) return;
    this.i++;
    // Past any step whose subject has gone since the list was made.
    while (this.i < this.steps.length && this.steps[this.i].skip?.()) this.i++;
    if (this.i >= this.steps.length) { this.finish('done'); return; }
    const s = this.steps[this.i], n = this.steps.length;
    const q = (c) => this.root.querySelector(c);
    const ch = s.ch ?? 0;
    q('.tut-ch').textContent = `${ch + 1} · ${CHAPTERS[ch] || ''}`;
    q('.tut-title').textContent = s.title;
    q('.tut-text').textContent = s.text;
    q('.tut-count').textContent = `${this.i + 1}/${n}`;
    q('.tut-ok').hidden = !s.ok;
    q('.tut-skipstep').hidden = true;
    q('.tut-progress > i').style.width = `${Math.round((this.i / n) * 100)}%`;
    // A new chapter is a beat: the card flashes its chapter line.
    this.card.classList.toggle('tut-newch', ch !== this._ch);
    this._ch = ch;
    this.stepAt = performance.now();
    if (s.enter) s.enter();
    if (s.say) this.say(s.say);
  }

  /**
   * The battle talking: the first time something worth a word happens — the
   * airborne, a gun lost, the building down with men still in it — the
   * General says what to do about it. Once each, queued behind whatever he
   * is already saying.
   */
  onEvent(kind, data) {
    if (!this.root) return;
    const T = {
      unithit: 'They found one of your guns. Smoke blinds them, machine guns pin them, and a dead crew shoots nobody.',
      unitlost: 'You lost a gun. They come back the same way they came: UNITS, tap, drop. The Army has plenty. You, I am less sure about.',
      airborne: 'Transports inbound. Get your machine guns on the parachutes: a man shot in the air does not need digging out.',
      airbornelanded: 'They are on the ground and digging in round the building. Every one of them has to go before it counts.',
      assaultwarn: 'Counter-attack coming. Mortars, SAMs, the works. Spread your guns out.',
      assaultlanded: 'They landed all over. Find them, mark them, kill them. In that order.',
      winheld: 'It is down but they are not. Red markers are men still alive: tap one and the guns go to work.',
      flushed: 'The ones hiding in the town broke cover. Shoot them while they run.',
      secondary: 'Hear that? Their ammunition. Hit the crates by their guns and they do your work for you.',
      samhit: 'Hit. Keep the guns on it: a launcher takes a few.',
      samdown: 'One launcher down. The ring has moved to what is left in there: tap it and the guns follow.',
      samradar: 'Radar first. That is a bonus and the launchers are blind. Somebody read the manual.',
      samsite: 'Compound down. That pays a free strike: the cards in STRIKES say FREE.',
      hqdown: 'Command post gone. Their crews are deaf and slow for a minute and a half. Use it.',
      rank: 'A crew ranked up. Veterans reload faster and shoot tighter. Keep them alive.',
      strikehit: 'Air strike on target. Expensive, loud, worth it.',
      badplace: 'Not there. Open ground, a road, or a flat roof, inside the cleared ground.',
    };
    const line = T[kind];
    if (!line || this._told.has(kind)) return;
    this._told.add(kind);
    if (this.talking) this._queue.push(line); else this.say(line);
  }

  /**
   * The General has something to add, and he gets the floor: the step's
   * card and ring wait until he has finished (CARRY ON, or long enough to
   * read it), so the two are never on screen together.
   */
  say(line, after = null) {
    // Typed out under the keys, like the stand-offs: see typewriter.js.
    this.tw = this.tw || new Typewriter(this.audio || null);
    this.tw.resume();
    clearInterval(this._typeT);
    this.genLine.textContent = '';
    this.genLine.classList.add('typing');
    let n = 0;
    this._typeT = setInterval(() => {
      n++;
      this.genLine.textContent = line.slice(0, n);
      this.tw.key(line[n - 1]);
      if (n >= line.length) {
        clearInterval(this._typeT);
        this.genLine.classList.remove('typing');
        this.tw.ding();
      }
    }, 25);
    this.gen.hidden = false;
    this.talking = true;
    this._after = after;
    clearTimeout(this._genT);
    this._genT = setTimeout(() => this.hush(), 3500 + line.length * 45);
  }

  hush() {
    clearTimeout(this._genT);
    clearInterval(this._typeT);
    if (this.genLine) this.genLine.classList.remove('typing');
    if (this.gen) this.gen.hidden = true;
    this.talking = false;
    const after = this._after;
    this._after = null;
    if (after) after();
    else if (this._queue.length && this.root) this.say(this._queue.shift());
  }

  /** Where the current step points, as a screen rectangle, or null. */
  _rect(s, second = false) {
    const w = second ? s.world2 : s.world;
    if (second && !w) return null;
    if (w) {
      const p = this._v.copy(w()).project(this.camera);
      if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return null;
      const x = (p.x + 1) / 2 * innerWidth, y = (1 - p.y) / 2 * innerHeight;
      return { left: x - 34, top: y - 34, width: 68, height: 68, round: true };
    }
    for (const sel of [s.el, s.fallback]) {
      if (!sel) continue;
      const el = document.querySelector(sel);
      if (!el || el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) return r;
    }
    return null;
  }

  /** Called every frame from the render loop. */
  update() {
    if (!this.root) return;
    const s = this.steps[this.i];
    if (!s) return;
    // Brought down before the walkthrough got there: that is the point of it.
    if (this.battle.state === 'won') { this.finish('done'); return; }
    // One voice at a time: while the General talks, the step waits.
    this.card.hidden = this.ring.hidden = this.talking;
    if (this.talking) { this.ring2.hidden = true; return; }
    if (s.done && s.done()) { this.next(); return; }
    if (s.done && !s.ok) {
      const stuck = performance.now() - (this.stepAt || 0) > STUCK_S * 1000;
      const b = this.root.querySelector('.tut-skipstep');
      if (b.hidden === stuck) b.hidden = !stuck;
    }
    const r = this._rect(s);
    const pad = 6;
    if (r) {
      this.ring.hidden = false;
      this.ring.classList.toggle('round', !!r.round);
      this.ring.style.transform = `translate(${r.left - pad}px, ${r.top - pad}px)`;
      this.ring.style.width = `${r.width + pad * 2}px`;
      this.ring.style.height = `${r.height + pad * 2}px`;
    } else {
      this.ring.hidden = true;
    }
    // A drag has two ends: a second ring where it should finish.
    const r2 = this._rect(s, true);
    this.ring2.hidden = !r2;
    if (r2) {
      this.ring2.classList.add('round');
      this.ring2.style.transform = `translate(${r2.left - pad}px, ${r2.top - pad}px)`;
      this.ring2.style.width = `${r2.width + pad * 2}px`;
      this.ring2.style.height = `${r2.height + pad * 2}px`;
    }
    // The card sits beside what it is about: under it when that is in the
    // top half of the screen, over it when it is in the bottom half, and in
    // the middle when the step points at nothing.
    const cw = this.card.offsetWidth, ch = this.card.offsetHeight;
    let x, y;
    if (r) {
      x = r.left + r.width / 2 - cw / 2;
      y = r.top + r.height / 2 < innerHeight / 2 ? r.top + r.height + pad + 14 : r.top - pad - 14 - ch;
    } else {
      x = innerWidth / 2 - cw / 2; y = innerHeight * 0.3;
    }
    x = Math.max(10, Math.min(innerWidth - cw - 10, x));
    y = Math.max(10, Math.min(innerHeight - ch - 10, y));
    this.card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  finish(how) {
    markTutorialSeen(how === 'done' ? 'done' : 'skipped');
    if (how === 'done') {
      this.hud.feed('BOOT CAMP COMPLETE', 'big');
      const root = this.root;
      this.ring.hidden = true; this.ring2.hidden = true; this.card.hidden = true;
      this.root = null;
      this.say("Well, hell. You broke it. Your mother would be proud, or at least not surprised. Now go start a war.",
        () => root.remove());
      return;
    }
    // The General may be mid-line: stop the typing and its timers with him.
    clearTimeout(this._genT);
    clearInterval(this._typeT);
    this._after = null;
    this._queue.length = 0;
    this.talking = false;
    if (this.root) this.root.remove();
    this.root = null;
  }
}
