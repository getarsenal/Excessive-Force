import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Grade: saturation, contrast, warmth, vignette, and a chromatic punch driven
 * by the camera shake.
 *
 * ACES tone mapping is doing the right thing to highlights but it desaturates
 * midtones noticeably, which on a scene this flat is most of the picture. The
 * saturation and lift/gain here are what bring the colour back after it — they
 * are the last thing in the chain, so what the player sees is what this says.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.85 },
    uWarm: { value: 0.05 },
    uSaturation: { value: 1.05 },
    uContrast: { value: 1.055 },
    uShake: { value: new THREE.Vector2(0, 0) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uWarm;
    uniform float uSaturation;
    uniform float uContrast;
    uniform vec2 uShake;
    varying vec2 vUv;
    void main(){
      vec2 uv = vUv + uShake;
      // Chromatic split scales with distance from centre; during a big hit the
      // shake term pushes it far enough to read as a lens punch.
      vec2 d = uv - 0.5;
      float r2 = dot(d, d);
      float ca = 0.0009 + length(uShake) * 0.22;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d * ca).b;

      // Saturation around perceptual luma, so pushing colour does not also
      // push brightness and blow the stonework out.
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);

      // Gentle S-curve about mid grey.
      col = (col - 0.5) * uContrast + 0.5;

      // Split tone: warm the highlights, cool the shadows. A single global warm
      // tint flattens the image; opposing the ends separates them.
      float shadow = 1.0 - smoothstep(0.0, 0.55, luma);
      col *= mix(vec3(1.0), vec3(1.07, 1.01, 0.92), uWarm * 6.0);
      col *= mix(vec3(1.0), vec3(0.94, 0.98, 1.09), shadow * 0.5);

      col *= smoothstep(0.95, uVignette * 0.35, r2 * 1.6);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

/**
 * Where the key light sits relative to whatever the camera is looking at.
 *
 * Exported because the render loop has to keep the shadow frustum following the
 * focus, and having the offset written out in two places is how the sun and its
 * shadows end up disagreeing about where the sun is.
 *
 * Elevation is about 20°: |y| / hypot(x, z) = 168 / 462.
 */
export const SUN_OFFSET = new THREE.Vector3(-396, 168, 238);

export class Engine {
  constructor(canvas, quality) {
    this.quality = quality;
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // SMAA in the composer instead; cheaper with bloom
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.26;

    if (quality.shadowMapSize > 0) {
      this.renderer.shadowMap.enabled = true;
      // Variance shadow maps, blurred, rather than a hard PCF lookup. The
      // shadow map covers 1.36 km with a low sun, so one texel is a metre or
      // more on the ground and a hard lookup draws every shadow edge as a
      // staircase — most visible along the long diagonal edges the city's own
      // buildings cast across the streets.
      //
      // Not PCFSoftShadowMap: three.js removed it, and asking for it now logs
      // a warning and silently gives back the hard filter, which is a quality
      // setting that looks like it is working and is not.
      this.renderer.shadowMap.type = THREE.VSMShadowMap;
    }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 1.2, 6000);

    this.clock = new THREE.Clock();
    this.shake = { amount: 0, decay: 3.4 };
    this._shakeVec = new THREE.Vector2();

    this._setupLights();
    this._setupComposer();

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onResize();
  }

  _setupLights() {
    const q = this.quality;

    // Late afternoon, and low.
    //
    // The sun used to sit at thirty-five degrees, which from a bird's-eye
    // camera is almost overhead: every roof was lit, every wall was lit, and
    // the ground between the buildings had nothing on it. A city seen from the
    // air is beautiful because of the shadows — at twenty degrees a thirty-
    // metre block throws eighty metres of shadow across the streets, and that
    // is what turns a field of boxes into a place with depth and rhythm. It
    // also separates the buildings from each other and from the ground, which
    // no amount of recolouring was ever going to do.
    //
    // The colour *difference* between key and fill matters as much as either:
    // a neutral sun and a neutral ambient produce flat grey stonework however
    // bright they are, so this is warm and the fill is cool.
    this.sun = new THREE.DirectionalLight(0xffe9c8, 3.6);
    this.sun.position.copy(SUN_OFFSET);
    if (q.shadowMapSize > 0) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      // Wide enough to cover what the bird's-eye camera can actually see.
      // At 260 m the map ended a couple of streets from the landmark and
      // everything past it rendered as though it were in shadow — two bright
      // wedges spreading out from the covered square, which is unmistakable
      // once the surrounding city is dense enough to show it.
      // A low sun needs a deeper frustum than a high one: the same ground is
      // now seen along a much shallower ray, so the near and far planes have to
      // span a lot more distance to hold it.
      const d = 680;
      Object.assign(this.sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 3200 });
      this.sun.shadow.bias = -0.0009;
      this.sun.shadow.normalBias = 0.9;
      // VSM filters the depth *distribution* rather than sampling it, so the
      // softness is a blur radius on the map itself. Kept small: this light
      // covers 1.36 km, and a wide blur at that scale starts leaking shadow
      // through thin geometry — a lattice tower being the worst possible case.
      this.sun.shadow.radius = 2.2;
      this.sun.shadow.blurSamples = 8;
      this.sun.shadow.camera.updateProjectionMatrix();
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Kept well below the sun: a strong blue hemisphere washes every upward
    // face (roofs especially) with sky colour and the whole city goes flat and
    // cold. Ambient should fill shadow, not compete with the key light.
    this.hemi = new THREE.HemisphereLight(0x9cc0ea, 0x7a6642, 0.66);
    this.scene.add(this.hemi);

    // A small uniform floor. The sky fill and the environment map both fall off
    // with the surface normal, so a face pointing directly away from every
    // light still lands on zero — and a black polygon in the middle of a lit
    // scene reads as a hole, not as shadow.
    this.ambient = new THREE.AmbientLight(0x7d8ca2, 0.34);
    this.scene.add(this.ambient);

    // A rim from behind separates the tower from the sky haze.
    this.rim = new THREE.DirectionalLight(0x9fccf4, 0.55);
    this.rim.position.set(280, 120, -260);
    this.scene.add(this.rim);

    // Aerial perspective.
    //
    // Warmer and a little heavier than it was, because with the sun this low
    // the air between the camera and the far bank is full of light. Distance
    // now lifts and desaturates the way it does over a real city at the end of
    // the afternoon, which is most of what makes a wide shot read as *deep*
    // rather than as a flat map. It has to stay close to the sky's horizon
    // colour or the skyline shows up as a seam.
    //
    // Half the density it was. At the old figure the air was 46% opaque at a
    // kilometre and 81% at two and a half, which is not depth, it is a wall:
    // everything past the last street washed to flat grey, so the country
    // beyond the town could not be seen at all whatever was built out there.
    // Thinner air keeps the lift and the desaturation that make a wide shot
    // read as deep, and lets the fields, the airfield and the far skyline
    // actually arrive.
    this.scene.fog = new THREE.FogExp2(0xd8d3c4, 0.00026);
  }

  _setupComposer() {
    const q = this.quality;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (q.bloom) {
      this.bloom = new UnrealBloomPass(size, 0.30, 0.34, 1.30);
      this.composer.addPass(this.bloom);
    }

    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);

    if (q.name === 'high' || q.name === 'ultra') {
      this.composer.addPass(new SMAAPass(size.x, size.y));
    }
    this.composer.addPass(new OutputPass());
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }

  /**
   * Build an environment map from the sky dome and light the scene with it.
   *
   * Without one, every metal in the game renders close to black: a metallic
   * surface has no diffuse response at all, so with nothing to reflect there is
   * nothing to see — which is why the cast-iron spire and the gilt finial read
   * as silhouettes rather than as metal. Pre-filtering the actual sky means the
   * spire reflects the sky it is standing against, and stone picks up a correct
   * specular sheen at grazing angles for free.
   *
   * @param {THREE.Object3D} sky the sky dome, before it joins the main scene
   */
  useEnvironmentFrom(sky) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const scratch = new THREE.Scene();
    scratch.add(sky);
    const rt = pmrem.fromScene(scratch, 0.04);
    this.scene.environment = rt.texture;
    // Carries most of the fill on faces the sun never reaches. Without it,
    // north-facing roofs and the shaded side of every street read as black —
    // a hemisphere light alone gives them one flat ambient tone and nothing to
    // reflect.
    this.scene.environmentIntensity = 1.08;
    this.envMap = rt.texture;
    pmrem.dispose();
    // Hand the dome back; the caller adds it to the real scene.
    scratch.remove(sky);
    return sky;
  }

  /** Kick the camera. `amount` is roughly "metres of apparent displacement". */
  addShake(amount) {
    this.shake.amount = Math.min(1.4, this.shake.amount + amount);
  }

  updateShake(dt) {
    const s = this.shake;
    if (s.amount <= 0.0001) {
      this._shakeVec.set(0, 0);
      this.gradePass.uniforms.uShake.value.set(0, 0);
      return this._shakeVec;
    }
    s.amount = Math.max(0, s.amount - s.decay * dt * s.amount - dt * 0.05);
    const t = performance.now() * 0.001;
    // Two incommensurate frequencies so it reads as a rumble, not a sine wave.
    const x = (Math.sin(t * 47.3) * 0.6 + Math.sin(t * 23.1) * 0.4) * s.amount;
    const y = (Math.cos(t * 41.7) * 0.6 + Math.cos(t * 19.7) * 0.4) * s.amount;
    this._shakeVec.set(x, y);
    this.gradePass.uniforms.uShake.value.set(x * 0.012, y * 0.012);
    return this._shakeVec;
  }

  render() { this.composer.render(); }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}

/**
 * Bird's-eye rig: orbit + pan + zoom, kept above ground, with enough damping
 * that a collapse stays watchable while you're still moving the camera.
 */
export class CameraRig {
  constructor(camera, domElement, opts = {}) {
    this.camera = camera;
    this.dom = domElement;
    this.target = new THREE.Vector3(opts.tx ?? 0, opts.ty ?? 40, opts.tz ?? 0);
    this.desiredTarget = this.target.clone();

    this.distance = opts.distance ?? 260;
    this.desiredDistance = this.distance;
    this.minDistance = 35;
    this.maxDistance = 900;

    this.yaw = opts.yaw ?? -0.7;
    this.pitch = opts.pitch ?? 0.62;
    this.desiredYaw = this.yaw;
    this.desiredPitch = this.pitch;
    this.minPitch = 0.06;
    this.maxPitch = 1.42;

    this.enabled = true;
    this.groundHeight = () => 0;

    this._pointers = new Map();
    this._lastPinch = 0;
    this._dragMode = null;
    this._moved = 0;

    this._bind();
  }

  /**
   * Gestures:
   *   one finger  -> orbit (aim the view)
   *   two fingers -> pan the camera's location, and pinch to zoom
   *   mouse: drag orbits, right/middle/shift-drag pans, wheel zooms
   *
   * Once a gesture goes to two fingers it stays a pan until every finger
   * lifts. Without that lock, taking one finger off mid-pinch would snap the
   * gesture back to orbit and spin the view on the way out of the gesture.
   */
  _bind() {
    const dom = this.dom;

    const down = (e) => {
      if (!this.enabled) return;
      try { dom.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 1) {
        this._moved = 0;
        this._dragMode = (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'orbit';
      } else if (this._pointers.size === 2) {
        this._dragMode = 'twofinger';
        this._lastPinch = this._pinchDistance();
        this._lastCentroid = this._centroid();
      }
    };

    const move = (e) => {
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      this._moved += Math.abs(dx) + Math.abs(dy);

      if (this._dragMode === 'twofinger') {
        if (this._pointers.size < 2) return;
        // Pan by how far the midpoint of the two fingers travelled, and zoom
        // by how much their separation changed. Using the centroid rather than
        // one finger's delta means a pure pinch doesn't also drag the map.
        const c = this._centroid();
        if (this._lastCentroid) {
          this._pan(c.x - this._lastCentroid.x, c.y - this._lastCentroid.y, c.x, c.y);
        }
        this._lastCentroid = c;

        const d = this._pinchDistance();
        if (this._lastPinch > 0 && d > 0) {
          this.desiredDistance = clamp(
            this.desiredDistance * (this._lastPinch / d),
            this.minDistance, this.maxDistance,
          );
        }
        this._lastPinch = d;
        return;
      }

      if (this._pointers.size !== 1) return;
      if (this._dragMode === 'orbit') {
        this.desiredYaw -= dx * 0.0042;
        this.desiredPitch = clamp(this.desiredPitch + dy * 0.0034, this.minPitch, this.maxPitch);
      } else if (this._dragMode === 'pan') {
        this._pan(dx, dy, e.clientX, e.clientY);
      }
    };

    const up = (e) => {
      this._pointers.delete(e.pointerId);
      try { dom.releasePointerCapture?.(e.pointerId); } catch { /* already gone */ }
      if (this._pointers.size === 0) {
        this._dragMode = null;
        this._lastCentroid = null;
      } else if (this._dragMode === 'twofinger') {
        // Stay in the two-finger gesture; just re-seed from what's left so the
        // next delta isn't measured against a finger that is gone.
        this._lastCentroid = this._centroid();
        this._lastPinch = this._pinchDistance();
      }
    };

    dom.addEventListener('pointerdown', down);
    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.desiredDistance = clamp(
        this.desiredDistance * (1 + Math.sign(e.deltaY) * 0.12),
        this.minDistance, this.maxDistance,
      );
    }, { passive: false });

    this._keys = new Set();
    window.addEventListener('keydown', (e) => this._keys.add(e.code));
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));
  }

  _pinchDistance() {
    const [a, b] = [...this._pointers.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  _centroid() {
    let x = 0, y = 0, n = 0;
    for (const p of this._pointers.values()) { x += p.x; y += p.y; n++; }
    return n ? { x: x / n, y: y / n } : null;
  }

  /**
   * The camera's ground-plane basis.
   *
   * The rig places the camera at target + (sin(yaw)·cp·d, …, cos(yaw)·cp·d),
   * so it looks back along -(sin yaw, cos yaw). From that:
   *   forward = (-sin yaw, 0, -cos yaw)   screen-up, away from the camera
   *   right   = ( cos yaw, 0, -sin yaw)   screen-right
   */
  _basis() {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return { fx: -s, fz: -c, rx: c, rz: -s };
  }

  /** Metres of ground per screen pixel at the focus distance. */
  _metresPerPixel() {
    const vFov = (this.camera.fov * Math.PI) / 180;
    return (2 * Math.tan(vFov / 2) * this.distance) / Math.max(window.innerHeight, 1);
  }

  /**
   * Where a screen pixel lands on the horizontal plane through the focus point.
   * Returns null when the ray runs parallel to the plane or points away from it,
   * which happens once the camera is nearly level with the ground.
   */
  _screenToGround(sx, sy, out) {
    const ndcX = (sx / window.innerWidth) * 2 - 1;
    const ndcY = -((sy / window.innerHeight) * 2 - 1);
    const v = (this._rayTmp || (this._rayTmp = new THREE.Vector3()));
    v.set(ndcX, ndcY, 0.5).unproject(this.camera).sub(this.camera.position);
    if (Math.abs(v.y) < 1e-6) return null;
    const t = (this.target.y - this.camera.position.y) / v.y;
    if (t <= 0 || !isFinite(t)) return null;
    return out.copy(this.camera.position).addScaledVector(v, t);
  }

  /**
   * Drag the ground, map-style: whatever is under the cursor stays under it.
   *
   * The exact way to do this is to ask where the pointer was pointing on the
   * ground before the move and where it points now, then shift the focus by the
   * difference. No trigonometry, no foreshortening fudge, and it stays correct
   * at any yaw, pitch or zoom.
   *
   * The earlier version derived a direction from yaw by hand and had one sign
   * wrong on each axis. That is why panning didn't read as merely inverted —
   * the error changed character as you orbited, so every drag felt arbitrary.
   * The fallback below is that same trigonometric estimate, kept only for the
   * case where the camera is so close to level that the ray never meets the
   * ground plane.
   */
  _pan(dx, dy, sx, sy) {
    if (sx !== undefined && sy !== undefined) {
      const a = this._panA || (this._panA = new THREE.Vector3());
      const b = this._panB || (this._panB = new THREE.Vector3());
      const from = this._screenToGround(sx - dx, sy - dy, a);
      const to = from ? this._screenToGround(sx, sy, b) : null;
      if (from && to) {
        this.desiredTarget.x += from.x - to.x;
        this.desiredTarget.z += from.z - to.z;
        return;
      }
    }

    const { fx, fz, rx, rz } = this._basis();
    const mpp = this._metresPerPixel();
    const grazing = Math.max(Math.sin(this.pitch), 0.25);
    this.desiredTarget.x += (-rx * dx + fx * dy / grazing) * mpp;
    this.desiredTarget.z += (-rz * dx + fz * dy / grazing) * mpp;
  }

  /** True if the last pointer interaction was a drag rather than a tap. */
  get wasDrag() { return this._moved > 9; }

  focus(point, distance) {
    this.desiredTarget.copy(point);
    if (distance) this.desiredDistance = clamp(distance, this.minDistance, this.maxDistance);
  }

  update(dt, shakeVec) {
    // Keyboard pan for desktop.
    const k = this._keys;
    if (k.size) {
      const speed = this.distance * 0.9 * dt;
      const { fx, fz, rx, rz } = this._basis();
      let fwd = 0, strafe = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) strafe += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) strafe -= 1;
      if (fwd || strafe) {
        this.desiredTarget.x += (fx * fwd + rx * strafe) * speed;
        this.desiredTarget.z += (fz * fwd + rz * strafe) * speed;
      }
      if (k.has('KeyQ')) this.desiredYaw += dt * 1.1;
      if (k.has('KeyE')) this.desiredYaw -= dt * 1.1;
    }

    const a = 1 - Math.pow(0.0016, dt);
    this.yaw += (this.desiredYaw - this.yaw) * a;
    this.pitch += (this.desiredPitch - this.pitch) * a;
    this.distance += (this.desiredDistance - this.distance) * a;
    this.target.lerp(this.desiredTarget, a);

    // Keep the focus point from sinking under the terrain.
    const gh = this.groundHeight(this.target.x, this.target.z);
    if (this.target.y < gh + 2) this.target.y = gh + 2;

    const cp = Math.cos(this.pitch);
    const ox = Math.sin(this.yaw) * cp * this.distance;
    const oy = Math.sin(this.pitch) * this.distance;
    const oz = Math.cos(this.yaw) * cp * this.distance;

    this.camera.position.set(this.target.x + ox, this.target.y + oy, this.target.z + oz);

    // Never let the camera clip through the ground.
    const camGround = this.groundHeight(this.camera.position.x, this.camera.position.z);
    if (this.camera.position.y < camGround + 6) this.camera.position.y = camGround + 6;

    this.camera.lookAt(this.target);

    if (shakeVec && (shakeVec.x || shakeVec.y)) {
      this.camera.position.x += shakeVec.x * this.distance * 0.004;
      this.camera.position.y += shakeVec.y * this.distance * 0.004;
    }
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
