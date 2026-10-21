/**
 * Heat: how warm the phone says it is, and what the game does about it.
 *
 * A web page has no thermometer, so the game's only answer to a hot phone
 * used to be the frame-time governor, which is blind to heat: a phone that
 * holds thirty frames while roasting is never asked to do less, and iOS
 * eventually throttles the whole device, which is when the frame falls apart
 * and the player's hand is hot. The App Store build has the phone's own
 * thermometer: `ProcessInfo.thermalState` through the app's Thermal plugin
 * (ios/App/App/ThermalPlugin.swift), with Low Power Mode and the battery
 * beside it. Four states, and Apple's own guidance for each: nominal, as
 * built; fair, do less in the background; serious, cut frame rate and
 * resolution; critical, the least that keeps the app usable. This is the
 * ladder, climbed as the phone warms and come back down as it cools, so
 * the device is never left to throttle itself.
 *
 * On the web the same ladder is driven by a proxy. Thermal throttling shows
 * as frames that keep getting longer at a steady workload; the governor's
 * samples give that away, and `observe` climbs a rung when the frame has
 * grown a third over a minute with the scene no busier.
 *
 * What a rung does lives with the thing it turns down: the engine's heat
 * scale on the pixel ratio, the particle fill budget, the frame cap in
 * power.js, the shadow redraw cadence in main.js. `apply` is the one place
 * that sets all of them.
 */
import { isMobile } from './quality.js';

export const LEVELS = ['nominal', 'fair', 'serious', 'critical'];

/** What each rung turns down. Scale multiplies the pixel ratio the tier allows. */
export const RUNGS = [
  { scale: 1, fill: 1, fps: 30, shadowEvery: 1 },
  { scale: 0.85, fill: 0.6, fps: 30, shadowEvery: 3 },
  { scale: 0.72, fill: 0.4, fps: 24, shadowEvery: 6 },
  { scale: 0.6, fill: 0.25, fps: 20, shadowEvery: 0 },
];

export const heat = {
  level: 0,
  source: 'none',          // 'native' when the phone reports, 'proxy' when inferred
  lowPower: false,
  battery: null,           // { level: 0..1, state } where the phone says
  _listeners: [],
  _plugin: null,

  onChange(fn) { this._listeners.push(fn); },
  _fire() { for (const fn of this._listeners) { try { fn(this); } catch (e) { console.warn('[heat]', e); } } },

  /** The phone's report, through the plugin where the app has one. */
  async attach() {
    const native = typeof window !== 'undefined'
      && (window.location?.protocol === 'capacitor:' || !!window.Capacitor?.isNativePlatform?.());
    // A test may plant a plugin on the page; the app registers it natively.
    let plugin = window.Capacitor?.Plugins?.Thermal || null;
    if (!plugin && native) {
      try { const m = await import('@capacitor/core'); plugin = m.registerPlugin('Thermal'); } catch { plugin = null; }
    }
    if (!plugin || typeof plugin.state !== 'function') return false;
    this._plugin = plugin;
    this.source = 'native';
    const take = (s) => {
      if (!s) return;
      const lv = Math.max(0, LEVELS.indexOf(s.thermal));
      const low = !!s.lowPower;
      const bat = s.batteryLevel == null ? null : { level: s.batteryLevel, state: s.batteryState || 'unknown' };
      const changed = lv !== this.level || low !== this.lowPower;
      this.level = lv; this.lowPower = low; this.battery = bat;
      if (changed) this._fire();
    };
    try { take(await plugin.state()); } catch (e) { console.warn('[heat] no state', e); }
    try { plugin.addListener('change', take); } catch { /* no events; the state call stands */ }
    console.log(`[heat] the phone reports ${LEVELS[this.level]}${this.lowPower ? ' · low power mode' : ''}`);
    return true;
  },

  /**
   * The web's proxy: fed every governor window with the frame's p80 and the
   * scene's load (awake bodies plus units, a rough size of the work). A frame
   * a third longer than the running baseline for the same load, held for
   * three windows, is a phone throttling; the baseline is the first minute.
   */
  _base: null, _hot: 0, _cool: 0,
  observe(p80, load) {
    if (this.source === 'native' || !isMobile()) return;
    this.source = 'proxy';
    if (!this._base || load < this._base.load * 0.7) { this._base = { p80, load, n: 1 }; return; }
    if (this._base.n < 20) { this._base.p80 = (this._base.p80 * this._base.n + p80) / (this._base.n + 1); this._base.n++; return; }
    const expected = this._base.p80 * Math.max(1, load / Math.max(1, this._base.load));
    if (p80 > expected * 1.35) { this._hot++; this._cool = 0; } else { this._cool++; this._hot = 0; }
    if (this._hot >= 3 && this.level < 2) { this._hot = 0; this.level++; this._fire(); }
    else if (this._cool >= 12 && this.level > 0) { this._cool = 0; this.level--; this._fire(); }
  },

  /** For the probes and the test panel. */
  set(level) {
    const lv = Math.max(0, Math.min(RUNGS.length - 1, level | 0));
    if (lv === this.level) return;
    this.level = lv; this._fire();
  },
  get rung() { return RUNGS[this.level]; },
  get says() { return `${LEVELS[this.level]}${this.source === 'proxy' ? ' (inferred)' : ''}${this.lowPower ? ' · low power' : ''}`; },
};
