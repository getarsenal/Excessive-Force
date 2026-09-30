/**
 * Accessibility: four switches, kept per device in `tt.a11y`.
 *
 * COLOUR — the survey paints load from indigo to red through green, which
 * is the one pair a red-green colour-blind player cannot tell apart, on the
 * one tool the whole game turns on. The alternative ramp runs purple to
 * yellow through orange, climbing in brightness all the way, so it reads in
 * any vision and in greyscale; the HUD's green and red go to blue and orange
 * with it.
 *
 * TEXT — the feed, the prompts, the generals' lines and the reports, a size
 * or two up.
 *
 * MOTION — no camera shake, no cut to the collapse, no drifting win orbit.
 *
 * HANDED — the dock to the left edge, and the survey button to the right,
 * for a thumb on the other side of the phone.
 *
 * Safe to import anywhere, the Node tools included: nothing here touches the
 * page until `apply` is called.
 */
const KEY = 'tt.a11y';
const DEFAULTS = { cb: false, text: 0, still: false, lefty: false };

function read() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...DEFAULTS }; }
}

export const access = {
  ...read(),
  set(k, v) {
    this[k] = v;
    try {
      localStorage.setItem(KEY, JSON.stringify({ cb: this.cb, text: this.text, still: this.still, lefty: this.lefty }));
    } catch { /* private mode */ }
    this.apply();
    for (const fn of this._on) { try { fn(k, v); } catch { /* a listener gone */ } }
  },
  _on: [],
  onChange(fn) { this._on.push(fn); },
  apply() {
    if (typeof document === 'undefined') return;
    const b = document.body.classList;
    b.toggle('a11y-cb', !!this.cb);
    b.toggle('a11y-text1', this.text === 1);
    b.toggle('a11y-text2', this.text === 2);
    b.toggle('a11y-still', !!this.still);
    b.toggle('a11y-lefty', !!this.lefty);
  },
};

/** The survey ramps, cool to hot: the standard one and the colour-blind one. */
export const SURVEY_RAMPS = {
  standard: [
    [0.13, 0.14, 0.32], [0.14, 0.44, 0.55], [0.28, 0.66, 0.44],
    [0.87, 0.73, 0.26], [0.82, 0.22, 0.16],
  ],
  // Purple, magenta, red-orange, orange, yellow: brightness rising the whole
  // way, so hot is lightest whatever colours the eye can separate.
  cb: [
    [0.17, 0.06, 0.36], [0.47, 0.13, 0.46], [0.80, 0.28, 0.30],
    [0.97, 0.58, 0.10], [0.99, 0.93, 0.42],
  ],
};
export const surveyRamp = () => (access.cb ? SURVEY_RAMPS.cb : SURVEY_RAMPS.standard);
