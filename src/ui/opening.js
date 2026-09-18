import { TAP } from './pointer.js';

/**
 * The opening.
 *
 * Three beats, the way a phone game opens: a door, the studio, the title.
 *
 *   1. The door. A tap, because a sting with sound cannot autoplay — every
 *      mobile browser requires a gesture first, and a studio logo that opens
 *      in silence is worse than one that waits a second to be let in. The
 *      tap doubles as the audio unlock for the whole session.
 *   2. The studio. Scheidel Interactive, the same sting Castle Hassle opens
 *      with, so the two games share a front door.
 *   3. The title. One thing arriving hard. The badge comes in out of the dark
 *      at four times its size and is stopped dead by the backdrop — a slam,
 *      a flash, the screen kicking, dust off the impact — and then the map.
 *      It used to be the two words of the title arriving one per shell with a
 *      tagline underneath, which is three beats and a paragraph to say what the
 *      logo says in one frame with the sound on.
 *
 * The whole thing is skippable at any point with a tap, and the world loads
 * behind it — physics and the wasm are already on their way down while the
 * studio card is on screen, so this costs the player no time they were not
 * going to spend watching a progress bar.
 */

const KEY = 'tt.opening';
const SKIP_KEY = 'tt.opening.skip';
const STING = 'studio-sting.mp4';

/** Whether the player wants the opening. Off for the harness and the curmudgeons. */
export function openingEnabled() {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}
export function setOpeningEnabled(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
}

/**
 * Don't play it on the way to the next mission.
 *
 * Every level change, restart and quality switch is a page load, so an
 * opening tied to page load is an opening that plays between missions — a
 * studio sting is a thing you see when you open the game, not something that
 * interrupts you on your way to the Taj Mahal. The game says so on its way
 * out; a reload the player asked for themselves carries no such note, so
 * refreshing still opens the game properly.
 *
 * The note is kept in local storage rather than session storage, and that is
 * the difference between this working and only appearing to. Session storage
 * dies with the tab, and a phone browser does not always keep the tab: iOS
 * discards a web app that is using too much and reloads it when the player
 * comes back, which reads to the game as a cold start and replays the sting.
 * A note that outlives the tab is skipped exactly once, by whoever picks it
 * up, however the reload came about.
 */
export function suppressNextOpening() {
  try { localStorage.setItem(SKIP_KEY, '1'); } catch { /* private mode */ }
}

/** Should the opening run on this load? Consumes the suppression if set. */
export function shouldPlayOpening() {
  if (!openingEnabled()) return false;
  try {
    if (localStorage.getItem(SKIP_KEY) === '1' || sessionStorage.getItem(SKIP_KEY) === '1') {
      localStorage.removeItem(SKIP_KEY);
      sessionStorage.removeItem(SKIP_KEY);
      return false;
    }
  } catch { /* private mode */ }
  return true;
}

/**
 * One shot of a sound file.
 *
 * `playbackRate` is doing real work here rather than saving a download: the
 * explosion sample at half speed is an octave down and four times as long,
 * which is the difference between a shell landing and a howitzer opening up
 * somewhere behind the horizon.
 */
function thump(src, { rate = 1, gain = 1, delay = 0 } = {}) {
  setTimeout(() => {
    try {
      const a = new Audio(src);
      a.volume = Math.max(0, Math.min(1, gain));
      a.playbackRate = rate;
      a.play().catch(() => { /* no gesture yet, or no audio at all */ });
    } catch { /* Audio unavailable */ }
  }, delay);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run the opening to its end, or to the first tap, whichever comes first.
 *
 * Always resolves. An opening that can fail to hand over is an opening that
 * can strand the player on a black screen, so every step here is written to
 * fall through: a missing video, a refused play(), a codec the browser will
 * not touch — all of them land on the next beat rather than on nothing.
 */
export async function runOpening() {
  const root = document.createElement('div');
  root.id = 'opening';
  root.innerHTML = `
    <div class="op-stage">
      <div class="op-gate">
        <img class="op-logo" src="logo-512.png" alt="" draggable="false">
        <div class="op-begin">${TAP.toUpperCase()} TO BEGIN</div>
        <div class="op-studio-small">SCHEIDEL INTERACTIVE</div>
      </div>
      <video class="op-sting" playsinline preload="auto" hidden></video>
      <div class="op-title" hidden>
        <div class="op-ring"></div>
        <img class="op-mark" src="logo-512.png" alt="EXCESSIVE FORCE" draggable="false">
      </div>
      <div class="op-flash"></div>
      <div class="op-dust"></div>
    </div>`;
  document.body.appendChild(root);

  const stage = root.querySelector('.op-stage');
  const gate = root.querySelector('.op-gate');
  const sting = root.querySelector('.op-sting');
  const title = root.querySelector('.op-title');
  const flash = root.querySelector('.op-flash');

  // ── 1. The door. Nothing happens until the player asks for it, and that
  // first gesture is what buys the session its audio.
  await new Promise((resolve) => {
    const go = () => {
      root.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
      resolve();
    };
    root.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
  });
  gate.classList.add('out');

  // From here a tap ends the whole opening rather than stepping to the next
  // beat. Someone skipping a title sequence is not asking to be shown the
  // rest of it one tap at a time.
  let bailed = false;
  let wake = null;
  const bail = () => {
    bailed = true;
    if (wake) { const w = wake; wake = null; w(); }
  };
  root.addEventListener('pointerdown', bail);
  window.addEventListener('keydown', bail);
  const hold = (ms) => (bailed
    ? Promise.resolve()
    : Promise.race([wait(ms), new Promise((r) => { wake = r; })]));

  // ── 2. The studio.
  if (!bailed) {
    try {
      sting.hidden = false;
      sting.src = STING;
      sting.playsInline = true;
      sting.volume = 0;
      await sting.play();
      // Up quickly, and down again over the last half second, so it hands
      // over to the title rather than stopping dead.
      const ramp = () => {
        if (sting.ended || sting.paused) return;
        const left = (sting.duration || 2.7) - sting.currentTime;
        sting.volume = 0.92 * Math.min(
          Math.min(1, sting.currentTime / 0.35),
          Math.min(1, Math.max(0, left / 0.5)),
        );
        requestAnimationFrame(ramp);
      };
      ramp();
      sting.classList.add('in');
      await Promise.race([
        new Promise((r) => sting.addEventListener('ended', r, { once: true })),
        hold(((sting.duration || 2.7) + 0.4) * 1000),
      ]);
    } catch {
      // Autoplay refused, no codec, no file. The studio name the gate was
      // already showing has done the job; move on rather than stopping on a
      // black screen.
    }
    try { sting.pause(); } catch { /* never started */ }
    sting.classList.remove('in');
    sting.hidden = true;
  }

  // ── 3. The slam.
  if (!bailed) {
    title.hidden = false;
    // A long way off, under the approach: the explosion sample at half speed,
    // so the card opens on something that is already in the air.
    thump('assets/explosion.mp3', { rate: 0.5, gain: 0.3 });
    // One frame of it sitting still at full size before it is let go, or the
    // browser starts the transition from wherever the layout happened to be.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (!bailed) {
      title.classList.add('go');
      // The impact is timed to the landing, not to the start: the mark is in
      // the air for 420 ms and everything else happens when it stops.
      setTimeout(() => {
        if (bailed) return;
        title.classList.add('hit');
        stage.classList.add('shake-2');
        flash.classList.add('on', 'hard');
        thump('assets/explosion.mp3', { rate: 0.34, gain: 0.95 });
        thump('assets/cannon.mp3', { rate: 0.6, gain: 0.7, delay: 40 });
        setTimeout(() => flash.classList.remove('on', 'hard'), 130);
      }, 400);
      await hold(1900);
    }
  }

  // ── Out, onto whatever the loader has got to by now.
  root.removeEventListener('pointerdown', bail);
  window.removeEventListener('keydown', bail);
  root.classList.add('done');
  await wait(560);
  root.remove();
}
