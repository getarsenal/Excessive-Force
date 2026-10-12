/**
 * The black box: what the battle looked like in the last minute before the
 * page died.
 *
 * A phone browser that runs out of memory, or whose GPU falls too far
 * behind, does not throw anything the game can catch. It kills the tab and
 * loads the page again, which lands on the title, and everything the battle
 * knew about itself is gone with it. So every two seconds of a battle a
 * small snapshot is written to storage (`tt.blackbox`, the last thirty):
 * the clock, the frame rate, the guns, the lift, the aircraft, the rounds in
 * the air, the physics bodies, the broken sections, the stone down, the
 * town burnt, the renderer's geometries, textures, programs and visible
 * triangles, the particles, the heap where the browser tells, and the last
 * dozen things that happened. A WebGL context lost or a fault in the frame
 * is written at once.
 *
 * Storage survives the kill. The next boot knows the last load died in view
 * (power.js leaves a mark only a page that is closed on purpose takes away),
 * and moves the black box into `tt.crashes` (the last five), where the test
 * panel's CRASH RECORDER shows it and COPY LAST CRASH puts it on the
 * clipboard to send.
 */
const BOX = 'tt.blackbox';
const CRASHES = 'tt.crashes';
const RING = 30;
const EVERY = 2000;

const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } };

/**
 * At boot, before anything else reads or clears the mark: if the last load
 * died in view (`bootMark` is the level it was loading), file its black box
 * as a crash. Returns the crash filed, or null.
 */
export function harvestCrash(bootMark) {
  const box = load(BOX);
  try { localStorage.removeItem(BOX); } catch { /* blocked */ }
  if (!bootMark || !box || !box.samples?.length) return null;
  const last = box.samples[box.samples.length - 1];
  // A box from some other, older page is not this crash's.
  if (box.level !== bootMark || Date.now() - last.at > 30 * 60 * 1000) return null;
  const crash = { kind: 'crash', filedAt: new Date().toISOString(), level: box.level, tier: box.tier,
    device: box.device, build: box.build, lastAt: new Date(last.at).toISOString(), samples: box.samples, notes: box.notes || [] };
  const all = load(CRASHES) || [];
  all.push(crash);
  store(CRASHES, all.slice(-5));
  return crash;
}

/**
 * Which build this page is: the fingerprint in the bundle's file name
 * (`index-ab12cd34.js`), which changes with every deploy, or `dev` on the
 * dev server. On the panel so a crash can be matched to a build.
 */
export function buildId() {
  const src = document.querySelector('script[type=module][src*="assets/"]')?.src || '';
  const m = /-([A-Za-z0-9_-]{6,})\.js/.exec(src);
  return m ? m[1] : 'dev';
}

/** The crashes filed, oldest first. */
export function crashes() { return load(CRASHES) || []; }
export function clearCrashes() { try { localStorage.removeItem(CRASHES); } catch { /* blocked */ } }

/** One line about a filed crash, for the panel. */
export function describeCrash(c) {
  if (!c) return 'none recorded';
  const s = c.samples[c.samples.length - 1] || {};
  const when = new Date(c.lastAt);
  return `${c.level} · build ${c.build || '?'} · ${when.toLocaleDateString()} ${when.toLocaleTimeString()} · ${Math.round(s.el || 0)} s in · `
    + `${s.fps ?? '?'} fps · ${s.units ?? '?'} guns · ${s.air ?? '?'} aircraft · ${s.dyn ?? '?'} bodies · ${s.trisK ?? '?'}k tris`
    + (s.heapMB ? ` · ${s.heapMB} MB heap` : '')
    + (s.dead ? ` · PHYSICS HALTED (${s.deadWhy || '?'})` : '')
    + (s.frozenHigh || s.stuckHigh ? ` · ${s.frozenHigh || 0} frozen / ${s.stuckHigh || 0} stuck over 30 m` : '');
}

export class BlackBox {
  /**
   * @param {object} c { battle, engine, physics, structures, quality, level, fx, stats }
   */
  constructor(c) {
    this.c = c;
    this.events = [];
    this.box = { level: c.level.id, tier: c.quality.id, build: buildId(),
      device: { ua: navigator.userAgent, dpr: window.devicePixelRatio, screen: `${screen.width}x${screen.height}`, cores: navigator.hardwareConcurrency || null, memGB: navigator.deviceMemory || null },
      samples: [], notes: [] };
    this._timer = setInterval(() => this.sample(), EVERY);
  }

  /** Something happened in the battle (main.js `handleEvent`). */
  event(kind) {
    if (kind === 'bounty' || kind === 'stamp' || kind === 'spot') return;
    this.events.push(`${Math.round(this.c.battle.elapsed)}:${kind}`);
    if (this.events.length > 12) this.events.shift();
  }

  /** Something the box must not wait two seconds to write. */
  note(text) {
    this.box.notes.push(`${new Date().toISOString()} ${String(text).slice(0, 200)}`);
    if (this.box.notes.length > 10) this.box.notes.shift();
    this.sample();
  }

  sample() {
    try {
      const { battle: B, engine: E, physics: P, structures: S, fx, stats } = this.c;
      const R = E.renderer, I = R.info;
      let tris = 0, meshes = 0;
      E.scene.traverseVisible((o) => {
        if (!o.isMesh || !o.geometry) return;
        const g = o.geometry, n = (g.index ? g.index.count : (g.attributes.position?.count || 0)) / 3;
        tris += n * (o.isInstancedMesh ? o.count : (g.isInstancedBufferGeometry ? g.instanceCount || 0 : 1));
        meshes++;
      });
      let particles = 0;
      for (const p of [fx?.fire, fx?.smoke, fx?.sparks, fx?.dust, fx?.plume, fx?.clods, fx?.flourish?.paper]) if (p) particles += p.count;
      let bodies = null; try { bodies = P.world.bodies.len(); } catch { /* dead world */ }
      // What is up in the air and not falling: frozen pieces and still ones
      // more than thirty metres over the ground under them.
      let frozenHigh = 0, stuckHigh = 0;
      if (!P.dead && P.groundAt) {
        try {
          for (const b of P.frozen || []) { if (b.__removed) continue; const t = b.translation(); if (t.y - P.groundAt(t.x, t.z) > 30) frozenHigh++; }
          for (const b of P.dynamicSet) { const t = b.translation(); if (t.y - P.groundAt(t.x, t.z) <= 30) continue; const v = b.linvel(); if (v.x * v.x + v.y * v.y + v.z * v.z < 0.1) stuckHigh++; }
        } catch { /* a body gone under us */ }
      }
      const s = {
        at: Date.now(), el: Math.round(B.elapsed), state: B.state, hidden: document.hidden,
        fps: stats?.().fps ?? null, physMs: stats?.().physMs ?? null,
        units: B.units.filter((u) => u.alive).length, lift: B.pending.length, air: B.air?.sorties?.length ?? null,
        shells: B.projectiles?.inFlight ?? B.projectiles?.list?.length ?? null,
        dyn: P.dynamicSet.size, bodies, budget: P.activeBudget, dead: !!P.dead, deadWhy: P.deadReason || null,
        frozenHigh, stuckHigh, culled: P.rubbleCulled || 0,
        islands: S.reduce((a, st) => a + st.islands.size, 0), stonesDown: S.reduce((a, st) => a + st.destroyedCount, 0),
        burnt: B.cityFire?.burnt ?? null, fires: B.fires?.list?.length ?? null,
        geos: I.memory.geometries, tex: I.memory.textures, programs: I.programs?.length ?? null,
        trisK: Math.round(tris / 1000), meshes, particles, fill: fx?.fillNow != null ? Math.round(fx.fillNow) : null,
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
        lost: R.getContext().isContextLost?.() || false,
        ev: this.events.slice(),
      };
      this.box.samples.push(s);
      if (this.box.samples.length > RING) this.box.samples.shift();
      store(BOX, this.box);
    } catch { /* never let the recorder be what breaks the battle */ }
  }

  /** The page is being left on purpose: nothing to keep. */
  close() {
    clearInterval(this._timer);
    try { localStorage.removeItem(BOX); } catch { /* blocked */ }
  }
}
