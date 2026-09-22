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

/** A phone, by any of the signals that survive on one. */
function isMobile() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}

/**
 * What a phone may not have, whatever tier it is on.
 *
 * Promoting phones off the bottom tier was right — they were rendering with
 * no shadows and the coarsest stone on hardware that manages sixty frames —
 * but two of the things that came with it are priced in video memory rather
 * than in frame time, and a phone browser does not fail gracefully when it
 * runs out. It discards the page. What that looks like from the sofa is the
 * screen going black, the game hitching, and the whole app quietly starting
 * again from the top.
 *
 * Bloom is five render targets at half and quarter resolution, allocated for
 * the life of the session. A pixel ratio of 2 doubles the area of every one
 * of those and of the frame itself: on a 430-point screen it is the
 * difference between an 860-pixel buffer and a 1720-pixel one, four times
 * the memory, for a sharpness gain nobody can see at arm's length.
 *
 * Shadows, the finer stone, the ground clutter and the extra debris are all
 * frame-time costs that the governor can throttle if it needs to, so they
 * stay — they are also most of what the promotion was for. These two do not
 * throttle, so a phone does not get them.
 */
function forPhone(tier) {
  if (!isMobile()) return tier;
  return { ...tier, bloom: false, pixelRatioCap: Math.min(tier.pixelRatioCap, 1.5) };
}

export function detectQuality(override) {
  const stored = override || (typeof localStorage !== 'undefined'
    ? localStorage.getItem('tt.quality')
    : null);
  const id = TIERS[stored] ? stored : guessTier();
  return { ...forPhone(TIERS[id]), id, simd: hasWasmSimd() };
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
  constructor(quality, engine = null) {
    this.quality = quality;
    this.engine = engine;
    this.baseBudget = quality.activeBodies;
    this.budget = quality.activeBodies;
    this.samples = [];
    this.cooldown = 0;
    this.stage = 0;
  }

  /**
   * What each rung costs the picture, cheapest-looking first.
   *
   * The order is the whole design. Pixel ratio goes before bloom and bloom
   * before shadows, because that is the order of how much each one saves per
   * unit of how much it shows — and every rung above zero saves more than
   * emptying the body budget does.
   */
  static STAGES = [
    { scale: 1, bloom: true, shadows: true, says: 'full' },
    { scale: 0.82, bloom: true, shadows: true, says: 'fewer pixels' },
    { scale: 0.68, bloom: true, shadows: true, says: 'fewer pixels' },
    { scale: 0.68, bloom: false, shadows: true, says: 'no bloom' },
    { scale: 0.6, bloom: false, shadows: false, says: 'no bloom, no shadows' },
  ];

  _apply() {
    const e = this.engine;
    if (!e) return;
    const s = AdaptiveGovernor.STAGES[this.stage];
    e.setRenderScale(s.scale);
    e.setBloom(s.bloom);
    e.setShadows(s.shadows);
  }

  /** What it has given up, for the diagnostics panel. */
  get shed() {
    const s = AdaptiveGovernor.STAGES[this.stage];
    return this.stage === 0 && this.budget >= this.baseBudget
      ? 'nothing'
      : `${s.says} · ${this.budget} bodies`;
  }

  /**
   * Shed the render cost first, and the simulation last.
   *
   * This used to own one lever — the body budget — and pulled it whenever the
   * frame ran long. On a phone that is very nearly always the wrong lever. A
   * player's own diagnostics, taken on a level that was crawling, read: 0.06
   * milliseconds of physics, no bodies simulated at all, twenty-nine frames a
   * second, and a body budget cut from eleven hundred to its hard floor of a
   * hundred and eighty. The governor had spent everything it had throttling
   * the one thing that was costing nothing, while a megapixel of shading, a
   * bloom chain and a shadow map went untouched — and then a section of the
   * building let go, the frame went past a third of a second, and the game
   * read as frozen.
   *
   * So the ladder above comes first and the body budget comes after it. The
   * budget still moves, because a thousand loose stones genuinely is work, but
   * it is no longer asked to pay for a bill it did not run up.
   */
  update(dtMs) {
    this.samples.push(dtMs);
    if (this.samples.length < 45) return this.budget;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const p80 = sorted[Math.floor(sorted.length * 0.8)];
    this.samples.length = 0;

    if (this.cooldown > 0) { this.cooldown--; return this.budget; }

    const last = AdaptiveGovernor.STAGES.length - 1;
    if (p80 > 26) {
      // Down a rung of shading; only once there are none left does the
      // simulation start paying.
      if (this.engine && this.stage < last) {
        this.stage++;
        this._apply();
        // Two rounds to settle: changing the drawing buffer costs a frame of
        // its own, and measuring that frame would read as another failure.
        this.cooldown = 3;
      } else if (this.budget > 180) {
        this.budget = Math.max(180, Math.floor(this.budget * 0.75));
        this.cooldown = 2;
      }
    } else if (p80 < 15) {
      // Up again, simulation first: giving the stones back is what the player
      // came for, and it is the cheaper of the two to undo if it was wrong.
      if (this.budget < this.baseBudget) {
        this.budget = Math.min(this.baseBudget, Math.floor(this.budget * 1.15) + 20);
        this.cooldown = 1;
      } else if (this.engine && this.stage > 0) {
        this.stage--;
        this._apply();
        this.cooldown = 4;
      }
    }
    return this.budget;
  }
}
