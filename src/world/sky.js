import * as THREE from 'three';

/**
 * Sky dome and water.
 *
 * A hand-written gradient dome rather than a full atmospheric scattering model:
 * the light is fixed at a clear late afternoon, so a physically derived sky
 * would cost more and look the same. What it does carry is a sun disc and
 * horizon haze the fog colour is matched to, which is what keeps distant
 * geometry from looking pasted on.
 */

const SKY_VERT = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const SKY_FRAG = /* glsl */`
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  varying vec3 vWorld;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    return vnoise(p) * 0.6 + vnoise(p * 2.1 + 5.2) * 0.3 + vnoise(p * 4.3) * 0.1;
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 dir = normalize(vWorld);
    float h = dir.y;

    // Three-stop gradient. A two-stop sky always reads as a flat wash; the
    // middle band is where the depth in a real sky actually lives.
    float t = pow(clamp(h, 0.0, 1.0), 0.44);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.45, t));
    col = mix(col, uZenith, smoothstep(0.35, 1.0, t));

    // Below the horizon fade to a warm ground haze rather than hard black.
    col = mix(col, uGround, clamp(-h * 4.0, 0.0, 1.0));

    // Cloud. Three octaves of a cheap hash noise projected onto the dome,
    // drifting slowly. An empty gradient sky is the one part of the frame with
    // nothing in it at all, and at this camera angle it is a third of the
    // picture — a little structure up there is worth a great deal.
    if (h > 0.02) {
      vec2 cp = dir.xz / max(h + 0.22, 0.06) * 0.55 + vec2(uTime * 0.0035, 0.0);
      float f = fbm(cp) * 0.55 + fbm(cp * 2.3 + 17.0) * 0.3 + fbm(cp * 5.1) * 0.15;
      float cover = smoothstep(0.52, 0.78, f) * smoothstep(0.02, 0.22, h);
      // Lit from the sun's side, grey underneath.
      float lit = 0.55 + 0.45 * max(dot(normalize(uSunDir), dir), 0.0);
      col = mix(col, mix(vec3(0.62, 0.65, 0.70), vec3(1.02, 0.99, 0.94), lit),
                cover * 0.88);
    }

    float sd = max(dot(dir, normalize(uSunDir)), 0.0);
    // Disc, then forward scatter, then a broad warm bias across that half of
    // the sky — which is what stops the dome looking like a colour ramp.
    col += uSunColor * pow(sd, 900.0) * 16.0;
    col += uSunColor * pow(sd, 26.0) * 0.30;
    col += uSunColor * pow(sd, 4.0) * 0.075;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createSky(sunDirection) {
  const geo = new THREE.SphereGeometry(4000, 48, 28);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(0x2a62bb) },
      uMid: { value: new THREE.Color(0x84b2df) },
      uHorizon: { value: new THREE.Color(0xf2e2c6) },
      uGround: { value: new THREE.Color(0xa8977c) },
      uSunDir: { value: sunDirection.clone().normalize() },
      uSunColor: { value: new THREE.Color(0xffc788) },
      uTime: { value: 0 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}

const WATER_VERT = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uTime;
  attribute float aDepth;
  varying vec3 vWorld;
  varying float vWave;
  varying float vDepth;

  float wave(vec2 p, vec2 dir, float freq, float speed, float t) {
    return sin(dot(p, dir) * freq + t * speed);
  }

  void main() {
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vDepth = aDepth;

    // Three crossing wave trains, damped in the shallows so the surface calms
    // as it meets the bank instead of chopping through it.
    float calm = smoothstep(0.0, 1.6, aDepth);
    float w = 0.0;
    w += wave(world.xz, normalize(vec2(1.0, 0.3)), 0.085, 1.4, uTime) * 0.22;
    w += wave(world.xz, normalize(vec2(-0.4, 1.0)), 0.13, 1.9, uTime) * 0.13;
    w += wave(world.xz, normalize(vec2(0.7, -0.8)), 0.27, 2.6, uTime) * 0.06;
    // Flattened with distance from the eye.
    //
    // The swell has a wavelength of twenty to seventy metres, and out past the
    // playfield the sheet is a coarse strip with vertices further apart than
    // that: displacing those samples does not make waves, it folds the ribbon
    // into a chevron the shortest of which is several hundred metres across.
    // Nobody is ever within a kilometre of that water, so it costs nothing to
    // let the surface go flat out there and keep the swell where it reads.
    float near = 1.0 - smoothstep(320.0, 900.0, distance(cameraPosition, world));
    w *= calm * near;
    vWave = w;

    vec3 p = position;
    p.y += w;
    vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const WATER_FRAG = /* glsl */`
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSkyZenith;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorld;
  varying float vWave;
  varying float vDepth;

  void main() {
    #include <logdepthbuf_fragment>
    vec3 viewDir = normalize(cameraPosition - vWorld);

    // Slope of the wave field gives a cheap normal.
    //
    // The last three terms are ripple rather than wave, and they are the
    // difference between water and corrugated iron. Three sine trains alone
    // have harmonically related wavelengths of twenty to seventy metres, so
    // their slopes line up and the broad specular lobe paints them as regular
    // diagonal bands right across the channel. These are short, steep, and
    // deliberately at irrational-ish ratios to the swell and to each other, so
    // the crests never queue up and the glare breaks into glitter.
    // Ripple fades out with distance, and has to.
    //
    // These wavelengths are a metre or two. Past a few hundred metres one pixel
    // covers several of them, the cosines alias against the pixel grid, and the
    // far half of the river fills with a crawling moiré that is far worse than
    // the banding the ripple was added to fix. Fading the detail term out is
    // the standard answer and it costs one smoothstep: near water glitters,
    // distant water is smooth swell, and there is no distance at which the
    // shader is being asked to resolve something it cannot.
    float fade = 1.0 - smoothstep(70.0, 380.0, length(cameraPosition - vWorld));
    float dx = cos(vWorld.x * 0.085 + uTime * 1.4) * 0.022
             + cos(vWorld.x * 0.27 + uTime * 2.6) * 0.019
             + cos(vWorld.x * 0.62 + vWorld.z * 0.4 + uTime * 3.4) * 0.012
             + fade * (cos(vWorld.x * 1.37 - vWorld.z * 0.91 + uTime * 5.1) * 0.030
                     + cos(vWorld.x * 2.63 + vWorld.z * 1.77 - uTime * 6.7) * 0.021
                     + cos(vWorld.z * 3.91 - vWorld.x * 0.53 + uTime * 8.3) * 0.014);
    float dz = cos(vWorld.z * 0.13 + uTime * 1.9) * 0.020
             + cos(vWorld.z * 0.27 - uTime * 2.6) * 0.016
             + cos(vWorld.z * 0.58 - vWorld.x * 0.33 + uTime * 3.1) * 0.011
             + fade * (cos(vWorld.z * 1.19 + vWorld.x * 1.07 - uTime * 4.9) * 0.031
                     + cos(vWorld.z * 2.41 - vWorld.x * 1.63 + uTime * 7.1) * 0.020
                     + cos(vWorld.x * 3.67 + vWorld.z * 0.47 - uTime * 8.9) * 0.013);
    vec3 n = normalize(vec3(-dx, 1.0, -dz));

    // Depth tint: a river is green-brown where it is shallow and much darker
    // where it is deep. Driving it from the baked bed depth is what makes the
    // channel read as a channel rather than a painted strip.
    //
    // The carve is only about five metres, so normalising over that whole range
    // and then squaring it left almost the entire surface at the shallow
    // colour — a thin olive strip that read as grass, not as the Thames. Most
    // of the channel should be the deep tone; only the margins are shallow.
    float d = clamp(vDepth / 2.6, 0.0, 1.0);
    vec3 col = mix(uShallow, uDeep, d);

    // Reflect the *sky*, not a single colour.
    //
    // A flat reflection tint is why the river read as one band of cyan poster
    // paint from end to end: real water is a mirror, so what is in it changes
    // across the frame — warm and bright where it is reflecting the low sun,
    // deep blue where it is reflecting the zenith behind you. Bouncing the view
    // ray off the wave normal and shading it against the same three-stop
    // gradient the dome uses costs three mixes and gives the whole channel a
    // gradient along its length that follows the light.
    vec3 refl = reflect(-viewDir, n);
    float up = clamp(refl.y, 0.0, 1.0);
    // Grazing reflections keep some of the sky's blue. Taken straight, a
    // reflection that skims the horizon is the horizon's own beige haze, so
    // from a phone's low camera the far reach of the river was the colour of
    // the banks either side of it and read as sand: the water looked as if it
    // stopped a kilometre out and started again further on.
    vec3 skyCol = mix(uSkyHorizon, uSky, smoothstep(-0.18, 0.32, up));
    skyCol = mix(skyCol, uSkyZenith, smoothstep(0.28, 0.85, up));
    // Forward scatter: the half of the sky around the sun is much brighter than
    // the rest, and on water that is the difference between a river and a strip.
    float toSun = max(dot(refl, normalize(uSunDir)), 0.0);
    skyCol += uSunColor * pow(toSun, 7.0) * 0.42;

    float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 4.0);
    col = mix(col, skyCol, 0.12 + fres * 0.62);

    // Sun glitter, in two lobes: a tight one for the individual sparks and a
    // broad one for the glare path they sit in. Kept below the bloom threshold
    // — a hard specular on a wave field this smooth lands as a handful of very
    // bright pixels, and bloom then spreads each into a blob the size of a barge.
    vec3 h = normalize(normalize(uSunDir) + viewDir);
    float spec = max(dot(n, h), 0.0);
    col += uSunColor * pow(spec, 260.0) * 0.60;
    col += uSunColor * pow(spec, 18.0) * 0.085;

    // Foam where the water meets the bank, and a hint of it on the crests.
    //
    // The crest term has to be tiny and tightly thresholded. The wave field is
    // three sines with wavelengths of twenty to seventy metres, so a generous
    // threshold paints white over patches the size of a city block — from the
    // air that reads as ice floes, not chop.
    float shore = 1.0 - smoothstep(0.05, 0.9, vDepth);
    float crest = smoothstep(0.26, 0.35, vWave) * smoothstep(0.4, 1.6, vDepth);
    col += vec3(0.82, 0.87, 0.88) * (shore * 0.22 + crest * 0.025);

    // Fade out over the last few centimetres of depth so the waterline is a
    // soft edge on the sand rather than a hard polygon boundary.
    float alpha = smoothstep(0.0, 0.55, vDepth) * 0.94 + 0.06;

    // Haze, the same exponential-squared falloff the scene fog uses.
    //
    // This is a hand-written shader, so it never got the fog three.js injects
    // into a standard material — which did not matter while the river ended at
    // the edge of the data. Now that it runs to the horizon, the far reach was
    // the one thing in the frame at six kilometres that was not fading into the
    // haze: a bright cyan ribbon laid over a landscape that had long since gone
    // to flat grey. Fogging it puts the river back in the same air as
    // everything else.
    float fogDist = length(cameraPosition - vWorld) * uFogDensity;
    float fog = clamp(1.0 - exp(-fogDist * fogDist), 0.0, 1.0);
    // Water in haze stays a shade cooler than the land in the same haze — it
    // is reflecting sky through it — so the middle distance of the river keeps
    // reading as river. Right at the horizon it meets the scene fog exactly,
    // or the channel would end in a blue line where the world stops.
    vec3 fogCol = mix(mix(uFogColor, uSky, 0.2), uFogColor, smoothstep(0.7, 1.0, fog));
    col = mix(col, fogCol, fog);
    gl_FragColor = vec4(col, alpha);
  }
`;

/**
 * Water, built only where there is water.
 *
 * The old version was a single plane across the entire map at the river's
 * surface height. Anywhere the DEM dipped below that level — and Westminster's
 * DEM dips nearly ten metres below it in places — a sheet of grey appeared on
 * dry land, which is the "terrain and water overlap" you could see from the
 * opening camera position.
 *
 * So: walk the baked river mask and emit geometry for the wet cells only, one
 * ring of cells wide past the shoreline so the surface tucks under the bank
 * rather than ending in mid-air. Each vertex carries the depth of the bed
 * beneath it, which the shader uses for the channel's colour gradient and for
 * the foam at the waterline.
 *
 * @param {import('./terrain.js').Terrain} terrain
 */
export function createWater(terrain, sunDirection, quality) {
  const n = terrain.size;
  const level = terrain.waterLevel;
  const step = (quality && quality.name === 'low') ? 3 : 2;
  const cell = (terrain.span * 2) / (n - 1);

  // Grid of sample points at the decimated resolution.
  const gn = Math.floor((n - 1) / step) + 1;
  const wet = new Uint8Array(gn * gn);
  for (let gz = 0; gz < gn; gz++) {
    for (let gx = 0; gx < gn; gx++) {
      const i = Math.min(n - 1, gz * step) * n + Math.min(n - 1, gx * step);
      // A point counts as wet if the mask says river, or the bed there is
      // below the surface and the mask says river anywhere nearby.
      wet[gz * gn + gx] = terrain.mask[i * 3] > 0.35 ? 1 : 0;
    }
  }
  // Dilate by one so the sheet runs under the bank.
  const grown = wet.slice();
  for (let gz = 0; gz < gn; gz++) {
    for (let gx = 0; gx < gn; gx++) {
      if (wet[gz * gn + gx]) continue;
      let near = 0;
      for (let dz = -1; dz <= 1 && !near; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const z2 = gz + dz, x2 = gx + dx;
          if (z2 < 0 || x2 < 0 || z2 >= gn || x2 >= gn) continue;
          if (wet[z2 * gn + x2]) { near = 1; break; }
        }
      }
      if (near) grown[gz * gn + gx] = 1;
    }
  }

  const worldX = (gx) => -terrain.span + gx * step * cell;
  const worldZ = (gz) => terrain.span - gz * step * cell;

  const vIndex = new Int32Array(gn * gn).fill(-1);
  const pos = [];
  const depth = [];
  const index = [];

  const vertexAt = (gx, gz) => {
    const k = gz * gn + gx;
    if (vIndex[k] >= 0) return vIndex[k];
    const x = worldX(gx), z = worldZ(gz);
    const bed = terrain.heightAt(x, z);
    const id = pos.length / 3;
    pos.push(x, level, z);
    depth.push(Math.max(0, level - bed));
    vIndex[k] = id;
    return id;
  };

  for (let gz = 0; gz < gn - 1; gz++) {
    for (let gx = 0; gx < gn - 1; gx++) {
      const anyWet = grown[gz * gn + gx] || grown[gz * gn + gx + 1]
        || grown[(gz + 1) * gn + gx] || grown[(gz + 1) * gn + gx + 1];
      if (!anyWet) continue;
      const a = vertexAt(gx, gz);
      const b = vertexAt(gx + 1, gz);
      const c = vertexAt(gx + 1, gz + 1);
      const d = vertexAt(gx, gz + 1);
      // Wind anticlockwise seen from above. The grid runs +x with gx but −z
      // with gz, which flips the handedness against the obvious ordering: the
      // natural-looking (a, d, c) (a, c, b) faces *downward*, and the whole
      // sheet is back-face culled and silently invisible.
      index.push(a, c, d, a, b, c);
    }
  }

  // A harbour does not stop where the elevation data does either, and it does
  // not leave through a gap: it *is* the edge. So on a map whose boundary is
  // mostly wet, the sheet gets a ring round the whole playfield, out to where
  // the surround ends — open water to the horizon instead of three rivers
  // running off into farmland, which is what Sydney had.
  //
  // A ring and not a plane: a plane at the waterline over the whole map would
  // be drawn across the point the Opera House stands on.
  // ── The water that is really out there.
  //
  // Everything above is the playfield's own mask, and past the boundary the
  // sheet used to have two options: a ring of open sea, if the edge of the map
  // happened to be wet, or nothing at all. Rio got nothing at all, so the most
  // photographed bay on earth was a grass field — the level is the summit of
  // the Corcovado, the Lagoa is two kilometres away and Botafogo three, and
  // both are below you and in front of you the whole time you are playing.
  //
  // With a far mask baked, the distant water is drawn where the survey says it
  // is. It sits at the level's own waterline rather than at true sea level,
  // which for a mountain map is sixty-odd metres out and invisible from seven
  // hundred metres up; the alternative is a second waterline in the same
  // picture, which is not.
  if (terrain.farMask) {
    const S = terrain.span, F = terrain.farSpan;
    const DIV = 150;
    const cellF = (F * 2) / DIV;
    const fx = (i) => -F + i * cellF;
    const fz = (j) => F - j * cellF;
    const fIndex = new Int32Array((DIV + 1) * (DIV + 1)).fill(-1);
    const fVert = (i, j) => {
      const k = j * (DIV + 1) + i;
      if (fIndex[k] >= 0) return fIndex[k];
      const id = pos.length / 3;
      pos.push(fx(i), level, fz(j));
      depth.push(40);
      fIndex[k] = id;
      return id;
    };
    for (let j = 0; j < DIV; j++) {
      for (let i = 0; i < DIV; i++) {
        const x0 = fx(i), x1 = fx(i + 1), z0 = fz(j), z1 = fz(j + 1);
        // The playfield draws its own, at its own resolution and with its own
        // bed under it; a coarse quad laid across it would cover the map.
        if (Math.max(x0, x1) > -S && Math.min(x0, x1) < S
          && Math.max(z0, z1) > -S && Math.min(z0, z1) < S) continue;
        let wetc = 0;
        if (terrain._farWet(x0, z0)) wetc++;
        if (terrain._farWet(x1, z0)) wetc++;
        if (terrain._farWet(x1, z1)) wetc++;
        if (terrain._farWet(x0, z1)) wetc++;
        if (!wetc) continue;
        const a = fVert(i, j), b = fVert(i + 1, j);
        const c = fVert(i + 1, j + 1), d = fVert(i, j + 1);
        index.push(a, c, d, a, b, c);
      }
    }
  }

  if (terrain.openSea) {
    const S = terrain.span, OUT = S * 7;
    const DIV = 26;
    const ringAt = (u, r) => {
      // Walk the square ring of radius r, u in [0, 4).
      const side = Math.floor(u) % 4, f = u - Math.floor(u);
      if (side === 0) return [-r + f * 2 * r, -r];
      if (side === 1) return [r, -r + f * 2 * r];
      if (side === 2) return [r - f * 2 * r, r];
      return [-r, r - f * 2 * r];
    };
    const base = pos.length / 3;
    for (let k = 0; k <= DIV * 4; k++) {
      const u = (k % (DIV * 4)) / DIV;
      for (const r of [S, OUT]) {
        const [x, z] = ringAt(u, r);
        pos.push(x, level, z);
        depth.push(r > S ? 40 : Math.max(0, level - terrain.heightAt(x, z)));
      }
    }
    for (let k = 0; k < DIV * 4; k++) {
      const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3;
      index.push(a, c, d, a, d, b);
    }
  }

  // The river does not stop where the elevation data does.
  //
  // Everything above is built from the DEM's wet mask, so the sheet ends in two
  // square ends at the boundary of a 1.8 km box, and from any height the Thames
  // read as a lake. A river comes from somewhere and goes somewhere: the ground
  // outside the playfield already has the channel cut into it (`riverTails`
  // drives both), so all that is left is to run the water down it.
  //
  // Each tail is a quad strip five columns wide, laid flat at the waterline,
  // with the depth attribute falling off towards the banks — so the shader's
  // own shoreline treatment draws the edge and the strip fades into the bank
  // instead of ending on a hard line.
  {
    const COLS = [-1, -0.55, 0, 0.55, 1];
    // A harbour has no tails: the ring above already covers everything out
    // there, and laying strips down it as well drew three rivers across it.
    for (const tail of terrain.openSea ? [] : terrain.riverTails()) {
      if (tail.length < 2) continue;
      // The tail's first point is inside the playfield (see `riverTails`), so
      // the strip overlaps the playfield's own sheet over the last stretch
      // before the boundary. That first row is sunk eight metres, under the
      // riverbed: the strip rises out of the bed somewhere inside the map and
      // is at the waterline by the boundary, so the join is a line under the
      // water rather than a second sheet laid over the first with its own
      // shoreline foam drawn across the river.
      const line = tail;

      let prev = null;
      for (let i = 0; i < line.length; i++) {
        const p = line[i];
        const ahead = line[Math.min(line.length - 1, i + 1)];
        const back = line[Math.max(0, i - 1)];
        let tx = ahead.x - back.x, tz = ahead.z - back.z;
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl; tz /= tl;
        const nx = -tz, nz = tx;
        const row = [];
        for (const u of COLS) {
          // A touch wider than the flat bed, so the waterline sits on the bank
          // rather than leaving a ring of bed below the surface and dry.
          const w = p.half * 1.05 * u;
          row.push(pos.length / 3);
          pos.push(p.x + nx * w, p.inside ? level - 8 : level, p.z + nz * w);
          // Dredged down the middle, shallowing to the bank. The channel bed
          // out here is flat, so this is a painted gradient rather than a
          // measured one — but it is the gradient a river actually has.
          depth.push(3.4 * (1 - u * u * 0.92));
        }
        if (prev) {
          for (let k = 0; k < COLS.length - 1; k++) {
            index.push(prev[k], row[k + 1], row[k]);
            index.push(prev[k], prev[k + 1], row[k + 1]);
          }
        }
        prev = row;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  if (pos.length === 0) {
    // Landlocked level: hand back an empty object so callers need no branch.
    const empty = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
    empty.material.uniforms = { uTime: { value: 0 } };
    empty.visible = false;
    empty.userData.quads = 0;
    return empty;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(depth), 1));
  geo.setIndex(pos.length / 3 > 65535
    ? new THREE.BufferAttribute(new Uint32Array(index), 1)
    : new THREE.BufferAttribute(new Uint16Array(index), 1));
  geo.computeBoundingSphere();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      // The Thames is a tidal estuary: green-brown in the shallows, and much
      // deeper and colder in the dredged channel.
      // Pitched a little bright, because these go through ACES tone mapping on
      // the way to the screen: a colour that looks right as a swatch comes out
      // of the grade darker and flatter than it went in.
      // Balanced across the channels on purpose. A river colour with almost no
      // red in it survives the grade's saturation and contrast as electric
      // cyan — the Thames is a grey-green estuary, not a swimming pool.
      uShallow: { value: new THREE.Color(0x74804c) },
      uDeep: { value: new THREE.Color(0x415f57) },
      // The same three stops the dome is built from, so what the river
      // reflects and what is actually above it agree.
      uSky: { value: new THREE.Color(0x84b2df) },
      uSkyHorizon: { value: new THREE.Color(0xe8dcc6) },
      uSkyZenith: { value: new THREE.Color(0x2f68bd) },
      uSunDir: { value: sunDirection.clone().normalize() },
      uSunColor: { value: new THREE.Color(0xffe0b0) },
      // Matched to the scene fog in `engine.js`: this shader has to apply it
      // itself, so the two have to be kept in step by hand.
      uFogColor: { value: new THREE.Color(0xd8d3c4) },
      uFogDensity: { value: 0.00026 },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  mesh.userData.quads = index.length / 6;
  return mesh;
}
