/**
 * Before and after: the recon photograph of the landmark beside the ruin the
 * player left, on one card sized for a social feed.
 *
 * The ruin is taken from the game's own canvas the moment the report goes up,
 * which is the win orbit over what is left. WebGL throws the drawing buffer
 * away once a frame is shown, so the picture is taken straight after a render
 * of its own, in the same task. The card is drawn on a 2D canvas: the two
 * pictures side by side, cropped to fill, a tag on each, and a band under
 * them with the place, the claim and the address.
 *
 * Shared through the system sheet where the browser can share a file, saved
 * as a download where it cannot, as the collapse clip is.
 */
const W = 1200, H = 675, BAND = 118;

export class BeforeAfter {
  constructor({ level, render, canvas, onModal = () => {} }) {
    this.level = level;
    this.render = render;
    this.canvas = canvas;
    this.onModal = onModal;
    this.blob = null;
    this.url = null;
    this.view = null;
  }

  /** Grab the ruin now; compose the card when the photograph has loaded. */
  async capture({ claim = '', rounds = 0 } = {}) {
    let after;
    try {
      this.render();
      after = document.createElement('canvas');
      after.width = this.canvas.width; after.height = this.canvas.height;
      after.getContext('2d').drawImage(this.canvas, 0, 0);
    } catch { return null; }
    const before = await new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = `assets/recon/${this.level.id}.jpg`;
    });
    if (!before) return null;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#0b0d10'; g.fillRect(0, 0, W, H);
    const ph = H - BAND, pw = (W - 6) / 2;
    cover(g, before, 0, 0, pw, ph);
    cover(g, after, pw + 6, 0, pw, ph);
    tag(g, 'BEFORE', 18, 18, '#dbe3ec', 'rgba(11,13,16,0.72)');
    tag(g, 'AFTER', pw + 24, 18, '#140904', '#e0a33c');
    // The band.
    const y = ph;
    g.fillStyle = '#0b0d10'; g.fillRect(0, y, W, BAND);
    g.fillStyle = '#e06c34'; g.fillRect(0, y, W, 3);
    const L = this.level;
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#eaf1f8';
    g.font = '700 38px system-ui, -apple-system, Segoe UI, sans-serif';
    g.fillText(fit(g, (L.target || L.name || '').toUpperCase(), 640), 28, y + 54);
    g.fillStyle = '#7e8b9b';
    g.font = '500 19px system-ui, -apple-system, Segoe UI, sans-serif';
    const sub = [L.place || L.name, rounds > 0 ? `${rounds} rounds` : ''].filter(Boolean).join(' · ');
    g.fillText(fit(g, sub.toUpperCase(), 640), 28, y + 88);
    g.textAlign = 'right';
    if (claim) {
      g.fillStyle = '#7e8b9b';
      g.font = '600 13px system-ui, -apple-system, Segoe UI, sans-serif';
      g.fillText('INSURANCE CLAIM', W - 28, y + 30);
      g.fillStyle = '#6fd08c';
      g.font = '700 34px system-ui, -apple-system, Segoe UI, sans-serif';
      g.fillText(claim, W - 28, y + 68);
    }
    g.fillStyle = '#e06c34';
    g.font = '700 15px system-ui, -apple-system, Segoe UI, sans-serif';
    g.fillText('EXCESSIVE FORCE · GETARSENAL.APP', W - 28, y + 98);
    g.textAlign = 'left';
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) return null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.blob = blob;
    this.url = URL.createObjectURL(blob);
    return blob;
  }

  get fileName() {
    const slug = (this.level.id || 'target').replace(/[^a-z0-9]+/g, '-');
    return `excessive-force-${slug}-before-after.jpg`;
  }

  get canShareFile() {
    if (!this.blob || !navigator.canShare) return false;
    try { return navigator.canShare({ files: [new File([this.blob], this.fileName, { type: 'image/jpeg' })] }); } catch { return false; }
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'ba-view';
    el.hidden = true;
    el.innerHTML = `
      <div class="cv-inner">
        <div class="cv-title">BEFORE / AFTER</div>
        <img class="cv-video ba-img" alt="The landmark before, and what is left of it">
        <div class="cv-buttons">
          <button type="button" class="ec-btn primary" data-act="share">SHARE</button>
          <button type="button" class="ec-btn" data-act="save">SAVE</button>
          <button type="button" class="ec-btn quiet" data-act="close">CLOSE</button>
        </div>
      </div>`;
    el.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (act === 'share') this.share();
      else if (act === 'save') this.save();
      else if (act === 'close' || e.target === el) this.close();
    });
    document.body.appendChild(el);
    this.view = el;
  }

  open() {
    if (!this.url) return;
    if (!this.view) this._build();
    this.view.querySelector('img').src = this.url;
    this.view.querySelector('[data-act="share"]').hidden = !this.canShareFile;
    this.view.hidden = false;
    this.onModal(true);
  }

  close() {
    if (!this.view) return;
    this.view.hidden = true;
    this.onModal(false);
  }

  async share() {
    if (!this.blob) return;
    try {
      await navigator.share({
        files: [new File([this.blob], this.fileName, { type: 'image/jpeg' })],
        title: 'Excessive Force',
        text: `${this.level.target || this.level.name}: before and after. https://getarsenal.app/?level=${encodeURIComponent(this.level.id)}`,
      });
    } catch (e) {
      if (e && e.name !== 'AbortError') this.save();
    }
  }

  save() {
    if (!this.url) return;
    const a = document.createElement('a');
    a.href = this.url; a.download = this.fileName;
    document.body.appendChild(a); a.click(); a.remove();
  }
}

/** Draw `img` to fill the box, cropped about its centre. */
function cover(g, img, x, y, w, h) {
  const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function tag(g, text, x, y, fg, bg) {
  g.font = '700 15px system-ui, -apple-system, Segoe UI, sans-serif';
  const w = g.measureText(text).width + 22;
  g.fillStyle = bg;
  g.fillRect(x, y, w, 30);
  g.fillStyle = fg;
  g.fillText(text, x + 11, y + 21);
}

function fit(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 3 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
