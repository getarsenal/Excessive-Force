#!/usr/bin/env python3
"""
The world, for the campaign map.

Natural Earth's 1:110m country outlines, cut down to what a menu needs: a name,
an ISO code and the rings, with nothing else. Natural Earth is public domain,
which is the reason it is this and not a picture of a map — an image would mean
hand-cutting a mask for every country before one of them could be set on fire,
and these are the real borders, so the burn follows a coastline because it *is*
the coastline.

Coordinates go to a tenth of a degree. At the width this map is ever drawn that
is a quarter of a pixel, and it takes the file from 840 kB to 120.

    python3 tools/make_world.py        # writes public/assets/world.json

Source: https://github.com/nvkelso/natural-earth-vector
        geojson/ne_110m_admin_0_countries.geojson
"""
import json
import pathlib
import urllib.request

URL = ('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/'
       'master/geojson/ne_110m_admin_0_countries.geojson')
OUT = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'world.json'
DP = 1


def ring(points):
    """Round a ring and drop the points rounding has made duplicates."""
    out = []
    for x, y in points:
        p = [round(x, DP), round(y, DP)]
        if out and out[-1] == p:
            continue
        out.append(p)
    # A ring of two points is a line and fills nothing.
    return out if len(out) > 3 else None


def polygon(rings):
    kept = [r for r in (ring(x) for x in rings) if r]
    return kept or None


def main():
    with urllib.request.urlopen(URL) as res:
        src = json.load(res)

    out = []
    for f in src['features']:
        pr = f['properties']
        name = pr.get('NAME')
        # Antarctica is a third of the map's height and nobody is shelling it.
        if name == 'Antarctica':
            continue
        geo = f['geometry']
        multi = geo['type'] == 'MultiPolygon'
        polys = geo['coordinates'] if multi else [geo['coordinates']]
        kept = [p for p in (polygon(x) for x in polys) if p]
        if not kept:
            continue
        # ADM0_A3, not ISO_A3.
        #
        # Natural Earth leaves ISO_A3 as the string "-99" for a handful of
        # countries — France and Norway among them, because of how their
        # overseas parts are coded — and the campaign looks its theatres up by
        # this key. France simply was not in the map: it drew as anonymous land,
        # took no pin highlight, and the fire that was supposed to burn it out
        # found nothing to burn and finished in the same frame it started.
        # ADM0_A3 is populated for every feature.
        out.append({'n': name, 'i': pr.get('ADM0_A3') or pr.get('ISO_A3'), 'p': kept})

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print(f'{OUT}: {len(out)} countries, {OUT.stat().st_size // 1024} kB')


if __name__ == '__main__':
    main()
