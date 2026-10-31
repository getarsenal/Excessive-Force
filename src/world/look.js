import * as THREE from 'three';

/**
 * The look.
 *
 * One place for the art direction, so the sky, the fog, the water, the
 * lights and the grade agree with each other and with the climate the level
 * is in. Before this the sky was one hard-coded afternoon, the fog one beige,
 * the water one estuary, whatever the level said about its own haze, and the
 * three disagreed on every map that was not London.
 *
 * The direction is the one every good stylized game shares and the reference
 * boards show: warm light and cool, violet shadow, never grey; a saturated
 * sky the fog is cut from, so distance dissolves into the sky behind it; and
 * value structure on every box — tops light, undersides dark, edges caught —
 * so a wall of stones reads stone by stone. None of it is a pass: the lights
 * and fog are uniforms the scene already pays for, and the shading is a few
 * lines injected into the standard material, keyed so every material patched
 * this way shares one compiled program.
 */

// ── The palette, by climate ──────────────────────────────────────────────

const C = (h) => new THREE.Color(h);

/**
 * Sky stops (zenith, mid, horizon, ground), the fog cut from the horizon
 * and cooled, the sun, the hemisphere (sky fill over a violet shadow) and
 * the water. Everything downstream reads one of these.
 */
export const LOOKS = {
  // The indoor range: no sky, black air, the lamps' cool-white key from
  // above and a little warm bounce off the concrete.
  temperate: {
    zenith: 0x2559c2, mid: 0x6fa7e4, horizon: 0xd6e4f3, ground: 0x9aa4ac,
    fog: 0xb9cce4, sun: 0xffd9a3, hemiSky: 0x8fb4ff, hemiGround: 0x6e5f8a, ambient: 0x6f7298,
    shallow: 0x5f8a6a, deep: 0x2f5f66,
  },
  mediterranean: {
    zenith: 0x2358c6, mid: 0x68a4ea, horizon: 0xdbe6f4, ground: 0xb0a48e,
    fog: 0xbfd2ea, sun: 0xffdca8, hemiSky: 0x94b8ff, hemiGround: 0x74628a, ambient: 0x75769c,
    shallow: 0x3f8f90, deep: 0x1c5872,
  },
  alpine: {
    zenith: 0x2a68c8, mid: 0x7fb3ea, horizon: 0xdce6f1, ground: 0x9aa0a8,
    fog: 0xbdd0e8, sun: 0xffebd0, hemiSky: 0x9cbcff, hemiGround: 0x5a6a9a, ambient: 0x6e7aa0,
    shallow: 0x4e9aa4, deep: 0x255a78,
  },
  nordic: {
    zenith: 0x2a68c8, mid: 0x7eb0e6, horizon: 0xdee6ee, ground: 0x9ea2a6,
    fog: 0xcad5e2, sun: 0xffe6c4, hemiSky: 0x9ab8f6, hemiGround: 0x5c6a96, ambient: 0x6c789c,
    shallow: 0x4a8e92, deep: 0x224f6a,
  },
  subtropical: {
    zenith: 0x285ec6, mid: 0x70a8e8, horizon: 0xd9e5f3, ground: 0xa4a08f,
    fog: 0xbdd0e8, sun: 0xffdaa6, hemiSky: 0x92b6ff, hemiGround: 0x6c6090, ambient: 0x70749a,
    shallow: 0x3f9498, deep: 0x1b5674,
  },
  tropical: {
    zenith: 0x2156c4, mid: 0x6aa6ea, horizon: 0xd8e6f2, ground: 0x96a08a,
    fog: 0xbfd4e6, sun: 0xffe0b0, hemiSky: 0x96baff, hemiGround: 0x5e6a8e, ambient: 0x6a789a,
    shallow: 0x3f9ea4, deep: 0x1a5a78,
  },
  highland: {
    zenith: 0x2a68c8, mid: 0x80b4ea, horizon: 0xe4e8ee, ground: 0xa49c8c,
    fog: 0xcbd8e8, sun: 0xffebd0, hemiSky: 0x9cbcff, hemiGround: 0x5a6a9a, ambient: 0x6e7aa0,
    shallow: 0x4e9aa4, deep: 0x255a78,
  },
  // Dry air: a pale sky-grey haze, thinner than the others (`fogScale`). A
  // sand-coloured one the colour of the ground took the far desert into the
  // same beige and Giza's horizon was a wall a few hundred metres out.
  desert: {
    zenith: 0x1f55b8, mid: 0x66a2e8, horizon: 0xe6dfcc, ground: 0xc9ad7e,
    fog: 0xd3d9dd, fogScale: 0.8, sun: 0xffe2b8, hemiSky: 0x8fb4ff, hemiGround: 0x7a6a8a, ambient: 0x7a7496,
    shallow: 0x5a8a78, deep: 0x2e5f70,
  },
  steppe: {
    zenith: 0x2a5ec4, mid: 0x6ea8e6, horizon: 0xdde4ec, ground: 0xb0a88c,
    fog: 0xcdd4dc, sun: 0xffdca8, hemiSky: 0x92b6ff, hemiGround: 0x74668a, ambient: 0x76769a,
    shallow: 0x5a8e86, deep: 0x2c5f70,
  },
};

/** The hand-made levels' climates; the catalogue carries its own. */
const LEVEL_CLIME = {
  westminster: 'temperate', paris: 'temperate', cologne: 'temperate', towerbridge: 'temperate',
  atomium: 'temperate', budapest: 'temperate', sagrada: 'mediterranean', tutorial: 'desert',
  agra: 'subtropical', giza: 'desert', dubai: 'desert', kuwait: 'desert', karnak: 'desert', hassan: 'desert',
  chichen: 'tropical', rio: 'tropical', angkor: 'tropical', watarun: 'tropical', shwedagon: 'tropical',
  borobudur: 'tropical', tikal: 'tropical', teotihuacan: 'steppe',
  pisa: 'mediterranean', athens: 'mediterranean', istanbul: 'mediterranean', colosseum: 'mediterranean',
  florence: 'mediterranean', segovia: 'mediterranean', pena: 'mediterranean',
  sydney: 'subtropical', petronas: 'tropical', forbidden: 'subtropical', gyeongbok: 'subtropical',
  himeji: 'subtropical', tokyotower: 'subtropical', greatwall: 'steppe',
  moscow: 'nordic', edinburgh: 'nordic', neuschwanstein: 'alpine', montstmichel: 'temperate',
  potala: 'highland', machupicchu: 'highland',
};

/** The climate a level is in, by name (`temperate`, `tropical`, ...). */
export function climeOf(level) {
  return level.setting?.clime || LEVEL_CLIME[level.id] || 'temperate';
}

export function lookFor(level) {
  const id = climeOf(level);
  return LOOKS[id] || LOOKS.temperate;
}

// ── The scene ────────────────────────────────────────────────────────────

/**
 * Point the lights, the fog, the sky dome and the grade at one look. Called
 * before the sky is baked into the environment map, so metals reflect the
 * sky that is actually there.
 */
export function applyLook(engine, level, sky) {
  const L = lookFor(level);
  engine.sun.color.setHex(L.sun);
  engine.hemi.color.setHex(L.hemiSky);
  engine.hemi.groundColor.setHex(L.hemiGround);
  engine.hemi.intensity = L.hemiIntensity ?? 0.60;
  engine.ambient.color.setHex(L.ambient);
  engine.ambient.intensity = L.ambientIntensity ?? 0.22;
  // The environment material's stand-in for the sky the standard materials
  // take from the environment map (see `envStyle`): the same sky and ground.
  // Toward grey by two fifths: the environment map the standard material
  // lit its shaded sides from is the whole sky, cloud and haze and ground,
  // not the zenith's blue, and a wall in shade is a cool grey, not blue.
  const grey = (c) => { const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; return c.lerp(new THREE.Color(l, l, l), 0.4); };
  grey(ENV_UNIFORMS.uEnvSky.value.setHex(L.hemiSky));
  grey(ENV_UNIFORMS.uEnvGround.value.setHex(L.hemiGround));
  // The sun carries the contrast: less fill and exposure, so the lit side
  // is bright and the shadow side is colour rather than grey. A look may
  // say otherwise (the range, lit by lamps).
  engine.sun.intensity = L.sunIntensity ?? 3.9;
  engine.renderer.toneMappingExposure = L.exposure ?? 1.12;
  // The level's own haze keeps its density; the colour is the sky's, cooled,
  // so a far hill fades into the sky behind it and not into a beige wall.
  engine.scene.fog.color.setHex(L.fog);
  // A little thicker than the levels set it: that was tuned against a
  // beige fog that walled the view off, and sky-coloured air is aerial
  // perspective, the far country going blue the way it does from a hill.
  engine.scene.fog.density *= 1.6 * (L.fogScale ?? 1);
  const u = sky.material.uniforms;
  u.uZenith.value.setHex(L.zenith);
  u.uMid.value.setHex(L.mid);
  u.uHorizon.value.setHex(L.horizon);
  u.uGround.value.setHex(L.ground);
  // The grade: more colour than before, because the fill is now cool and
  // ACES still desaturates the middle.
  const g = engine.gradePass?.uniforms;
  if (g) { g.uSaturation.value = 1.12; g.uContrast.value = 1.07; g.uWarm.value = 0.025; }
  return L;
}

/** The water on the same sky and the same air as everything else. */
export function applyWaterLook(water, look, fog) {
  const u = water.material.uniforms;
  u.uSkyZenith.value.setHex(look.zenith);
  u.uSky.value.setHex(look.mid);
  u.uSkyHorizon.value.setHex(look.horizon);
  u.uShallow.value.setHex(look.shallow);
  u.uDeep.value.setHex(look.deep);
  u.uFogColor.value.copy(fog.color);
  u.uFogDensity.value = fog.density;
}

// ── The shading ──────────────────────────────────────────────────────────

// ── A floor under three's multi-scatter compensation ─────────────────
// r186 compensates the sun's specular for the energy a single-scatter GGX
// lobe loses, by 1 + F0 (1/Ess − 1), with Ess read from a small lookup
// texture by roughness and the cosine to the eye. Along the silhouette of a
// smooth-shaded model the interpolated normal leans away from the eye, the
// cosine is nought, the lookup lands on its last texel, and Ess comes back
// near nothing: one over nothing, and the pixel is pure white. Every gun,
// soldier and sandbag wore a row of white dots along its edges on a phone,
// bloomed into sparkles. The true Ess of a rough lobe at grazing is a
// third or more, so the floor changes nothing the eye can see elsewhere.
// Patched in the chunk, so every standard and physical material has it,
// stylized or not, from the first program compiled.
{
  const FROM = 'float EssMs = material.dfg.x + material.dfg.y;';
  const TO = 'float EssMs = max( material.dfg.x + material.dfg.y, 0.3 );';
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (chunk.includes(FROM)) THREE.ShaderChunk.lights_fragment_begin = chunk.replace(FROM, TO);
  else if (!chunk.includes(TO)) console.warn('[look] three changed its multi-scatter compensation; the silhouette guard did not apply');
  // The sky's reflection at the same silhouette: Fresnel goes to one as the
  // surface turns edge-on, so the last few degrees of every smooth form
  // reflect the whole sky and draw a white line round the model, which at a
  // bird's-eye distance is a row of white dots. Faded out over the last ten
  // degrees to the edge; a window or a river seen at any usable angle is
  // untouched.
  const RFROM = 'radiance += iblRadiance;';
  const RTO = 'radiance += iblRadiance * smoothstep( 0.0, 0.18, saturate( dot( geometryNormal, geometryViewDir ) ) );';
  const maps = THREE.ShaderChunk.lights_fragment_maps;
  if (maps.includes(RFROM)) THREE.ShaderChunk.lights_fragment_maps = maps.replace(RFROM, RTO);
  else if (!maps.includes(RTO)) console.warn('[look] three changed its environment lighting; the silhouette fade did not apply');
  // And the sun's own highlight there. At a grazing view the GGX visibility
  // term is 0.5 / (cos(light) x roughness): with the eye on the edge of a
  // smooth tube and the sun across it, that is a white pixel on every pixel
  // of the silhouette, and the gunner's own barrel under his eye wore a
  // dashed white line down both edges (tools/layshot.mjs). Faded over the
  // same last ten degrees as the sky's reflection.
  const SFROM = 'reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;';
  const STO = 'reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation * smoothstep( 0.0, 0.18, saturate( dot( geometryNormal, geometryViewDir ) ) );';
  const phys = THREE.ShaderChunk.lights_physical_pars_fragment;
  if (phys.includes(SFROM)) THREE.ShaderChunk.lights_physical_pars_fragment = phys.replace(SFROM, STO);
  else if (!phys.includes(STO)) console.warn('[look] three changed its direct specular; the silhouette fade did not apply');
}

const STYLE_UNIFORMS = {
  uWrap: { value: 0.32 },        // how far the sun reaches round a form
  uFaceTop: { value: 1.0 },      // value structure: tops…
  uFaceSide: { value: 0.90 },    // …sides…
  uFaceUnder: { value: 0.72 },   // …undersides
  uEdge: { value: 0.07 },        // the caught edge on a stone
};

const WRAP_FROM = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
const WRAP_TO = 'float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + uWrap ) / ( 1.0 + uWrap ) );';

/**
 * Stylize a MeshStandardMaterial: wrapped diffuse, so the shadow side of a
 * form carries its shape instead of one flat tone; value by face, so tops
 * are light, sides middling and undersides dark whatever the sun is doing,
 * the way Minecraft and Monument Valley shade a box; and, on the stones, a
 * lighter stroke along every edge, computed from the box's own local
 * position, so a wall reads stone by stone the way a painted plank does.
 *
 * Keyed, so everything patched this way shares a program per option set.
 */
export function stylize(material, { edges = false } = {}) {
  if (!material || !material.isMeshStandardMaterial || material.userData.stylized) return material;
  material.userData.stylized = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, STYLE_UNIFORMS);
    if (edges) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vStoneLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStoneLocal = position;');
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWrap; uniform float uFaceTop; uniform float uFaceSide; uniform float uFaceUnder; uniform float uEdge;
${edges ? 'varying vec3 vStoneLocal;' : ''}`)
      // Wrapped diffuse for the sun and every other direct light.
      .replace('#include <lights_physical_pars_fragment>',
        THREE.ShaderChunk.lights_physical_pars_fragment.replace(WRAP_FROM, WRAP_TO))
      // Value by face, and the edge, before the lighting reads the colour.
      .replace('#include <lights_physical_fragment>', `
{
  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float ny = dot(normal, upV);
  float faceK = ny >= 0.0 ? mix(uFaceSide, uFaceTop, ny) : mix(uFaceSide, uFaceUnder, -ny);
  diffuseColor.rgb *= faceK;
  ${edges ? `
  vec3 a = abs(vStoneLocal);
  float mx = max(a.x, max(a.y, a.z));
  float mn = min(a.x, min(a.y, a.z));
  float s = a.x + a.y + a.z - mx - mn;
  float fw = fwidth(s);
  float edge = smoothstep(0.43 - fw, 0.5 - fw * 0.5, s) * (1.0 - smoothstep(0.012, 0.045, fw));
  diffuseColor.rgb *= 1.0 + uEdge * edge;` : ''}
}
#include <lights_physical_fragment>`);
  };
  const key = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
  material.customProgramCacheKey = () => `${key}|style${edges ? 'E' : ''}`;
  material.needsUpdate = true;
  return material;
}

/** Stylize every standard material under a root that is not yet. */
export function stylizeTree(root) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m && m.isMeshStandardMaterial && !m.userData.stylized) { stylize(m); n++; }
  });
  return n;
}

// ── The environment's one material ───────────────────────────────────────

/**
 * Everything that is not the target, the guns or the aircraft — the ground,
 * the town, the trees, the works — is drawn by one cheap material: Lambert
 * (diffuse only: no specular lobe, no sky reflection, no roughness or metal
 * maps, no normal map), with the same wrapped sun and value by face as the
 * stylized standard material, so a form still carries its shape on the
 * shadow side and tops read light, sides middling, undersides dark.
 *
 * Two reasons, both the owner's (October 2026). The look: a clean low-poly
 * abstraction, the way Fortnite draws an island, where colour and light do
 * the work and nothing glints. And the phone: the environment is most of the
 * screen, and a physically based fragment with two or three texture reads
 * was most of what the phone spent; that budget goes to resolution instead.
 * The landmark keeps its standard material and its stone edges, so the
 * target stands apart from the world round it.
 *
 * `envizeTree(root)` swaps every standard material under a root for its
 * Lambert twin (one twin per source, so shared materials stay shared, and a
 * source's own shader patch — the town's burn channel — is carried across:
 * it hooks chunks Lambert has too) and styles every Lambert material there.
 */
const ENV_KEYS = ['name', 'color', 'map', 'vertexColors', 'emissive', 'emissiveMap', 'emissiveIntensity',
  'transparent', 'opacity', 'alphaTest', 'alphaMap', 'side', 'depthWrite', 'depthTest', 'colorWrite',
  'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'fog', 'flatShading', 'toneMapped',
  'visible', 'wireframe', 'aoMap', 'aoMapIntensity', 'lightMap', 'lightMapIntensity', 'blending'];
const envTwins = new WeakMap();

/**
 * The sky's fill. A standard material takes a soft sky light from the
 * environment map on its shadow side; Lambert takes none, and the first cut
 * of this drew the Corcovado's trees black on the slope away from the sun.
 * So the environment material adds the sky (above) and the ground's bounce
 * (below) by the surface's facing, at about the share the map gave.
 */
const ENV_UNIFORMS = {
  uEnvSky: { value: new THREE.Color(0x9cc0ea) },
  uEnvGround: { value: new THREE.Color(0x7a6642) },
  uEnvFill: { value: 0.45 },
  // The world's rim (the abstract world: terrain `_skirt`): from uRim0 to
  // uRim1 metres out from the landmark everything goes to the fog's colour,
  // whatever the camera's distance, so no view can find the edge.
  uRim0: { value: 1e9 },
  uRim1: { value: 2e9 },
};

/** Where the world ends (`ENV_UNIFORMS.uRim0/1`); a world without a rim never calls it. */
/** For the probes: the environment material's light, live. */
if (typeof window !== 'undefined') window.__envLight = ENV_UNIFORMS;

export function setWorldRim(r0, r1) {
  ENV_UNIFORMS.uRim0.value = r0;
  ENV_UNIFORMS.uRim1.value = r1;
}

export function envMaterial(src) {
  if (!src || !src.isMeshStandardMaterial) return src;
  // Glass and metal keep the standard material: what they look like is the
  // sky they reflect, and diffuse alone made a curtain wall a slab of flat
  // saturated blue in the gunner's eye. They are a few draws of the town.
  if (src.metalness >= 0.3) return src;
  let m = envTwins.get(src);
  if (m) return m;
  m = new THREE.MeshLambertMaterial();
  for (const k of ENV_KEYS) if (src[k] !== undefined) m[k] = src[k];
  m.userData = { ...src.userData };
  delete m.userData.stylized;
  if (Object.prototype.hasOwnProperty.call(src, 'onBeforeCompile')) m.onBeforeCompile = src.onBeforeCompile;
  if (Object.prototype.hasOwnProperty.call(src, 'customProgramCacheKey')) m.customProgramCacheKey = src.customProgramCacheKey;
  envTwins.set(src, m);
  return envStyle(m);
}

export function envStyle(material) {
  if (!material || !material.isMeshLambertMaterial || material.userData.envStyled) return material;
  material.userData.envStyled = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, STYLE_UNIFORMS, ENV_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vRimR;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRimR = length((modelMatrix * vec4(transformed, 1.0)).xz);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWrap; uniform float uFaceTop; uniform float uFaceSide; uniform float uFaceUnder;
uniform vec3 uEnvSky; uniform vec3 uEnvGround; uniform float uEnvFill;
uniform float uRim0; uniform float uRim1; varying float vRimR;`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>
#ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(uRim0, uRim1, vRimR));
#endif`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  vec3 upW = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float up = dot(normal, upW) * 0.5 + 0.5;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * mix(uEnvGround, uEnvSky, up) * uEnvFill;
}`)
      .replace('#include <lights_lambert_pars_fragment>',
        THREE.ShaderChunk.lights_lambert_pars_fragment.replace(WRAP_FROM, WRAP_TO))
      .replace('#include <lights_lambert_fragment>', `
{
  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  float ny = dot(normal, upV);
  diffuseColor.rgb *= ny >= 0.0 ? mix(uFaceSide, uFaceTop, ny) : mix(uFaceSide, uFaceUnder, -ny);
}
#include <lights_lambert_fragment>`);
  };
  const key = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
  material.customProgramCacheKey = () => `${key}|env`;
  material.needsUpdate = true;
  return material;
}

/** The environment's material on everything under `root`; returns how many meshes changed. */
export function envizeTree(root) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.material || o.userData.keepStandard) return;
    if (Array.isArray(o.material)) {
      o.material = o.material.map((m) => (m && m.isMeshStandardMaterial ? (n++, envMaterial(m)) : envStyle(m)));
    } else if (o.material.isMeshStandardMaterial) {
      o.material = envMaterial(o.material); n++;
    } else envStyle(o.material);
  });
  return n;
}
