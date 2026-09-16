/**
 * Cloud shadows on the ground.
 *
 * The sky has clouds and the ground did not know: a low sun over an
 * unbroken plain lit every field the same. Shadows of clouds drifting across
 * the terrain and the town are the cheapest thing that makes a landscape look
 * like the open air rather than a rendered plane — a slow, soft darkening
 * scrolling with the sky's own drift. Injected into the standard material
 * rather than a second pass, so it costs a noise lookup per fragment and
 * nothing else.
 */

export const cloudUniforms = { uCloudTime: { value: 0 } };

const NOISE = /* glsl */`
  float chash(vec2 p) {
    p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;
    p *= 17.0;
    return fract(p.x * p.y * (p.x + p.y));
  }
  float cnoise(vec2 x) {
    vec2 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(chash(i), chash(i + vec2(1.0, 0.0)), f.x),
               mix(chash(i + vec2(0.0, 1.0)), chash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float cloudShade(vec2 xz) {
    vec2 p = xz * 0.0011 + vec2(uCloudTime * 0.011, uCloudTime * 0.003);
    float n = cnoise(p) * 0.55 + cnoise(p * 2.3 + 7.1) * 0.3 + cnoise(p * 5.1 + 3.7) * 0.15;
    return 1.0 - uCloudStrength * smoothstep(0.50, 0.74, n);
  }
`;

/**
 * Make a MeshStandardMaterial darken under the clouds. Keyed so every
 * material patched this way shares one compiled program.
 */
export function cloudShadows(material, strength = 0.30) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uCloudTime = cloudUniforms.uCloudTime;
    shader.uniforms.uCloudStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCloudPos;')
      .replace('#include <project_vertex>',
        'vCloudPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        `#include <common>\nvarying vec3 vCloudPos;\nuniform float uCloudTime;\nuniform float uCloudStrength;\n${NOISE}`)
      .replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= cloudShade(vCloudPos.xz);');
  };
  const key = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
  material.customProgramCacheKey = () => `${key}|clouds${strength}`;
  material.needsUpdate = true;
  return material;
}
