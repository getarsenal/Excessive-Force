/**
 * The collapse clip.
 *
 * A building coming down is the one moment in this game a player wants to
 * show somebody, so the game films it for them. When a big section starts to
 * fall, the next nine seconds of the picture are recorded — the world only,
 * no interface, scaled to a size a phone can encode without dropping frames,
 * with the game's name and the place in the corner — and the game's own sound
 * with it. The heaviest collapse of the level is the one kept.
 *
 * Nothing is recorded the rest of the time. Each frame of a recording is one
 * `drawImage` of the finished WebGL frame into a small 2D canvas, done in
 * `frame()` straight after the render so the drawing buffer is still valid
 * without `preserveDrawingBuffer` (which would cost every frame of every
 * level, recorded or not).
 *
 * Shared through the system share sheet where the browser can share a file
 * (iOS Safari, Android Chrome), saved as a download where it cannot.
 */

const SECONDS = 9;
const LONG_SIDE = 1080;
const FPS = 30;

/** The first container and codec this browser can record, mp4 preferred. */
function pickType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  for (const t of [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
  ]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

export class CollapseClip {
  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas  the game's WebGL canvas
   * @param {object} [o.audio]            the game's audio, for its limiter
   * @param {() => string} [o.place]      the level's name, for the corner
   * @param {(open: boolean) => void} [o.onModal]  pause while the viewer is up
   */
  constructor(o) {
    this.canvas = o.canvas;
    this.audio = o.audio || null;
    this.place = o.place || (() => '');
    this.onModal = o.onModal || (() => {});
    this.type = pickType();
    this.enabled = !!this.type && typeof HTMLCanvasElement !== 'undefined'
      && !!HTMLCanvasElement.prototype.captureStream;
    // The regression harness collapses buildings on purpose all day long;
    // it does not need them filmed.
    try { if (localStorage.getItem('tt.suite') === '1') this.enabled = false; } catch { /* private mode */ }
    this.recording = null;
    this.best = null;               // { blob, url, ext, weight, place }
    this.onReady = null;            // called when a new best clip is kept
    this._buildViewer();
  }

  /**
   * A section is falling. `weight` is its mass: a heavier collapse than the
   * one already kept is worth recording over it, a lighter one is not, and
   * nothing starts while a recording is running — that one is already
   * filming this.
   */
  trigger(weight) {
    if (!this.enabled || this.recording) return;
    if (this.best && weight <= this.best.weight) return;
    try { this._start(weight); } catch (e) { console.warn('clip: could not record', e); this.enabled = false; }
  }

  _start(weight) {
    const src = this.canvas;
    const k = Math.min(1, LONG_SIDE / Math.max(src.width, src.height, 1));
    const w = Math.max(2, Math.round(src.width * k / 2) * 2);
    const h = Math.max(2, Math.round(src.height * k / 2) * 2);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { alpha: false });
    const stream = cv.captureStream(FPS);
    // The sound, if the audio graph is up: a tap on the limiter, which is
    // everything the player hears, disconnected again when the clip ends.
    let tap = null;
    const A = this.audio;
    if (A && A.ctx && A.limiter && A.ctx.createMediaStreamDestination) {
      try {
        tap = A.ctx.createMediaStreamDestination();
        A.limiter.connect(tap);
        for (const t of tap.stream.getAudioTracks()) stream.addTrack(t);
      } catch { tap = null; }
    }
    const rec = new MediaRecorder(stream, { mimeType: this.type, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const place = this.place();
    rec.onstop = () => {
      if (tap) { try { A.limiter.disconnect(tap); } catch { /* already gone */ } }
      for (const t of stream.getTracks()) t.stop();
      this.recording = null;
      const blob = new Blob(chunks, { type: this.type.split(';')[0] });
      if (blob.size < 20000) return;                    // nothing worth keeping
      if (this.best) URL.revokeObjectURL(this.best.url);
      this.best = { blob, url: URL.createObjectURL(blob), ext: this.type.startsWith('video/mp4') ? 'mp4' : 'webm', weight, place };
      if (this.onReady) this.onReady(this.best);
    };
    rec.start(500);
    this.recording = { rec, g, w, h, place, until: performance.now() + SECONDS * 1000 };
  }

  /** Called straight after each render: copy the frame in, and stop on time. */
  frame() {
    const r = this.recording;
    if (!r) return;
    const { g, w, h } = r;
    g.drawImage(this.canvas, 0, 0, w, h);
    // The corner: the name, the place, where to play it. Sized off the short
    // side, so a portrait phone's clip does not run the caption off its
    // edge, and a line that is still too long is squeezed to fit.
    const s = Math.max(0.8, Math.min(w, h) / 520);
    const pad = 16 * s;
    const room = w - pad * 2;
    const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const line = (text, weight, size, y, colour) => {
      g.font = `${weight} ${Math.round(size)}px ${FONT}`;
      const tw = g.measureText(text).width;
      if (tw > room) g.font = `${weight} ${Math.floor(size * room / tw)}px ${FONT}`;
      g.fillStyle = colour;
      g.fillText(text, pad, y);
    };
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 6 * s;
    g.textBaseline = 'alphabetic';
    line('EXCESSIVE FORCE', 700, 22 * s, h - pad - 38 * s, 'rgba(255,255,255,0.95)');
    if (r.place) line(r.place, 500, 14 * s, h - pad - 18 * s, 'rgba(255,255,255,0.85)');
    line('getarsenal.app', 600, 13 * s, h - pad, 'rgba(255,200,170,0.9)');
    g.restore();
    if (performance.now() >= r.until && r.rec.state === 'recording') r.rec.stop();
  }

  /** The level is ending or restarting: finish what is being filmed. */
  flush() {
    const r = this.recording;
    if (r && r.rec.state === 'recording') r.rec.stop();
  }

  // ── The viewer ────────────────────────────────────────────────────────

  _buildViewer() {
    const el = document.createElement('div');
    el.id = 'clip-view';
    el.hidden = true;
    el.innerHTML = `
      <div class="cv-inner">
        <div class="cv-title">THE COLLAPSE</div>
        <video class="cv-video" playsinline muted loop autoplay></video>
        <div class="cv-buttons">
          <button type="button" class="ec-btn primary" data-act="share">SHARE</button>
          <button type="button" class="ec-btn" data-act="save">SAVE</button>
          <button type="button" class="ec-btn quiet" data-act="close">CLOSE</button>
        </div>
        <div class="cv-note"></div>
      </div>`;
    document.body.appendChild(el);
    this.view = el;
    this.video = el.querySelector('video');
    this.note = el.querySelector('.cv-note');
    el.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (act === 'share') this.share();
      else if (act === 'save') this.save();
      else if (act === 'close' || e.target === el) this.close();
    });
    // Sound on at a tap on the picture: autoplay is only allowed muted.
    this.video.addEventListener('click', () => { this.video.muted = !this.video.muted; });
  }

  get fileName() {
    const slug = (this.best?.place || 'collapse').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `excessive-force-${slug || 'collapse'}.${this.best?.ext || 'mp4'}`;
  }

  get canShareFile() {
    if (!this.best || !navigator.canShare) return false;
    try {
      return navigator.canShare({ files: [new File([this.best.blob], this.fileName, { type: this.best.blob.type })] });
    } catch { return false; }
  }

  open() {
    if (!this.best) return;
    this.video.src = this.best.url;
    this.video.muted = true;
    this.video.play?.().catch(() => {});
    const share = this.view.querySelector('[data-act="share"]');
    share.hidden = !this.canShareFile;
    this.note.textContent = share.hidden ? 'Save it, then post it anywhere.' : 'Tap the picture for sound.';
    this.view.hidden = false;
    this.onModal(true);
  }

  close() {
    this.video.pause?.();
    this.view.hidden = true;
    this.onModal(false);
  }

  async share() {
    if (!this.best) return;
    const file = new File([this.best.blob], this.fileName, { type: this.best.blob.type });
    try {
      await navigator.share({
        files: [file],
        title: 'Excessive Force',
        text: `${this.best.place ? `${this.best.place}, ` : ''}brought down in Excessive Force. getarsenal.app`,
      });
    } catch (e) {
      // Cancelling the sheet is not an error worth saying anything about.
      if (e && e.name !== 'AbortError') this.save();
    }
  }

  save() {
    if (!this.best) return;
    const a = document.createElement('a');
    a.href = this.best.url;
    a.download = this.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
