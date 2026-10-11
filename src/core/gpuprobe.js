/**
 * What the device's WebGL says about itself: the renderer's name (for the
 * quality tier) and the depth buffer's bits (for logarithmic depth).
 *
 * Both were asked of a throwaway canvas, one each, on every boot — two extra
 * contexts made and torn down while the player watches the loading screen,
 * which on a phone is a few hundred milliseconds of driver work for two
 * numbers that never change. One context answers both now, once per browser,
 * and the answer is kept with the user agent it was read under, so an update
 * to the browser asks again.
 */
const KEY = 'tt.gpu';
let memo = null;

export function gpuProbe() {
  if (memo) return memo;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (kept && kept.ua === ua && kept.depth > 0) return (memo = kept);
  } catch { /* private mode: ask the canvas */ }
  let renderer = '', depth = 24, ok = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      ok = true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      depth = gl.getParameter(gl.DEPTH_BITS) || 24;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* both answers are optional */ }
  memo = { ua, renderer, depth };
  if (ok) { try { localStorage.setItem(KEY, JSON.stringify(memo)); } catch { /* private mode */ } }
  return memo;
}
