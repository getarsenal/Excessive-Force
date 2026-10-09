"""
The numbers out of tools/powerbench.mjs, as statistics.

For each scene and build: frames measured, the draw's milliseconds (median,
mean, spread), triangles and draw calls a frame, and the share of frames that
redrew the shadow map. Between the builds: the change in median draw time
with a 95% interval from a two-level bootstrap (runs resampled, then frames
within each run, because frames from one page load are not independent of
each other), a Mann-Whitney test on the frames, and the change in triangles,
which is exact. Then a typical fight as a mix of the four scenes, with the
weights stated and varied.

  python3 tools/powerstats.py [/tmp/out/powerbench] [--json out.json]
"""
import json, glob, os, sys
import numpy as np
from scipy.stats import mannwhitneyu

DIR = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else '/tmp/out/powerbench'
OUT = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
SCENES = ['quiet', 'pan', 'battery', 'collapse']
# A fight as it is played, by share of the time: the stated default, and two
# others either side of it to show how much the answer leans on the guess.
MIXES = {
    'typical': {'quiet': 0.30, 'pan': 0.20, 'battery': 0.40, 'collapse': 0.10},
    'calm':    {'quiet': 0.50, 'pan': 0.20, 'battery': 0.25, 'collapse': 0.05},
    'heavy':   {'quiet': 0.10, 'pan': 0.15, 'battery': 0.55, 'collapse': 0.20},
}
rng = np.random.default_rng(7)

runs = {}
for f in sorted(glob.glob(os.path.join(DIR, '*-run*.json'))):
    d = json.load(open(f))
    runs.setdefault(d['label'], []).append(d)
labels = list(runs)
if len(labels) < 2:
    sys.exit(f'need two builds in {DIR}, found {labels}')
A, B = ('before', 'after') if {'before', 'after'} <= set(labels) else labels[:2]

def scene(label, s, key):
    """Per run, the scene's values of `key`."""
    return [np.array([fr[key] for fr in r['frames'] if fr['scene'] == s], float) for r in runs[label]]

def boot_median_change(a_runs, b_runs, n=4000):
    """Two-level bootstrap of (median B / median A - 1)."""
    out = np.empty(n)
    for i in range(n):
        ra = [a_runs[j] for j in rng.integers(0, len(a_runs), len(a_runs))]
        rb = [b_runs[j] for j in rng.integers(0, len(b_runs), len(b_runs))]
        sa = np.concatenate([r[rng.integers(0, len(r), len(r))] for r in ra])
        sb = np.concatenate([r[rng.integers(0, len(r), len(r))] for r in rb])
        out[i] = np.median(sb) / np.median(sa) - 1
    return np.percentile(out, [2.5, 97.5])

res = {'builds': {A: len(runs[A]), B: len(runs[B])}, 'meta': {A: runs[A][0]['meta'], B: runs[B][0]['meta']},
       'level': runs[A][0]['level'], 'scenes': {}, 'page': {}, 'mixes': {}}
print(f"level {res['level']}  runs {A}={len(runs[A])} {B}={len(runs[B])}  buffer {runs[A][0]['meta']['buffer']} tier {runs[A][0]['meta']['quality']}\n")
print(f"{'scene':9} {'build':7} {'frames':>6} {'draw ms med':>11} {'mean±sd':>15} {'tris/frame':>11} {'calls':>6} {'shadow redraw':>13}")
for s in SCENES:
    row = {}
    for L in (A, B):
        ms = np.concatenate(scene(L, s, 'renderMs')); tr = np.concatenate(scene(L, s, 'tris'))
        ca = np.concatenate(scene(L, s, 'calls')); sh = np.concatenate(scene(L, s, 'shadow'))
        aw = np.concatenate(scene(L, s, 'awake'))
        row[L] = {'n': int(len(ms)), 'ms_median': float(np.median(ms)), 'ms_mean': float(ms.mean()), 'ms_sd': float(ms.std(ddof=1)),
                  'ms_p25': float(np.percentile(ms, 25)), 'ms_p75': float(np.percentile(ms, 75)),
                  'tris_mean': float(tr.mean()), 'calls_mean': float(ca.mean()), 'shadow_share': float(sh.mean()), 'awake_median': float(np.median(aw))}
        r = row[L]
        print(f"{s:9} {L:7} {r['n']:6d} {r['ms_median']:11.0f} {r['ms_mean']:8.0f}±{r['ms_sd']:<6.0f} {r['tris_mean']/1e6:10.2f}M {r['calls_mean']:6.0f} {100*r['shadow_share']:12.0f}%")
    a_ms, b_ms = scene(A, s, 'renderMs'), scene(B, s, 'renderMs')
    lo, hi = boot_median_change(a_ms, b_ms)
    p = mannwhitneyu(np.concatenate(a_ms), np.concatenate(b_ms), alternative='two-sided').pvalue
    d = row[B]['ms_median'] / row[A]['ms_median'] - 1
    dt = row[B]['tris_mean'] / row[A]['tris_mean'] - 1
    row['change'] = {'ms_median': d, 'ms_ci95': [float(lo), float(hi)], 'mannwhitney_p': float(p), 'tris': dt,
                     'shadow_share': row[B]['shadow_share'] - row[A]['shadow_share']}
    print(f"{'':9} change  draw {100*d:+.1f}% (95% CI {100*lo:+.1f}% to {100*hi:+.1f}%, Mann-Whitney p={p:.2g})  triangles {100*dt:+.1f}%\n")
    res['scenes'][s] = row

for name, w in MIXES.items():
    m = {}
    for L in (A, B):
        m[L] = {'ms': sum(w[s] * res['scenes'][s][L]['ms_median'] for s in SCENES),
                'tris': sum(w[s] * res['scenes'][s][L]['tris_mean'] for s in SCENES),
                'shadow': sum(w[s] * res['scenes'][s][L]['shadow_share'] for s in SCENES)}
    m['change'] = {k: m[B][k] / m[A][k] - 1 for k in ('ms', 'tris')}
    m['weights'] = w
    res['mixes'][name] = m
    print(f"mix {name:8} {w}  draw {100*m['change']['ms']:+.1f}%  triangles {100*m['change']['tris']:+.1f}%  "
          f"({m[A]['tris']*30/1e6:.0f}M -> {m[B]['tris']*30/1e6:.0f}M triangles a second at 30 fps)  shadow redraws {100*m[A]['shadow']:.0f}% -> {100*m[B]['shadow']:.0f}% of frames")

for L in (A, B):
    r0 = runs[L]
    res['page'][L] = {'frosted': [r['dom']['frosted'] for r in r0], 'forever': [r['dom']['forever'] for r in r0],
                      'audio_shown': [r['hidden'].get('audioShown') for r in r0], 'audio_hidden': [r['hidden']['audioState'] for r in r0],
                      'errors': sum(len(r['errors']) for r in r0)}
print('\npage', json.dumps(res['page']))
if OUT:
    json.dump(res, open(OUT, 'w'), indent=1)
    print('wrote', OUT)
