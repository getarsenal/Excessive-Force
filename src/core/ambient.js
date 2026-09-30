/**
 * The sound of the place, under the guns.
 *
 * Every level is somewhere, and somewhere has a sound: surf and gulls under
 * the Mont, the wind on the Potala's rock, cicadas round Angkor, traffic
 * round a tower in a city, and bells wherever there is a belfry — the
 * Westminster quarters from the Elizabeth Tower itself, until it falls.
 *
 * All of it is made here, in Web Audio, rather than loaded: a shared loop of
 * noise shaped by filters for wind, surf, traffic and insects, and a handful
 * of oscillators for gulls, birds and bells. Nothing to download, a dozen
 * nodes running, and it goes through the game's master gain so the sound
 * switch and the pause take it with everything else.
 *
 * What a level gets is read from what the level already says about itself —
 * its coast, its hinterland, its climate, what its landmark is called — with
 * a short table for the ones that deserve better than a guess.
 */

// Hand-set: the places whose sound is part of what they are.
const PLACES = {
  westminster: { city: 1, bells: 'westminster', gulls: 0.3, water: 'river' },
  towerbridge: { city: 1, gulls: 0.5, water: 'river' },
  paris: { city: 1, birds: 0.4, water: 'river' },
  pisa: { city: 0.6, bells: 'church', birds: 0.6, cicadas: 0.4 },
  cologne: { city: 1, bells: 'church', water: 'river' },
  florence: { city: 0.8, bells: 'church', birds: 0.3 },
  moscow: { city: 1, bells: 'church', wind: 0.3 },
  istanbul: { city: 0.8, gulls: 1, surf: 0.4, horn: 1 },
  sydney: { city: 0.7, gulls: 1, surf: 0.6, horn: 1 },
  rio: { wind: 0.7, birds: 0.6, cicadas: 0.7 },
  giza: { wind: 0.9 },
  dubai: { wind: 0.6, city: 0.5 },
  petronas: { city: 1, cicadas: 0.6, birds: 0.3 },
  potala: { wind: 1, bells: 'temple' },
  himeji: { bells: 'temple', birds: 0.7, cicadas: 0.5, city: 0.3 },
  agra: { birds: 0.8, city: 0.4, water: 'river' },
  chichen: { birds: 1, cicadas: 0.8 },
  athens: { cicadas: 1, wind: 0.4, city: 0.4 },
  montstmichel: { surf: 1, gulls: 1, wind: 0.6, bells: 'church' },
  neuschwanstein: { wind: 0.6, birds: 0.9 },
  edinburgh: { wind: 0.7, city: 0.6, gulls: 0.4 },
  segovia: { city: 0.5, birds: 0.6, cicadas: 0.5 },
  machupicchu: { wind: 0.9, birds: 0.6 },
  greatwall: { wind: 0.9, birds: 0.5 },
  angkor: { cicadas: 1, birds: 0.9 },
  tokyotower: { city: 1, cicadas: 0.5 },
};

const CLIMES = {
  alpine: { wind: 0.8, birds: 0.5 },
  desert: { wind: 0.9 },
  highland: { wind: 0.8, birds: 0.4 },
  mediterranean: { cicadas: 0.8, birds: 0.5 },
  nordic: { wind: 0.6, gulls: 0.4 },
  steppe: { wind: 1 },
  subtropical: { cicadas: 0.6, birds: 0.6 },
  temperate: { birds: 0.6 },
  tropical: { cicadas: 1, birds: 0.8 },
};

/** What a level sounds like: a weight 0..1 per layer, and its bells. */
export function soundscapeFor(level) {
  if (PLACES[level.id]) return { ...PLACES[level.id] };
  const s = { city: 0.6, ...(CLIMES[level.setting?.clime] || { birds: 0.5 }) };
  const hint = level.setting?.hinterland;
  if (hint === 'harbour') { s.surf = 0.6; s.gulls = 0.8; }
  if (hint === 'jungle') { s.cicadas = 1; s.birds = 1; s.city = 0.1; }
  if (hint === 'forest') { s.birds = Math.max(s.birds || 0, 0.8); s.city = 0.2; }
  const name = `${level.target || ''} ${level.subtitle || ''}`.toLowerCase();
  if (/cathedral|minster|church|basilica|abbey|kirkja|dom\b|duomo|chapel|sagrada|stephan|vitus/.test(name)) s.bells = 'church';
  else if (/temple|pagoda|wat\b|shrine|stupa|borobudur|monastery/.test(name)) s.bells = 'temple';
  return s;
}

export class Ambience {
  /**
   * @param {object} audio  the game's Audio (ctx and master once unlocked)
   * @param {object} level
   * @param {() => boolean} bellsStanding  false once the belfry has fallen
   */
  constructor(audio, level, bellsStanding = () => true) {
    this.audio = audio;
    this.scape = soundscapeFor(level);
    this.bellsStanding = bellsStanding;
    this.started = false;
    this.timers = [];
    this.nodes = [];
    this.level = 0.9;
  }

  /** Called every frame; starts itself once the audio is unlocked. */
  tick() {
    if (this.started || !this.audio.ready || !this.audio.ctx || !this.audio.master) return;
    this.started = true;
    try { this._start(); } catch (e) { console.warn('ambience', e); }
  }

  _start() {
    const ctx = this.ctx = this.audio.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.gain.linearRampToValueAtTime(this.level, ctx.currentTime + 4);
    this.bus.connect(this.audio.master);
    this.nodes.push(this.bus);
    this.noise = this._noiseBuffer();
    const S = this.scape;
    if (S.wind) this._wind(S.wind);
    if (S.surf) this._surf(S.surf);
    if (S.city) this._city(S.city);
    if (S.cicadas) this._cicadas(S.cicadas);
    if (S.water === 'river') this._river();
    if (S.gulls) this._every(7, 18, () => this._gull(S.gulls));
    if (S.birds) this._every(4, 12, () => this._birdsong(S.birds));
    if (S.horn) this._every(35, 80, () => this._shipHorn());
    if (S.bells === 'westminster') this._westminster();
    else if (S.bells === 'church') this._every(40, 75, () => this._peal(), 6);
    else if (S.bells === 'temple') this._every(30, 55, () => this._templeBell(), 5);
  }

  _noiseBuffer() {
    const ctx = this.ctx, n = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _loop(filterType, freq, q, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(this.bus);
    src.start();
    this.nodes.push(src, f, g);
    return { src, f, g };
  }

  _lfo(param, rate, depth) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.frequency.value = rate;
    const g = ctx.createGain(); g.gain.value = depth;
    o.connect(g).connect(param); o.start();
    this.nodes.push(o, g);
  }

  /** Wind: band-passed noise that gusts, its pitch rising with the gust. */
  _wind(w) {
    const a = this._loop('bandpass', 420, 0.6, 0.05 * w);
    this._lfo(a.g.gain, 0.07, 0.035 * w);
    this._lfo(a.f.frequency, 0.05, 160);
    const b = this._loop('lowpass', 180, 0.5, 0.06 * w);
    this._lfo(b.g.gain, 0.031, 0.03 * w);
  }

  /** Surf: low noise swelling to a break every eight seconds or so. */
  _surf(w) {
    const a = this._loop('lowpass', 700, 0.4, 0.0);
    const ctx = this.ctx;
    const wave = () => {
      const t = ctx.currentTime;
      const peak = (0.09 + Math.random() * 0.05) * w;
      a.g.gain.cancelScheduledValues(t);
      a.g.gain.setValueAtTime(a.g.gain.value, t);
      a.g.gain.linearRampToValueAtTime(peak * 0.5, t + 2.2);
      a.g.gain.linearRampToValueAtTime(peak, t + 2.9);
      a.g.gain.exponentialRampToValueAtTime(0.012 * w + 0.001, t + 7.5);
      a.f.frequency.setValueAtTime(500, t);
      a.f.frequency.linearRampToValueAtTime(1500, t + 2.9);
      a.f.frequency.linearRampToValueAtTime(600, t + 7);
    };
    wave();
    this._every(7, 11, wave);
  }

  /** A city at a distance: a low roar, and now and then a horn. */
  _city(w) {
    const a = this._loop('lowpass', 240, 0.7, 0.06 * w);
    this._lfo(a.g.gain, 0.04, 0.015 * w);
    this._every(18, 45, () => this._carHorn(w));
  }

  _river() {
    const a = this._loop('bandpass', 1200, 1.5, 0.012);
    this._lfo(a.f.frequency, 0.3, 300);
  }

  /** Cicadas: a high band of noise chopped fast, swelling and dying away. */
  _cicadas(w) {
    const a = this._loop('bandpass', 4600, 6, 0.0);
    const ctx = this.ctx;
    const chop = ctx.createGain(); chop.gain.value = 0.5;
    const o = ctx.createOscillator(); o.frequency.value = 38;
    const og = ctx.createGain(); og.gain.value = 0.5;
    o.connect(og).connect(chop.gain); o.start();
    a.g.disconnect(); a.g.connect(chop).connect(this.bus);
    this.nodes.push(chop, o, og);
    const swell = () => {
      const t = ctx.currentTime, pk = (0.02 + Math.random() * 0.015) * w;
      a.g.gain.cancelScheduledValues(t);
      a.g.gain.setValueAtTime(a.g.gain.value, t);
      a.g.gain.linearRampToValueAtTime(pk, t + 3);
      a.g.gain.linearRampToValueAtTime(pk * 0.8, t + 9);
      a.g.gain.linearRampToValueAtTime(0.0005, t + 12);
    };
    swell();
    this._every(12, 20, swell);
  }

  _tone(type, t, dur, f0, f1, gain, filter = null) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = o.connect(g);
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filter; f.Q.value = 2; out = out.connect(f); }
    out.connect(this.bus);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  _gull(w) {
    const t0 = this.ctx.currentTime + 0.05;
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 1300 + Math.random() * 500;
    for (let k = 0; k < n; k++) {
      const t = t0 + k * (0.22 + Math.random() * 0.08);
      const o = this._tone('sawtooth', t, 0.26, base * 1.25, base * 0.7, 0.012 * w, 1800);
      const v = this.ctx.createOscillator(); v.frequency.value = 22;
      const vg = this.ctx.createGain(); vg.gain.value = 60;
      v.connect(vg).connect(o.frequency); v.start(t); v.stop(t + 0.3);
    }
  }

  _birdsong(w) {
    const t0 = this.ctx.currentTime + 0.05;
    const n = 3 + Math.floor(Math.random() * 5);
    const base = 2800 + Math.random() * 1800;
    for (let k = 0; k < n; k++) {
      const t = t0 + k * (0.09 + Math.random() * 0.1);
      const up = Math.random() < 0.5;
      this._tone('sine', t, 0.07 + Math.random() * 0.05, base * (up ? 0.85 : 1.15), base * (up ? 1.2 : 0.8), 0.006 * w);
    }
  }

  _carHorn(w) {
    const t = this.ctx.currentTime + 0.05, d = 0.18 + Math.random() * 0.35;
    const f = 380 + Math.random() * 120;
    this._tone('square', t, d, f, 0, 0.0035 * w, 700);
    this._tone('square', t, d, f * 1.26, 0, 0.0025 * w, 800);
  }

  _shipHorn() {
    const t = this.ctx.currentTime + 0.05;
    this._tone('sawtooth', t, 2.6, 92, 0, 0.02, 260);
    this._tone('sawtooth', t, 2.6, 138, 0, 0.012, 300);
  }

  /**
   * A bell: the hum, the prime, the minor third, the fifth and the nominal
   * of a cast bell, each dying away at its own rate, the low ones slowest.
   */
  _bell(t, f, gain = 0.03, len = 5) {
    const ctx = this.ctx;
    const partials = [[0.5, 1.0, 1.0], [1.0, 0.8, 0.7], [1.2, 0.5, 0.45], [1.5, 0.35, 0.35], [2.0, 0.45, 0.3], [2.5, 0.2, 0.18], [3.0, 0.15, 0.12]];
    for (const [ratio, amp, decay] of partials) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = f * ratio * (1 + (Math.random() - 0.5) * 0.004);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len * decay + 0.3);
      o.connect(g).connect(this.bus);
      o.start(t); o.stop(t + len * decay + 0.4);
    }
  }

  /**
   * The Westminster Quarters, rung from the tower the player is shelling:
   * the four changes on G#, F#, E and B, and the hour on Big Ben's E, every
   * minute and a half of play — and never again once the tower is down.
   */
  _westminster() {
    const N = { G: 415.3, F: 369.99, E: 329.63, B: 246.94 };
    const changes = [['G', 'F', 'E', 'B'], ['E', 'G', 'F', 'B'], ['E', 'F', 'G', 'E'], ['G', 'E', 'F', 'B'], ['B', 'F', 'G', 'E']];
    let q = 0;
    const ring = () => {
      if (!this.bellsStanding()) return;
      const t0 = this.ctx.currentTime + 0.1;
      const seq = [changes[q % 5], changes[(q + 1) % 5]];
      let k = 0;
      for (const ch of seq) {
        for (let i = 0; i < 4; i++) this._bell(t0 + k + i * 0.8, N[ch[i]], 0.022, 3.5);
        k += 4.2;
      }
      q += 2;
      // And the hour.
      for (let h = 0; h < 3; h++) this._bell(t0 + 10.5 + h * 3.2, 164.8, 0.04, 7);
    };
    this._at(6, ring);
    this._every(90, 90, ring);
  }

  _peal() {
    if (!this.bellsStanding()) return;
    const t0 = this.ctx.currentTime + 0.1;
    const scale = [523.25, 466.16, 415.3, 392.0, 349.23, 311.13];
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < scale.length; i++) this._bell(t0 + r * 3.6 + i * 0.55, scale[i], 0.012, 3);
    }
  }

  _templeBell() {
    if (!this.bellsStanding()) return;
    const t = this.ctx.currentTime + 0.1;
    this._bell(t, 98, 0.05, 11);
    this._bell(t, 99.3, 0.02, 11);      // the beat against itself
  }

  _at(sec, fn) { this.timers.push(setTimeout(fn, sec * 1000)); }

  /** `fn` at random intervals between `a` and `b` seconds, first after `first`. */
  _every(a, b, fn, first = null) {
    const go = () => {
      if (this.stopped) return;
      try { if (this.ctx.state === 'running') fn(); } catch { /* a node refused */ }
      this.timers.push(setTimeout(go, (a + Math.random() * (b - a)) * 1000));
    };
    this.timers.push(setTimeout(go, (first ?? (a + Math.random() * (b - a))) * 1000));
  }

  stop() {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    for (const n of this.nodes) { try { n.stop?.(); n.disconnect?.(); } catch { /* gone */ } }
    this.nodes = [];
  }
}
