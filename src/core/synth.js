/**
 * Sounds made rather than loaded.
 *
 * The clips in audio.js are recordings of things that are hard to fake — a
 * gun, a blast. Everything here is easy to fake and would be a download for
 * nothing: a falling bomb's whistle, a jet tearing past overhead, an air-raid
 * siren winding up over the town, the car alarms a blast sets off, the
 * crackle of a dump cooking off and the thump and crackle of fireworks.
 *
 * Each is a handful of Web Audio nodes built on the call and left to stop
 * themselves. All of it goes through the game's master gain, so the SOUND
 * switch and the limiter take it with everything else, and none of it plays
 * before the context is running — a browser that has not had its gesture
 * yet gets silence, not a queue of sirens all at once on the first tap.
 */

let _noise = null;

function ok(audio) {
  const c = audio && audio.ctx;
  return !!(c && audio.ready && audio.enabled && !audio._failed && c.state === 'running' && audio.master);
}

function noise(c) {
  if (_noise && _noise.sampleRate === c.sampleRate) return _noise;
  const len = c.sampleRate * 2;
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _noise = b;
  return b;
}

/** Gain and pan for a world point, as audio.play works them out. */
function place(audio, pos, rolloff = 600) {
  if (!pos) return { gain: 1, pan: 0, dist: 0 };
  const L = audio._listenerPos, R = audio._listenerRight;
  const dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
  const dist = Math.hypot(dx, dy, dz) || 1;
  const gain = rolloff / (rolloff + dist * dist / rolloff);
  const pan = Math.max(-1, Math.min(1, (dx * R.x + dy * R.y + dz * R.z) / dist)) * 0.8;
  return { gain, pan, dist };
}

function out(c, audio, pan) {
  const p = c.createStereoPanner ? c.createStereoPanner() : null;
  if (p) { p.pan.value = pan; p.connect(audio.master); return p; }
  return audio.master;
}

/**
 * A falling bomb: a whistle sliding down from `f0` to `f1` over its last
 * `len` seconds, ending dead on the impact `at` seconds from now.
 */
export function bombWhistle(audio, at, len = 2.4, gain = 0.09, f0 = 1900, f1 = 380) {
  if (!ok(audio)) return;
  const c = audio.ctx, now = c.currentTime;
  const t1 = now + Math.max(0.2, at), t0 = Math.max(now, t1 - len);
  try {
    const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sine'; o2.type = 'triangle';
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t1);
    // A second voice a few cents off: fins are not a tuning fork.
    o2.frequency.setValueAtTime(f0 * 1.012, t0); o2.frequency.exponentialRampToValueAtTime(f1 * 1.012, t1);
    f.type = 'lowpass'; f.frequency.value = 2600; f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t1 - 0.06);
    g.gain.setValueAtTime(0.0001, t1);
    o.connect(f); o2.connect(f); f.connect(g).connect(audio.master);
    o.start(t0); o2.start(t0); o.stop(t1 + 0.02); o2.stop(t1 + 0.02);
  } catch { /* no audio */ }
}

/**
 * A jet tearing past: broadband noise through a band-pass that sweeps down
 * as the aircraft goes over, swelling in and falling away, panned across.
 */
export function flyby(audio, gain = 0.5, panFrom = -0.8, panTo = 0.8, dur = 2.6) {
  if (!ok(audio)) return;
  const c = audio.ctx, now = c.currentTime;
  try {
    const src = c.createBufferSource(); src.buffer = noise(c); src.loop = true;
    const bp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(2600, now);
    bp.frequency.exponentialRampToValueAtTime(1500, now + dur * 0.45);
    bp.frequency.exponentialRampToValueAtTime(320, now + dur);
    lp.type = 'lowpass'; lp.frequency.value = 5200;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + dur * 0.42);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    src.connect(bp).connect(lp).connect(g);
    if (p) {
      p.pan.setValueAtTime(panFrom, now); p.pan.linearRampToValueAtTime(panTo, now + dur);
      g.connect(p).connect(audio.master);
    } else g.connect(audio.master);
    src.start(now); src.stop(now + dur + 0.05);
  } catch { /* no audio */ }
}

/**
 * The air-raid siren: two detuned saws through a formant band, winding up
 * from nothing, holding a rising and falling wail, and winding down. Far
 * off, as a town's siren is heard from the guns.
 */
export function airRaidSiren(audio, dur = 14, gain = 0.07) {
  if (!ok(audio)) return;
  const c = audio.ctx, now = c.currentTime;
  try {
    const o1 = c.createOscillator(), o2 = c.createOscillator();
    const bp = c.createBiquadFilter(), g = c.createGain();
    o1.type = 'sawtooth'; o2.type = 'sawtooth';
    const f = o1.frequency, f2 = o2.frequency;
    f.setValueAtTime(90, now); f2.setValueAtTime(91, now);
    // Wind up, then the wail: three slow rises and falls.
    f.exponentialRampToValueAtTime(420, now + 3.5); f2.exponentialRampToValueAtTime(424, now + 3.5);
    let t = now + 3.5;
    while (t < now + dur - 3) {
      f.exponentialRampToValueAtTime(300, t + 1.6); f2.exponentialRampToValueAtTime(303, t + 1.6);
      f.exponentialRampToValueAtTime(430, t + 3.4); f2.exponentialRampToValueAtTime(434, t + 3.4);
      t += 3.4;
    }
    f.exponentialRampToValueAtTime(70, now + dur); f2.exponentialRampToValueAtTime(71, now + dur);
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.1;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 2.5);
    g.gain.setValueAtTime(gain, now + dur - 2.5);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o1.connect(bp); o2.connect(bp); bp.connect(g).connect(audio.master);
    o1.start(now); o2.start(now); o1.stop(now + dur + 0.05); o2.stop(now + dur + 0.05);
  } catch { /* no audio */ }
}

/**
 * A car alarm somewhere in the street: one of the three patterns every car
 * alarm in the world is, square-wave through a little speaker, for `dur`
 * seconds, `delay` seconds from now.
 */
export function carAlarm(audio, pos, delay = 0, dur = 9, pattern = 0) {
  if (!ok(audio)) return;
  const c = audio.ctx;
  const { gain, pan } = place(audio, pos, 420);
  if (gain < 0.02) return;
  const t0 = c.currentTime + delay, t1 = t0 + dur;
  try {
    const o = c.createOscillator(), hp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'square';
    const f = o.frequency;
    if (pattern === 0) {
      // The whoop: up and down, twice a second.
      for (let t = t0; t < t1; t += 0.5) { f.setValueAtTime(700, t); f.linearRampToValueAtTime(1500, t + 0.25); f.linearRampToValueAtTime(700, t + 0.5); }
    } else if (pattern === 1) {
      // The two-tone.
      for (let t = t0, k = 0; t < t1; t += 0.22, k++) f.setValueAtTime(k % 2 ? 980 : 1320, t);
    } else {
      // The chirp.
      for (let t = t0; t < t1; t += 0.12) { f.setValueAtTime(2200, t); f.exponentialRampToValueAtTime(900, t + 0.1); }
    }
    hp.type = 'highpass'; hp.frequency.value = 500;
    const v = 0.05 * gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + 0.05);
    g.gain.setValueAtTime(v, t1 - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t1);
    o.connect(hp).connect(g).connect(out(c, audio, pan));
    o.start(t0); o.stop(t1 + 0.05);
  } catch { /* no audio */ }
}

/**
 * A sharp crack: one round cooking off in a burning dump, a firework's
 * break, a flare's pop. Noise through a band-pass with a fast decay.
 */
export function crack(audio, pos, delay = 0, gain = 0.3, freq = 1800, decay = 0.09) {
  if (!ok(audio)) return;
  const c = audio.ctx;
  const pl = place(audio, pos, 520);
  if (pl.gain < 0.01) return;
  const t0 = c.currentTime + delay + Math.min(3, pl.dist / 343);
  try {
    const src = c.createBufferSource(); src.buffer = noise(c);
    const bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.7;
    g.gain.setValueAtTime(gain * pl.gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    src.connect(bp).connect(g).connect(out(c, audio, pl.pan));
    src.start(t0, Math.random() * 1.5); src.stop(t0 + decay + 0.02);
  } catch { /* no audio */ }
}

/** A low thump: a mortar-style launch tube, a firework going up. */
export function thump(audio, pos, delay = 0, gain = 0.35) {
  if (!ok(audio)) return;
  const c = audio.ctx;
  const pl = place(audio, pos, 520);
  if (pl.gain < 0.01) return;
  const t0 = c.currentTime + delay + Math.min(3, pl.dist / 343);
  try {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.18);
    g.gain.setValueAtTime(gain * pl.gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.connect(g).connect(out(c, audio, pl.pan));
    o.start(t0); o.stop(t0 + 0.25);
  } catch { /* no audio */ }
}

/** A rising hiss: a firework or a flare on its way up. */
export function hiss(audio, pos, delay = 0, dur = 1.2, gain = 0.12) {
  if (!ok(audio)) return;
  const c = audio.ctx;
  const pl = place(audio, pos, 520);
  if (pl.gain < 0.01) return;
  const t0 = c.currentTime + delay + Math.min(3, pl.dist / 343);
  try {
    const src = c.createBufferSource(); src.buffer = noise(c);
    const bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(900, t0); bp.frequency.exponentialRampToValueAtTime(4200, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * pl.gain, t0 + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(out(c, audio, pl.pan));
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.02);
  } catch { /* no audio */ }
}

/** A short bright tick: one line of pay landing on the report. */
export function tick(audio, pitch = 1) {
  if (!ok(audio)) return;
  const c = audio.ctx, t0 = c.currentTime;
  try {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1250 * pitch, t0);
    o.frequency.exponentialRampToValueAtTime(900 * pitch, t0 + 0.06);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    o.connect(g).connect(audio.master);
    o.start(t0); o.stop(t0 + 0.1);
  } catch { /* no audio */ }
}

/**
 * A promotion: a brass-ish call up a major triad to the octave and held,
 * three detuned saws through a swelling low-pass, with a snare roll under
 * the first notes.
 */
export function fanfare(audio) {
  if (!ok(audio)) return;
  const c = audio.ctx, t0 = c.currentTime + 0.02;
  const notes = [[392, 0, 0.16], [523.3, 0.16, 0.16], [659.3, 0.32, 0.16], [784, 0.48, 1.1]];
  try {
    for (const [f, at, len] of notes) {
      const lp = c.createBiquadFilter(), g = c.createGain();
      lp.type = 'lowpass'; lp.Q.value = 1.2;
      lp.frequency.setValueAtTime(700, t0 + at);
      lp.frequency.exponentialRampToValueAtTime(3200, t0 + at + Math.min(0.12, len));
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(0.09, t0 + at + 0.03);
      g.gain.setValueAtTime(0.09, t0 + at + len * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len + 0.25);
      lp.connect(g).connect(audio.master);
      for (const d of [-6, 0, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
        o.connect(lp); o.start(t0 + at); o.stop(t0 + at + len + 0.3);
      }
    }
    // The snare roll.
    for (let k = 0; k < 10; k++) {
      const src = c.createBufferSource(); src.buffer = noise(c);
      const bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.6;
      const t = t0 + k * 0.048;
      g.gain.setValueAtTime(0.05 * (0.6 + k / 14), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(bp).connect(g).connect(audio.master);
      src.start(t, Math.random()); src.stop(t + 0.06);
    }
  } catch { /* no audio */ }
}
