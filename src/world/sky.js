import * as THREE from 'three';

/**
 * Sky dome and water.
 *
 * A hand-written gradient dome rather than a full atmospheric scattering model:
 * the light in this level is fixed at a late London afternoon, so a physically
 * derived sky would cost more and look the same. What it does carry is a sun
 * disc and horizon haze that the fog colour is matched to, which is what keeps
 * distant geometry from looking pasted on.
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
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  varying vec3 vWorld;

  void main() {
    vec3 dir = normalize(vWorld);
    float h = dir.y;

    // Sky gradient, biased so the horizon band is thin and bright.
    float t = pow(clamp(h, 0.0, 1.0), 0.42);
    vec3 col = mix(uHorizon, uZenith, t);

    // Below the horizon fade to a dull ground haze rather than hard black.
    col = mix(col, uGround, clamp(-h * 4.0, 0.0, 1.0));

    float sd = max(dot(dir, normalize(uSunDir)), 0.0);
    // Disc plus a wide forward-scatter halo.
    col += uSunColor * pow(sd, 900.0) * 14.0;
    col += uSunColor * pow(sd, 30.0) * 0.22;
    col += uSunColor * pow(sd, 6.0) * 0.035;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createSky(sunDirection) {
  const geo = new THREE.SphereGeometry(4000, 32, 20);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(0x3e6ea8) },
      uHorizon: { value: new THREE.Color(0xc4cfd6) },
      uGround: { value: new THREE.Color(0x8a8578) },
      uSunDir: { value: sunDirection.clone().normalize() },
      uSunColor: { value: new THREE.Color(0xffd9a0) },
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
  varying vec3 vWorld;
  varying vec2 vUv;
  varying float vWave;

  float wave(vec2 p, vec2 dir, float freq, float speed, float t) {
    return sin(dot(p, dir) * freq + t * speed);
  }

  void main() {
    vUv = uv;
    vec3 p = position;
    vec3 world = (modelMatrix * vec4(p, 1.0)).xyz;

    // Three crossing wave trains; the Thames is tidal and choppy, not glassy.
    float w = 0.0;
    w += wave(world.xz, normalize(vec2(1.0, 0.3)), 0.085, 1.4, uTime) * 0.22;
    w += wave(world.xz, normalize(vec2(-0.4, 1.0)), 0.13, 1.9, uTime) * 0.13;
    w += wave(world.xz, normalize(vec2(0.7, -0.8)), 0.27, 2.6, uTime) * 0.06;
    vWave = w;

    vec4 mv = modelViewMatrix * vec4(p.x, p.y + w, p.z, 1.0);
    vWorld = world;
    gl_Position = projectionMatrix * mv;
  }
`;

const WATER_FRAG = /* glsl */`
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uTime;
  varying vec3 vWorld;
  varying float vWave;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);

    // Slope of the wave field gives us a cheap normal.
    float dx = cos(vWorld.x * 0.085 + uTime * 1.4) * 0.019
             + cos(vWorld.x * 0.27 + uTime * 2.6) * 0.016;
    float dz = cos(vWorld.z * 0.13 + uTime * 1.9) * 0.017
             + cos(vWorld.z * 0.27 - uTime * 2.6) * 0.013;
    vec3 n = normalize(vec3(-dx, 1.0, -dz));

    float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.2);
    vec3 col = mix(uDeep, uShallow, clamp(vWave * 1.4 + 0.5, 0.0, 1.0));

    // Sky reflection, approximated with a single horizon tint.
    col = mix(col, vec3(0.62, 0.70, 0.78), fres * 0.85);

    vec3 h = normalize(normalize(uSunDir) + viewDir);
    col += uSunColor * pow(max(dot(n, h), 0.0), 180.0) * 1.9;

    gl_FragColor = vec4(col, 0.93);
  }
`;

export function createWater(span, level, sunDirection) {
  // Exactly the terrain's footprint. The plane is hidden wherever the ground
  // sits above the waterline, so the visible water is precisely the carved
  // river channel — but any overhang past the terrain edge would float.
  const geo = new THREE.PlaneGeometry(span * 2, span * 2, 140, 140);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0x4a5a54) },
      uDeep: { value: new THREE.Color(0x243530) },
      uSunDir: { value: sunDirection.clone().normalize() },
      uSunColor: { value: new THREE.Color(0xffe0b0) },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = level;
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  return mesh;
}
