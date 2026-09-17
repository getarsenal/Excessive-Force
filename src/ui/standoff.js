import { CAST, DEFENDER_OF, STANDOFF } from '../game/cast.js';
import { TAP } from './hud.js';

/**
 * The stand-off before a level.
 *
 * The camera comes down out of the sky onto the building, the General
 * steps up from the bottom-left with an ultimatum, the defender steps up
 * from the bottom-right with his answer, and the General gets the last
 * word. Three beats, about eleven seconds, and a tap moves it on.
 *
 * The world underneath is live the whole time — birds, boats, the garrison
 * at its posts — so it reads as an establishing shot rather than a title
 * card. Nothing here touches game state: the battle is not paused, it simply
 * has no units yet.
 */

const BEAT = { enter: 1.1, line: 2.8, last: 3.0, exit: 0.65 };

/** Whether the player has turned the intros off, from the menu. */
export function introsEnabled() {
  try { return localStorage.getItem('tt.intros') !== '0'; } catch { return true; }
}
export function setIntrosEnabled(on) {
  try { localStorage.setItem('tt.intros', on ? '1' : '0'); } catch { /* private mode */ }
}

/** Fetch both figures ahead of time, so nothing pops in late. */
export function preloadCast(levelId) {
  const ids = ['us', DEFENDER_OF[levelId]].filter(Boolean);
  return Promise.all(ids.map((id) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = CAST[id].file;
    // Never hold the level up for a slow picture: three seconds and we go.
    setTimeout(() => resolve(img), 3000);
  })));
}

export class Standoff {
  /**
   * @param {object} o  { level, rig, groundY, lines?, onDone }
   */
  constructor(o) {
    this.level = o.level;
    this.rig = o.rig;
    this.groundY = o.groundY;
    this.lines = o.lines || STANDOFF[o.level.id] || STANDOFF.westminster;
    this.onDone = o.onDone || (() => {});
    this.done = false;
    this.t = 0;
    this.beat = -1;
    this.beatT = 0;
    this._build();
    this._camStart();
  }

  _build() {
    const enemy = CAST[DEFENDER_OF[this.level.id]] || CAST.uk;
    // Rank and name on a plate over the bubble: the two of them are strangers
    // to the player until something says who is doing the shouting.
    const who = (c) => `${c.rank} ${c.name}`;
    const root = document.createElement('div');
    root.id = 'standoff';
    root.innerHTML = `
      <img class="so-fig left" src="${CAST.us.file}" alt="${who(CAST.us)}" draggable="false">
      <img class="so-fig right" src="${enemy.file}" alt="${who(enemy)}" draggable="false">
      <div class="so-bubble left" dir="auto"><span class="so-plate">${who(CAST.us)}</span><span class="so-ghost"></span><span class="so-text"></span></div>
      <div class="so-bubble right" dir="auto"><span class="so-plate">${who(enemy)}</span><span class="so-ghost"></span><span class="so-text"></span></div>
      <div class="so-hint">${TAP} TO CONTINUE</div>
      <button class="so-skip">SKIP</button>`;
    const [c0, c1, c2] = enemy.colours;
    root.style.setProperty('--enemy-a', c0);
    root.style.setProperty('--enemy-b', c1);
    root.style.setProperty('--enemy-c', c2);
    document.body.appendChild(root);
    this.root = root;
    this.fig = { left: root.querySelector('.so-fig.left'), right: root.querySelector('.so-fig.right') };
    this.bubble = { left: root.querySelector('.so-bubble.left'), right: root.querySelector('.so-bubble.right') };
    root.addEventListener('pointerup', (e) => {
      if (e.target.classList.contains('so-skip')) return;
      this.advance();
    });
    root.querySelector('.so-skip').addEventListener('click', () => this.finish());
    this._onKey = (e) => { if (e.code === 'Space' || e.code === 'Enter') this.advance(); if (e.code === 'Escape') this.finish(); };
    window.addEventListener('keydown', this._onKey);
  }

  /** Start high, wide and a little round to one side; glide onto the default view. */
  _camStart() {
    const c = this.level.camera;
    this.camEnd = {
      yaw: c.yaw, pitch: c.pitch, distance: c.distance, height: this.groundY + c.height,
    };
    this.camFrom = {
      yaw: c.yaw + 0.55, pitch: Math.min(0.95, c.pitch + 0.30),
      distance: c.distance * 1.9, height: this.groundY + c.height + 60,
    };
    this.camT = 0;
    this.camLen = 3.4;
    this._applyCam(0);
  }

  _applyCam(k) {
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;     // ease in-out
    const r = this.rig, a = this.camFrom, b = this.camEnd;
    r.yaw = r.desiredYaw = a.yaw + (b.yaw - a.yaw) * e;
    r.pitch = r.desiredPitch = a.pitch + (b.pitch - a.pitch) * e;
    r.distance = r.desiredDistance = a.distance + (b.distance - a.distance) * e;
    const y = a.height + (b.height - a.height) * e;
    r.target.set(0, y, 0);
    r.desiredTarget.copy(r.target);
  }

  /** Move to the next beat, whatever the clock says. */
  advance() {
    if (this.done) return;
    if (this.beat >= this.lines.length - 1) { this.finish(); return; }
    this._startBeat(this.beat + 1);
  }

  _startBeat(i) {
    this.beat = i;
    this.beatT = 0;
    const line = this.lines[i];
    const side = CAST[line.who]?.side || (line.who === 'us' ? 'left' : 'right');
    this.fig[side].classList.add('in');
    // The other side's bubble goes quiet while this one speaks; the figure stays.
    const other = side === 'left' ? 'right' : 'left';
    this.bubble[other].classList.remove('in');
    const b = this.bubble[side];
    b.classList.remove('in');
    void b.offsetWidth;
    b.querySelector('.so-ghost').textContent = line.line;
    b.querySelector('.so-text').textContent = '';
    this._typing = { el: b.querySelector('.so-text'), text: line.line, n: 0, acc: 0 };
    b.classList.add('in');
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.root.classList.add('out');
    window.removeEventListener('keydown', this._onKey);
    // Land the camera exactly where the level wants it.
    this._applyCam(1);
    setTimeout(() => { this.root.remove(); this.onDone(); }, BEAT.exit * 1000);
  }

  /**
   * Runs on the wall clock, not the simulation's frame delta: a cutscene is
   * eleven seconds long on a phone dropping frames too, and the frame delta
   * is capped for the physics' sake.
   */
  update() {
    if (this.done) return;
    const now = performance.now();
    const dt = this._last == null ? 0 : Math.min(1, (now - this._last) / 1000);
    this._last = now;
    this.t += dt;
    if (this.camT < this.camLen) {
      this.camT = Math.min(this.camLen, this.camT + dt);
      this._applyCam(this.camT / this.camLen);
    }
    // Type the current line out, forty characters a second.
    const ty = this._typing;
    if (ty && ty.n < ty.text.length) {
      ty.acc += dt * 40;
      const n = Math.min(ty.text.length, Math.floor(ty.acc));
      if (n !== ty.n) { ty.n = n; ty.el.textContent = ty.text.slice(0, n); }
    }
    if (this.beat < 0) {
      if (this.t >= BEAT.enter) this._startBeat(0);
      return;
    }
    this.beatT += dt;
    const last = this.beat >= this.lines.length - 1;
    // A line stays up long enough to be read after it has finished typing.
    const hold = (ty ? ty.text.length / 40 : 0) + (last ? BEAT.last : BEAT.line);
    if (this.beatT >= hold) this.advance();
  }
}
