"""
The power benchmark as a page: tools/powerstats.py's JSON in, one HTML report
out, the same every time it is run, so a later pass is measured the way this
one was and the two reports can be laid side by side.

  python3 tools/powerreport.py stats.json out.html [--commit-before X --commit-after Y]
"""
import json, sys, html, datetime

S = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
arg = lambda k, d='': sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
CB, CA = arg('--commit-before', 'before'), arg('--commit-after', 'after')
A, B = list(S['builds'])
SC = ['quiet', 'pan', 'battery', 'collapse']
NAMES = {'quiet': 'Quiet', 'pan': 'Camera pan', 'battery': 'Battery firing', 'collapse': 'Tower collapsing'}
WHAT = {
    'quiet': 'Level loaded, nothing deployed, camera still.',
    'pan': 'Camera sliding across the city at 4 m a frame.',
    'battery': 'Four M777s set up on the tower and firing.',
    'collapse': 'Charges on the tower walls: about 80 stones out and 70 to 90 bodies falling.',
}
sc = S['scenes']; mx = S['mixes']; pg = S['page']; meta = S['meta'][B]
pct = lambda v, d=0: f"{v*100:+.{d}f}%"
e = html.escape

def bars(rows, fmt, unit_max, label):
    """A grouped horizontal bar chart in HTML: one band per scene, before and after."""
    out = [f'<div class="chart" role="img" aria-label="{e(label)}">']
    for name, a, b, extra in rows:
        out.append(f'<div class="band"><div class="bl">{e(name)}</div><div class="bars">')
        for cls, v, lab in (('b-before', a, A), ('b-after', b, B)):
            w = max(0.4, 100 * v / unit_max)
            out.append(f'<div class="row" data-tip="{e(name)} · {lab}: {e(fmt(v))}{e(extra.get(cls, ""))}">'
                       f'<span class="bar {cls}" style="width:{w:.2f}%"></span><span class="val">{e(fmt(v))}</span></div>')
        out.append('</div></div>')
    out.append('</div>')
    return '\n'.join(out)

tmax = max(max(sc[s][A]['tris_mean'], sc[s][B]['tris_mean']) for s in SC) * 1.12
mmax = max(max(sc[s][A]['ms_p75'], sc[s][B]['ms_p75']) for s in SC) * 1.08
tri_chart = bars([(NAMES[s], sc[s][A]['tris_mean'], sc[s][B]['tris_mean'], {}) for s in SC],
                 lambda v: f"{v/1e6:.2f} M", tmax, 'Triangles drawn per frame, before and after, by scene')
shadow_chart = bars([(NAMES[s], sc[s][A]['shadow_share'], sc[s][B]['shadow_share'], {}) for s in SC],
                    lambda v: f"{v*100:.0f}%", 1.12, 'Share of frames that redrew the shadow map, by scene')
ms_chart = bars([(NAMES[s], sc[s][A]['ms_median'], sc[s][B]['ms_median'],
                  {'b-before': f" (middle half {sc[s][A]['ms_p25']:.0f}–{sc[s][A]['ms_p75']:.0f} ms)",
                   'b-after': f" (middle half {sc[s][B]['ms_p25']:.0f}–{sc[s][B]['ms_p75']:.0f} ms)"}) for s in SC],
                lambda v: f"{v:,.0f} ms", mmax, 'Median draw time per frame in the software renderer, by scene')

typ = mx['typical']
tiles = [
    (pct(typ['change']['tris']), 'triangles a frame', f"{typ[A]['tris']/1e6:.2f} M → {typ[B]['tris']/1e6:.2f} M in a typical fight"),
    (f"{typ[A]['shadow']*100:.0f}% → {typ[B]['shadow']*100:.0f}%", 'frames redrawing shadows', 'the shadow pass is skipped on the rest'),
    (pct(typ['change']['ms']), 'draw time a frame', 'software-rendered, median, typical-fight mix'),
]
tile_html = ''.join(f'<div class="tile"><div class="big">{e(v)}</div><div class="cap">{e(c)}</div><div class="sub">{e(d)}</div></div>' for v, c, d in tiles)

rows = []
for s in SC:
    a, b, c = sc[s][A], sc[s][B], sc[s]['change']
    p = c['mannwhitney_p']
    rows.append(f"""<tr><th scope="row">{NAMES[s]}</th>
<td>{a['n']} / {b['n']}</td>
<td>{a['ms_median']:,.0f} → {b['ms_median']:,.0f}</td>
<td class="chg">{pct(c['ms_median'],1)}</td>
<td>{pct(c['ms_ci95'][0],1)} to {pct(c['ms_ci95'][1],1)}</td>
<td>{'&lt; 0.001' if p < 0.001 else f'{p:.3f}'}</td>
<td>{a['tris_mean']/1e6:.2f} → {b['tris_mean']/1e6:.2f} M</td>
<td class="chg">{pct(c['tris'],1)}</td>
<td>{a['shadow_share']*100:.0f}% → {b['shadow_share']*100:.0f}%</td>
<td>{a['calls_mean']:.0f} → {b['calls_mean']:.0f}</td></tr>""")
mix_rows = ''.join(f"""<tr><th scope="row">{k}</th><td>{' · '.join(f"{NAMES[s].split()[0].lower()} {int(round(w*100))}%" for s, w in m['weights'].items())}</td>
<td>{m[A]['tris']*30/1e6:.0f} M → {m[B]['tris']*30/1e6:.0f} M</td><td class="chg">{pct(m['change']['tris'],1)}</td><td class="chg">{pct(m['change']['ms'],1)}</td>
<td>{m[A]['shadow']*100:.0f}% → {m[B]['shadow']*100:.0f}%</td></tr>""" for k, m in mx.items())

def same(v): return len(set(map(str, v))) == 1
pa, pb = pg[A], pg[B]
page_rows = [
    ('Frosted-glass panels visible in battle', f"{pa['frosted'][0]}", f"{pb['frosted'][0]}", 'Measured on the idle battle screen. More appear with drawers and cards open; all are gone on a phone now.'),
    ('Audio engine with the page hidden', pa['audio_hidden'][0], pb['audio_hidden'][0], 'Before, the mixer kept running behind another app. After, it suspends and resumes on return.'),
    ('Animations running forever on the battle screen', f"{pa['forever'][0]}", f"{pb['forever'][0]}", 'Zero at the start of a battle in both. The news ticker only exists after a win, and it is now stopped once it is hidden again.'),
    ('Hangar frame rate on a 120 Hz phone', '120', '30', 'Set by the code (pacing to 30 on the saver), not measured here.'),
    ('Page errors in all runs', f"{pa['errors']}", f"{pb['errors']}", ''),
]
page_html = ''.join(f'<tr><th scope="row">{e(n)}</th><td>{e(str(a))}</td><td>{e(str(b))}</td><td class="note">{e(d)}</td></tr>' for n, a, b, d in page_rows)

# What a phone should see. GPU share of device power while this game runs is
# not measurable here; it is stated, and varied, so the range is honest.
r_ms = -typ['change']['ms']
r_tri = -typ['change']['tris']
def gain(share, cut): return 1 / (1 - share * cut) - 1
proj = []
for share in (0.35, 0.45, 0.55):
    lo, hi = gain(share, min(r_ms, r_tri)), gain(share, max(r_ms, r_tri))
    proj.append((share, lo, hi))
proj_rows = ''.join(f'<tr><th scope="row">{int(s*100)}% of the phone\'s power</th><td>{lo*100:.0f}% to {hi*100:.0f}% longer play per charge</td><td>{s*min(r_ms,r_tri)*100:.0f}% to {s*max(r_ms,r_tri)*100:.0f}% less power drawn</td></tr>' for s, lo, hi in proj)

today = datetime.date.today().isoformat()
page = f"""<title>Phone Power Benchmark</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: one reading column, figures first, then the tables that back them, then the method. */
:root {{
  --bg: #f3f5f7; --surface: #ffffff; --ink: #14181d; --ink-2: #4a5360; --muted: #6b7482;
  --rule: #d9dee4; --grid: #e6e9ed; --accent: #1f5fa8; --good: #1d7a46;
  --before: #eb6834; --after: #2a78d6;
  --f-display: 'Oswald', 'Arial Narrow', 'Roboto Condensed', sans-serif;
  --f-body: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --f-data: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg: #111418; --surface: #191d22; --ink: #eef1f4; --ink-2: #b7c0cb; --muted: #8a94a1;
  --rule: #2c333b; --grid: #262c33; --accent: #7fb2ec; --good: #5cc28a;
  --before: #d95926; --after: #3987e5; color-scheme: dark; }} }}
:root[data-theme="dark"] {{
  --bg: #111418; --surface: #191d22; --ink: #eef1f4; --ink-2: #b7c0cb; --muted: #8a94a1;
  --rule: #2c333b; --grid: #262c33; --accent: #7fb2ec; --good: #5cc28a;
  --before: #d95926; --after: #3987e5; color-scheme: dark; }}
body {{ background: var(--bg); color: var(--ink); font: 15px/1.6 var(--f-body); }}
.wrap {{ max-width: 920px; margin: 0 auto; padding-inline: 20px; padding-block: 36px 64px; display: grid; gap: 40px; }}
header {{ display: grid; gap: 10px; }}
.eyebrow {{ font: 500 12px/1 var(--f-data); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }}
h1 {{ font: 600 clamp(30px, 6vw, 44px)/1.05 var(--f-display); letter-spacing: .01em; margin: 0; text-transform: uppercase; text-wrap: balance; }}
h2 {{ font: 600 22px/1.2 var(--f-display); letter-spacing: .02em; text-transform: uppercase; margin: 0; text-wrap: balance; }}
h3 {{ font: 600 15px/1.3 var(--f-body); margin: 0; }}
p {{ margin: 0; max-width: 68ch; color: var(--ink-2); }}
p strong {{ color: var(--ink); font-weight: 600; }}
.lede {{ font-size: 17px; color: var(--ink); }}
.conds {{ display: flex; flex-wrap: wrap; gap: 6px; }}
.conds span {{ font: 12px/1 var(--f-data); padding: 6px 8px; border: 1px solid var(--rule); border-radius: 4px; color: var(--ink-2); background: var(--surface); }}
section {{ display: grid; gap: 14px; min-width: 0; }}
.tiles {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }}
.tile {{ background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 16px; display: grid; gap: 4px; }}
.big {{ font: 600 34px/1.05 var(--f-display); color: var(--ink); font-variant-numeric: tabular-nums; }}
.cap {{ font: 500 12px/1.3 var(--f-data); text-transform: uppercase; letter-spacing: .08em; color: var(--ink-2); }}
.sub {{ font-size: 13px; color: var(--muted); }}
.legend {{ display: flex; gap: 16px; flex-wrap: wrap; font: 13px/1 var(--f-data); color: var(--ink-2); }}
.legend i {{ display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }}
.chart {{ display: grid; gap: 14px; background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; padding: 16px; }}
.band {{ display: grid; grid-template-columns: 9.5em 1fr; gap: 12px; align-items: center; }}
.bl {{ font-size: 13px; color: var(--ink-2); }}
.bars {{ display: grid; gap: 2px; min-width: 0; background: linear-gradient(90deg, var(--grid) 1px, transparent 1px) 0 0 / 25% 100%; }}
.row {{ display: flex; align-items: center; gap: 8px; height: 20px; cursor: default; }}
.bar {{ display: block; height: 16px; border-radius: 0 4px 4px 0; flex: none; }}
.b-before {{ background: var(--before); }}
.b-after {{ background: var(--after); }}
.val {{ font: 12px/1 var(--f-data); color: var(--ink-2); white-space: nowrap; font-variant-numeric: tabular-nums; }}
.row:hover .bar, .row:focus .bar {{ filter: brightness(1.12); }}
.tip {{ position: fixed; pointer-events: none; background: var(--ink); color: var(--bg); font: 12px/1.4 var(--f-data); padding: 6px 8px; border-radius: 4px; max-width: 280px; z-index: 5; }}
.scroll {{ overflow-x: auto; background: var(--surface); border: 1px solid var(--rule); border-radius: 6px; }}
table {{ border-collapse: collapse; width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }}
th, td {{ text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--grid); vertical-align: top; white-space: nowrap; }}
thead th {{ font: 500 11px/1.3 var(--f-data); text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }}
tbody th {{ font-weight: 600; color: var(--ink); }}
td {{ font-family: var(--f-data); color: var(--ink-2); }}
td.chg {{ color: var(--ink); font-weight: 500; }}
td.note {{ font-family: var(--f-body); white-space: normal; min-width: 260px; }}
tr:last-child th, tr:last-child td {{ border-bottom: 0; }}
.cols {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; }}
ol, ul {{ margin: 0; padding-left: 1.2em; color: var(--ink-2); max-width: 68ch; display: grid; gap: 6px; }}
code {{ font: 13px var(--f-data); background: var(--surface); border: 1px solid var(--rule); border-radius: 3px; padding: 1px 5px; overflow-wrap: anywhere; }}
.callout {{ border-left: 3px solid var(--accent); padding: 4px 0 4px 14px; }}
footer {{ font: 12px/1.6 var(--f-data); color: var(--muted); }}
@media (max-width: 520px) {{ .band {{ grid-template-columns: 1fr; gap: 4px; }} .wrap {{ padding-inline: 16px; }} }}
</style>
<div class="wrap">
<header>
  <div class="eyebrow">Excessive Force · battery pass · measured {today}</div>
  <h1>Phone Power Benchmark</h1>
  <p class="lede">The same four scenes on Westminster, played through the old build (<code>{e(CB)}</code>) and the battery pass (<code>{e(CA)}</code>), {S['builds'][A]} times each, alternating between the builds.</p>
  <div class="conds"><span>Westminster</span><span>{e(meta['quality'])} tier (iPhone)</span><span>{meta['buffer'][0]}×{meta['buffer'][1]} px</span><span>shadow map {meta.get('shadowMapSize', 1024)}²</span><span>30 fps battery saver</span><span>iPhone agent</span><span>software renderer</span></div>
</header>

<section aria-labelledby="h-sum">
  <h2 id="h-sum">The result</h2>
  <div class="tiles">{tile_html}</div>
  <p>A typical fight is weighted as 30% quiet, 20% panning, 40% with the guns firing and 10% with stone falling. The other weightings below move the result by a few points, not its direction.</p>
</section>

<section aria-labelledby="h-tri">
  <h2 id="h-tri">Triangles drawn per frame</h2>
  <p>Every triangle in the view, plus the shadow pass when it runs, counted by the renderer across all passes of the frame. These counts are exact, so they need no statistics: the drop is the shadow pass being skipped.</p>
  <div class="legend"><span><i style="background:var(--before)"></i>{e(A)} ({e(CB)})</span><span><i style="background:var(--after)"></i>{e(B)} ({e(CA)})</span></div>
  {tri_chart}
</section>

<section aria-labelledby="h-sh">
  <h2 id="h-sh">Frames that redrew the shadow map</h2>
  <p>Before, every frame redrew it. After, it is redrawn every other frame while something that casts a shadow is moving, three times a second otherwise, and once when the camera crosses into a new 30-metre square.</p>
  {shadow_chart}
</section>

<section aria-labelledby="h-ms">
  <h2 id="h-ms">Draw time per frame</h2>
  <p>The draw timed to the finish of the GPU work. In the software renderer this is the vertex and fragment work done on the CPU, so it is a proxy for the GPU's work, not a phone's milliseconds. Hover a bar for the middle half of the frames.</p>
  {ms_chart}
</section>

<section aria-labelledby="h-tab">
  <h2 id="h-tab">Every scene, with the statistics</h2>
  <p>The 95% interval is for the change in median draw time, from a two-level bootstrap: whole runs resampled, then frames within each run, because frames from one page load are not independent. The p value is a Mann-Whitney test on the frames.</p>
  <div class="scroll"><table>
    <thead><tr><th>Scene</th><th>Frames ({e(A)}/{e(B)})</th><th>Median draw ms</th><th>Change</th><th>95% interval</th><th>p</th><th>Triangles a frame</th><th>Change</th><th>Shadow redraws</th><th>Draw calls</th></tr></thead>
    <tbody>{''.join(rows)}</tbody></table></div>
  <div class="cols">{''.join(f'<p><strong>{NAMES[s]}.</strong> {WHAT[s]}</p>' for s in SC)}</div>
</section>

<section aria-labelledby="h-mix">
  <h2 id="h-mix">How much the fight's mix matters</h2>
  <div class="scroll"><table>
    <thead><tr><th>Mix</th><th>Share of play time</th><th>Triangles a second at 30 fps</th><th>Triangles</th><th>Draw time</th><th>Shadow redraws</th></tr></thead>
    <tbody>{mix_rows}</tbody></table></div>
</section>

<section aria-labelledby="h-page">
  <h2 id="h-page">The rest of the page</h2>
  <div class="scroll"><table>
    <thead><tr><th>Check</th><th>{e(A)}</th><th>{e(B)}</th><th>Note</th></tr></thead>
    <tbody>{page_html}</tbody></table></div>
</section>

<section aria-labelledby="h-exp">
  <h2 id="h-exp">What to expect on a phone</h2>
  <p>A phone's battery drain during play is the screen, the CPU and the GPU together. This pass only reduces the GPU's share, by somewhere between the triangle cut ({r_tri*100:.0f}%) and the draw-time cut ({r_ms*100:.0f}%) in a typical fight. How much of the phone's power the GPU takes in this game cannot be measured from here, so the projection is given for three plausible shares:</p>
  <div class="scroll"><table>
    <thead><tr><th>If the GPU is</th><th>Expected play time per charge</th><th>Power drawn</th></tr></thead>
    <tbody>{proj_rows}</tbody></table></div>
  <p class="callout">Heat follows the same power. A phone throttles when it runs hot, so less sustained GPU work should also mean the game takes longer to get warm and holds 30 frames for longer before it drops. Moments with the most going on (a big collapse, aircraft overhead) save least, because that is when the shadows are being redrawn.</p>
</section>

<section aria-labelledby="h-track">
  <h2 id="h-track">How to track it from here</h2>
  <div class="cols">
    <div style="display:grid;gap:10px;min-width:0"><h3>On the bench</h3>
      <ol>
        <li>Run the old build on port 5178 and the new one on port 5177.</li>
        <li><code>PORTS=5178:before,5177:after RUNS=3 FRAMES=30 node tools/powerbench.mjs</code></li>
        <li><code>python3 tools/powerstats.py /tmp/out/powerbench --json stats.json</code></li>
        <li><code>python3 tools/powerreport.py stats.json report.html</code></li>
      </ol>
      <p>Each change to rendering is then measured the same way as this one, and the reports compare like for like.</p></div>
    <div style="display:grid;gap:10px;min-width:0"><h3>On a phone</h3>
      <ol>
        <li>Charge to 100%, brightness at half, Low Power Mode off, other apps closed.</li>
        <li>Play Westminster for 20 minutes with the battery saver on.</li>
        <li>Note the battery percentage at the end, and the minute the phone first feels warm.</li>
        <li>Repeat on another day and average the two. A single session varies too much to trust on its own.</li>
      </ol></div>
  </div>
</section>

<footer>Generated by tools/powerreport.py from tools/powerstats.py output · {S['builds'][A]}+{S['builds'][B]} page loads · {sum(sc[s][A]['n']+sc[s][B]['n'] for s in SC)} frames measured</footer>
</div>
<div class="tip" id="tip" hidden></div>
<script>
(() => {{
  const tip = document.getElementById('tip');
  const show = (el, x, y) => {{ tip.textContent = el.dataset.tip; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x + 12)) + 'px';
    tip.style.top = Math.max(8, y - h - 10) + 'px'; }};
  document.querySelectorAll('.row[data-tip]').forEach((el) => {{
    el.tabIndex = 0;
    el.addEventListener('pointermove', (ev) => show(el, ev.clientX, ev.clientY));
    el.addEventListener('pointerleave', () => {{ tip.hidden = true; }});
    el.addEventListener('focus', () => {{ const r = el.getBoundingClientRect(); show(el, r.left, r.top); }});
    el.addEventListener('blur', () => {{ tip.hidden = true; }});
  }});
}})();
</script>
"""
open(OUT, 'w').write(page)
print('wrote', OUT)
