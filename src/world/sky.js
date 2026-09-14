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
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */`
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  varying vec3 vWorld;

  void main() {
    vec3 dir = normalize(vWorld);
    float h = dir.y;

    // Three-stop gradient. A two-stop sky always reads as a flat wash; the
    // middle band is where the depth in a real sky actually lives.
    float t = pow(clamp(h, 0.0, 1.0), 0.44);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.45, t));
    col = mix(col, uZenith, smoothstep(0.35, 1.0, t));

    // Below the horizon fade to a warm ground haze rather than hard black.
    col = mix(col, uGround, clamp(-h * 4.0, 0.0, 1.0));

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
      uZenith: { value: new THREE.Color(0x2f6fc4) },
      uMid: { value: new THREE.Color(0x77a8dd) },
      uHorizon: { value: new THREE.Color(0xdfe3dc) },
      uGround: { value: new THREE.Color(0x9c8f78) },
      uSunDir: { value: sunDirection.clone().normalize() },
      uSunColor: { value: new THREE.Color(0xffd5a0) },
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
    w *= calm;
    vWave = w;

    vec3 p = position;
    p.y += w;
    vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const WATER_FRAG = /* glsl */`
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uTime;
  varying vec3 vWorld;
  varying float vWave;
  varying float vDepth;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);

    // Slope of the wave field gives a cheap normal.
    float dx = cos(vWorld.x * 0.085 + uTime * 1.4) * 0.022
             + cos(vWorld.x * 0.27 + uTime * 2.6) * 0.019
             + cos(vWorld.x * 0.62 + vWorld.z * 0.4 + uTime * 3.4) * 0.012;
    float dz = cos(vWorld.z * 0.13 + uTime * 1.9) * 0.020
             + cos(vWorld.z * 0.27 - uTime * 2.6) * 0.016
             + cos(vWorld.z * 0.58 - vWorld.x * 0.33 + uTime * 3.1) * 0.011;
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

    float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
    col = mix(col, uSky, 0.09 + fres * 0.46);

    // Sun glitter. Kept below the bloom threshold: a specular lobe on a wave
    // field this smooth lands as a handful of very bright pixels, and bloom
    // then spreads each one into a soft white blob the size of a barge.
    vec3 h = normalize(normalize(uSunDir) + viewDir);
    col += uSunColor * pow(max(dot(n, h), 0.0), 220.0) * 0.55;
    col += uSunColor * pow(max(dot(n, h), 0.0), 24.0) * 0.05;

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
      uSky: { value: new THREE.Color(0x93aec4) },
      uSunDir: { value: sunDirection.clone().normalize() },
      uSunColor: { value: new THREE.Color(0xffe0b0) },
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
