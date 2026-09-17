/**
 * Device tiering.
 *
 * The whole design rests on one number: how many rigid bodies can be *awake*
 * at once without dropping frames. Static chunks are nearly free in Rapier, so
 * a phone can hold the same 7,000-stone tower in memory as a desktop — what it
 * can't do is simulate 2,500 of them falling simultaneously. Every tier below
 * therefore keeps the building identical and only varies the active budget,
 * the settle threshold, and the shading cost.
 */

const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10,
  10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]);

export function hasWasmSimd() {
  try {
    return WebAssembly.validate(SIMD_PROBE);
  } catch {
    return false;
  }
}

const TIERS = {
  low: {
    name: 'low',
    activeBodies: 420,
    blockScale: 1.55,      // bigger stones => fewer chunks in the same tower
    settleFrames: 26,      // recycle sleeping debris sooner
    shadowMapSize: 0,      // no real-time shadows; baked AO only
    bloom: false,
    maxDebris: 140,
    maxSmokePuffs: 260,
    pixelRatioCap: 1.5,
    anisotropy: 2,
    physicsHz: 50,
    groundClutter: false,
  },
  medium: {
    name: 'medium',
    activeBodies: 1100,
    blockScale: 1.2,
    settleFrames: 40,
    shadowMapSize: 1024,
    bloom: true,
    maxDebris: 380,
    maxSmokePuffs: 620,
    pixelRatioCap: 2.0,
    anisotropy: 4,
    physicsHz: 60,
    groundClutter: true,
  },
  high: {
    name: 'high',
    activeBodies: 2600,
    blockScale: 1.0,
    settleFrames: 70,
    shadowMapSize: 2048,
    bloom: true,
    maxDebris: 900,
    maxSmokePuffs: 1400,
    pixelRatioCap: 2.0,
    anisotropy: 8,
    physicsHz: 60,
    groundClutter: true,
  },
  ultra: {
    name: 'ultra',
    activeBodies: 5000,
    blockScale: 0.85,
    settleFrames: 110,
    shadowMapSize: 4096,
    bloom: true,
    maxDebris: 1600,
    maxSmokePuffs: 2400,
    pixelRatioCap: 2.0,
    anisotropy: 16,
    physicsHz: 60,
    groundClutter: true,
  },
};

function guessTier() {
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const cores = navigator.hardwareConcurrency || (mobile ? 4 : 8);
  const mem = navigator.deviceMemory || (mobile ? 4 : 8);

  // WebGL renderer string is the most honest signal we get in a browser.
  let renderer = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
  } catch { /* renderer string is optional */ }

  if (mobile) {
    // Apple silicon phones genuinely can run the medium budget; most Android
    // mid-range cannot, so only promote on strong signals.
    //
    // The signals this used to ask for do not exist on an iPhone, and between
    // them they handed every iPhone ever made the tier built for the weakest
    // Android in the world. Safari stopped naming the GPU years ago: the
    // unmasked renderer string is the literal text "Apple GPU" on every iOS
    // device, so a pattern looking for A15 or M-series never matched one.
    // `navigator.deviceMemory` is not implemented in Safari at all, so it fell
    // back to 4 and failed the `>= 6` test as well. Two dead signals, one
    // verdict: low. No shadows, no bloom, coarser stone, half the debris and
    // a capped pixel ratio, on hardware that renders this at sixty frames.
    //
    // So the renderer saying Apple at all is the signal, because only Apple
    // hardware says it. Anything that turns out to be too optimistic is
    // caught from both ends anyway — the governor drops the body budget when
    // frames slip, and the quality menu is two taps away.
    const apple = /Apple/i.test(renderer) || /iPhone|iPad|iPod/i.test(ua);
    return (apple || (cores >= 6 && mem >= 6)) ? 'medium' : 'low';
  }
  if (/SwiftShader|llvmpipe|Software/i.test(renderer)) return 'low';
  if (cores >= 12 && mem >= 8) return 'ultra';
  if (cores >= 6) return 'high';
  return 'medium';
}

export function detectQuality(override) {
  const stored = override || (typeof localStorage !== 'undefined'
    ? localStorage.getItem('tt.quality')
    : null);
  const id = TIERS[stored] ? stored : guessTier();
  return { ...TIERS[id], id, simd: hasWasmSimd() };
}

export function setQuality(id) {
  if (!TIERS[id]) return false;
  try { localStorage.setItem('tt.quality', id); } catch { /* private mode */ }
  return true;
}

export const QUALITY_IDS = Object.keys(TIERS);

/**
 * Watches frame time and drops the active-body budget if we're losing frames.
 * This is what lets a phone start optimistic and degrade gracefully mid-collapse
 * instead of stuttering through the best moment in the game.
 */
export class AdaptiveGovernor {
  constructor(quality) {
    this.quality = quality;
    this.baseBudget = quality.activeBodies;
    this.budget = quality.activeBodies;
    this.samples = [];
    this.cooldown = 0;
  }

  update(dtMs) {
    this.samples.push(dtMs);
    if (this.samples.length < 45) return this.budget;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const p80 = sorted[Math.floor(sorted.length * 0.8)];
    this.samples.length = 0;

    if (this.cooldown > 0) { this.cooldown--; return this.budget; }

    if (p80 > 26 && this.budget > 180) {
      this.budget = Math.max(180, Math.floor(this.budget * 0.75));
      this.cooldown = 2;
    } else if (p80 < 15 && this.budget < this.baseBudget) {
      this.budget = Math.min(this.baseBudget, Math.floor(this.budget * 1.15) + 20);
      this.cooldown = 1;
    }
    return this.budget;
  }
}
