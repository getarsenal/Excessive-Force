/**
 * The real city, on disk.
 *
 * `tools/bake_overture.py` writes one JSON per level: every building polygon
 * around the site in metres from the level origin, with the heights the survey
 * carries, and the street graph they stand on. This loads it. What gets built
 * out of it is `context.js`'s job, because a real city needs everything an
 * invented one needs — roads, parks, trees, street furniture, a railway — and
 * having two builders meant choosing between a place that was right and a place
 * that was alive.
 *
 * The reason this is footprints rather than Google's Photorealistic 3D Tiles:
 * those tiles are one fused photogrammetry mesh with no separable buildings and
 * no interiors — beautiful, and impossible to take apart. A footprint is a
 * polygon, and a polygon can be laid up out of stone by the same masonry
 * builder the tower uses. Keeping the city as geometry we generate is what
 * leaves the door open to making it destructible on the same terms.
 *
 * The palettes live here because both the facades and the roofs are read by the
 * generator, and a level with no baked file still has to be painted.
 */
export async function loadCity(levelId) {
  try {
    const res = await fetch(`assets/city/${levelId}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.buildings) || data.buildings.length === 0) return null;
    return data;
  } catch {
    return null; // not baked yet; the caller falls back
  }
}

/**
 * Facade and roof colours.
 *
 * Westminster is not beige. It is Portland stone next to London stock brick
 * next to red Victorian terracotta next to post-war concrete, under slate and
 * oxidised copper. The old palette was nine samples of the same warm grey,
 * which made a thousand buildings read as one undifferentiated mass — you
 * could not tell where one ended and the next began, which is most of why the
 * city looked flat.
 */
/*
 * Weighted, and quieter than it was.
 *
 * The first version of this list gave every colour on it the same chance, and
 * a third of them were brick. A third of a thousand buildings in saturated
 * terracotta, under a warm sun, through a grade that adds saturation again, is
 * not Westminster — it is a bowl of satsumas, and from the air the whole city
 * read as a toy. Brick and copper are *accents*: the mass of a British city is
 * stone, render and concrete, and what separates one building from the next is
 * mostly value, not hue.
 *
 * So the quiet tones are repeated and the loud ones are not, every entry is
 * pulled toward neutral from where it started, and the range runs from near
 * white to a dark brick — which is where the reading of one building against
 * another actually comes from.
 */
export const FACADE_PALETTE = [
  0xdcd3bf, 0xe6ddc9, 0xcdc3ae, 0xdcd3bf, 0xe6ddc9,   // Portland stone ×5
  0xb3b0a6, 0xa3a199, 0xb3b0a6, 0x9b9a93,             // concrete ×4
  0xc8bd9d, 0xbdb192, 0xc8bd9d,                       // render ×3
  0xa87a5e, 0x9c6d53,                                 // London stock ×2
  0x8e6150,                                           // darker brick ×1
];
// Muted at source: the grade adds saturation globally, so a palette that
// already reads correctly on its own comes out as poster paint on screen.
export const ROOF_PALETTE = [
  0x5e6773, 0x525a66, 0x6b7381, 0x59616d, 0x646c78,   // slate ×5
  0x4a4f57, 0x53585f,                                 // lead and bitumen ×2
  0x7a6154, 0x856a5b,                                 // clay tile ×2
  0x4f6b63,                                           // oxidised copper ×1
];
