import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Slight warm grade + vignette, applied after bloom. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.85 },
    uWarm: { value: 0.03 },
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

      col *= mix(vec3(1.0), vec3(1.06, 1.0, 0.93), uWarm * 6.0);
      col *= smoothstep(0.95, uVignette * 0.35, r2 * 1.6);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

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
    this.renderer.toneMappingExposure = 0.98;

    if (quality.shadowMapSize > 0) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
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

    // Late-afternoon London: low warm sun, strong cool sky fill. The contrast
    // is what gives the stonework its relief.
    this.sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
    this.sun.position.set(-320, 260, 190);
    if (q.shadowMapSize > 0) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      const d = 260;
      Object.assign(this.sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 1400 });
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.5;
      this.sun.shadow.camera.updateProjectionMatrix();
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Kept well below the sun: a strong blue hemisphere washes every upward
    // face (roofs especially) with sky colour and the whole city goes flat and
    // cold. Ambient should fill shadow, not compete with the key light.
    this.hemi = new THREE.HemisphereLight(0x9fb4cc, 0x5a4c3c, 0.78);
    this.scene.add(this.hemi);

    // A dim rim from behind separates the tower from the sky haze.
    this.rim = new THREE.DirectionalLight(0x93b4dc, 0.38);
    this.rim.position.set(280, 120, -260);
    this.scene.add(this.rim);

    // Light enough that the far bank and the skyline still read, heavy enough
    // to hide where the terrain data runs out.
    this.scene.fog = new THREE.FogExp2(0xb6c6d6, 0.00042);
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

  _bind() {
    const dom = this.dom;
    const down = (e) => {
      if (!this.enabled) return;
      dom.setPointerCapture?.(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      this._moved = 0;
      if (this._pointers.size === 1) {
        this._dragMode = (e.button === 2 || e.shiftKey) ? 'pan' : 'orbit';
      } else if (this._pointers.size === 2) {
        this._dragMode = 'pinch';
        this._lastPinch = this._pinchDistance();
      }
    };

    const move = (e) => {
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      this._moved += Math.abs(dx) + Math.abs(dy);

      if (this._dragMode === 'orbit' && this._pointers.size === 1) {
        this.desiredYaw -= dx * 0.0042;
        this.desiredPitch = clamp(this.desiredPitch + dy * 0.0034, this.minPitch, this.maxPitch);
      } else if (this._dragMode === 'pan' && this._pointers.size === 1) {
        this._pan(dx, dy);
      } else if (this._dragMode === 'pinch' && this._pointers.size === 2) {
        const d = this._pinchDistance();
        if (this._lastPinch > 0) {
          this.desiredDistance = clamp(
            this.desiredDistance * (this._lastPinch / Math.max(d, 1)),
            this.minDistance, this.maxDistance,
          );
        }
        this._lastPinch = d;
        // Two-finger drag also pans, which is how people expect maps to work.
        const ids = [...this._pointers.values()];
        if (ids.length === 2) this._pan(dx * 0.5, dy * 0.5);
      }
    };

    const up = (e) => {
      this._pointers.delete(e.pointerId);
      dom.releasePointerCapture?.(e.pointerId);
      if (this._pointers.size === 0) this._dragMode = null;
      else if (this._pointers.size === 1) this._dragMode = 'orbit';
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

  _pan(dx, dy) {
    // Pan in the camera's ground plane, scaled by zoom so it feels constant.
    const scale = this.distance * 0.0016;
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    this.desiredTarget.x -= (dx * cos - dy * sin) * scale;
    this.desiredTarget.z -= (dx * sin + dy * cos) * scale;
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
      const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
      let fx = 0, fz = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
      if (fx || fz) {
        this.desiredTarget.x += (fx * cos - fz * sin) * speed;
        this.desiredTarget.z += (fx * sin + fz * cos) * speed;
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
