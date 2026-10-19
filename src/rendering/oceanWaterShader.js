/*!
 * MIT License
 *
 * Copyright (c) 2026 Maksymilian Dendura
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
/**
 * Top-down ocean lighting inspired by Noniv/web-ocean, especially its
 * slope-based sun glitter, Fresnel reflection, and crest foam. fresnelWater
 * adapts js/wgsl/ocean.js at a07c7fd522ef0a897601c114f927a49d93d95520.
 * Copyright (c) 2026 Maksymilian Dendura. MIT license: /licenses/web-ocean-MIT.txt.
 *
 * Four analytic wave bands replace the demo's FFT/sky/foam textures for this
 * orthographic terrain pass. Keep the GLSL and WGSL equations in sync; the
 * browser tests compare their rendered pixels. No per-frame textures or state.
 */
export const OCEAN_WATER_GLSL = `
float fresnelWater(float c) {
  float x = 1.0 - clamp(c, 0.0, 1.0);
  float x2 = x * x;
  return 0.02 + 0.98 * x2 * x2 * x;
}

vec3 oceanWater(vec2 world, float time, float zoom, float tone, float footprint, float strength) {
  // Four times smaller waves give the higher top-down viewpoint.
  // Coordinates are logical map pixels, independent of camera and display DPR.
  float scale = 0.8 / max(zoom, 0.001);
  float t = time * 0.001;
  vec2 p = world * scale;
  // Long cross swells bend the wave trains, avoiding a repeating diagonal grid.
  vec2 bendPhase = vec2(dot(p, vec2(0.013, 0.021)), dot(p, vec2(-0.018, 0.011))) - t * vec2(0.12, 0.18);
  vec2 bendDerivative = cos(bendPhase) * vec2(22.0, 16.0);
  p += sin(bendPhase) * vec2(22.0, 16.0);
  vec4 frequency = vec4(0.052, 0.108, 0.251, 0.571);
  vec4 directionX = vec4(0.94, 0.60, 0.80, -0.28);
  vec4 directionY = vec4(0.34, -0.80, 0.60, 0.96);
  vec4 phase = (p.x * directionX + p.y * directionY) * frequency
    - t * vec4(0.85, 1.19, 1.72, 2.33);
  // Fade unresolved slopes into roughness before they can alias at small zoom.
  vec4 filtered = vec4(1.0) - smoothstep(vec4(0.7), vec4(2.8), frequency * footprint * scale);
  vec4 waves = sin(phase);
  vec4 slopes = cos(phase) * (vec4(1.0) + 0.44 * waves)
    * vec4(0.28, 0.19, 0.12, 0.07) * filtered * strength;
  vec2 slope = vec2(dot(slopes, directionX), dot(slopes, directionY));
  slope = vec2(slope.x * (1.0 + 0.013 * bendDerivative.x) - slope.y * 0.018 * bendDerivative.y,
    slope.y * (1.0 + 0.011 * bendDerivative.y) + slope.x * 0.021 * bendDerivative.x);
  float height = dot((waves + 0.22 * waves * waves) * filtered, vec4(0.55, 0.27, 0.12, 0.06)) * strength;
  vec3 normal = normalize(vec3(-slope, 1.0));
  vec3 light = normalize(vec3(-0.36, -0.48, 0.80));
  vec3 halfVector = normalize(light + vec3(0.0, 0.0, 1.0));
  float toneBlend = clamp((tone + 1.0) * 0.5, 0.0, 1.0);
  vec3 deep = mix(vec3(0.035, 0.14, 0.25), vec3(0.045, 0.20, 0.22), toneBlend);
  vec3 shallow = mix(vec3(0.07, 0.36, 0.48), vec3(0.10, 0.43, 0.35), toneBlend);
  float crest = smoothstep(0.15, 0.95, height);
  vec3 body = mix(deep, shallow, clamp(0.42 + height * 0.24, 0.0, 1.0));
  body *= 0.78 + 0.28 * max(dot(normal, light), 0.0);
  body += vec3(0.025, 0.075, 0.065) * crest;
  vec3 reflection = mix(vec3(0.35, 0.48, 0.56), vec3(0.16, 0.29, 0.42), normal.z);
  vec3 color = mix(body, reflection, fresnelWater(normal.z));

  // An anisotropic slope distribution gives broken, wind-aligned sun glints.
  vec2 delta = slope + halfVector.xy / halfVector.z;
  float unresolved = dot(vec4(1.0) - filtered, vec4(0.012, 0.009, 0.006, 0.004));
  vec2 variance = vec2(0.018, 0.035) + unresolved;
  float glitter = exp(-0.5 * dot(delta * delta, vec2(1.0) / variance));
  color += vec3(1.0, 0.92, 0.74) * glitter * 0.25;

  // Sparse breaking crests; cross waves break the foam into moving streaks.
  float breaking = smoothstep(0.72, 1.06, height);
  float streak = smoothstep(-0.15, 0.65, waves.z * waves.w);
  float foam = breaking * streak * 0.48 * filtered.w;
  return mix(color, vec3(0.72, 0.83, 0.83), foam);
}
`

export const OCEAN_WATER_WGSL = `
fn fresnelWater(c: f32) -> f32 {
  let x = 1.0 - clamp(c, 0.0, 1.0);
  let x2 = x * x;
  return 0.02 + 0.98 * x2 * x2 * x;
}

fn oceanWater(world: vec2f, time: f32, zoom: f32, tone: f32, footprint: f32, strength: f32) -> vec3f {
  let scale = 0.8 / max(zoom, 0.001);
  let t = time * 0.001;
  var p = world * scale;
  let bendPhase = vec2f(dot(p, vec2f(0.013, 0.021)), dot(p, vec2f(-0.018, 0.011))) - t * vec2f(0.12, 0.18);
  let bendDerivative = cos(bendPhase) * vec2f(22.0, 16.0);
  p += sin(bendPhase) * vec2f(22.0, 16.0);
  let frequency = vec4f(0.052, 0.108, 0.251, 0.571);
  let directionX = vec4f(0.94, 0.60, 0.80, -0.28);
  let directionY = vec4f(0.34, -0.80, 0.60, 0.96);
  let phase = (p.x * directionX + p.y * directionY) * frequency
    - t * vec4f(0.85, 1.19, 1.72, 2.33);
  let filtered = vec4f(1.0) - smoothstep(vec4f(0.7), vec4f(2.8), frequency * footprint * scale);
  let waves = sin(phase);
  let slopes = cos(phase) * (vec4f(1.0) + 0.44 * waves)
    * vec4f(0.28, 0.19, 0.12, 0.07) * filtered * strength;
  var slope = vec2f(dot(slopes, directionX), dot(slopes, directionY));
  slope = vec2f(slope.x * (1.0 + 0.013 * bendDerivative.x) - slope.y * 0.018 * bendDerivative.y,
    slope.y * (1.0 + 0.011 * bendDerivative.y) + slope.x * 0.021 * bendDerivative.x);
  let height = dot((waves + 0.22 * waves * waves) * filtered, vec4f(0.55, 0.27, 0.12, 0.06)) * strength;
  let normal = normalize(vec3f(-slope, 1.0));
  let light = normalize(vec3f(-0.36, -0.48, 0.80));
  let halfVector = normalize(light + vec3f(0.0, 0.0, 1.0));
  let toneBlend = clamp((tone + 1.0) * 0.5, 0.0, 1.0);
  let deep = mix(vec3f(0.035, 0.14, 0.25), vec3f(0.045, 0.20, 0.22), toneBlend);
  let shallow = mix(vec3f(0.07, 0.36, 0.48), vec3f(0.10, 0.43, 0.35), toneBlend);
  let crest = smoothstep(0.15, 0.95, height);
  var body = mix(deep, shallow, clamp(0.42 + height * 0.24, 0.0, 1.0));
  body *= 0.78 + 0.28 * max(dot(normal, light), 0.0);
  body += vec3f(0.025, 0.075, 0.065) * crest;
  let reflection = mix(vec3f(0.35, 0.48, 0.56), vec3f(0.16, 0.29, 0.42), normal.z);
  var color = mix(body, reflection, fresnelWater(normal.z));
  let delta = slope + halfVector.xy / halfVector.z;
  let unresolved = dot(vec4f(1.0) - filtered, vec4f(0.012, 0.009, 0.006, 0.004));
  let variance = vec2f(0.018, 0.035) + vec2f(unresolved);
  let glitter = exp(-0.5 * dot(delta * delta, vec2f(1.0) / variance));
  color += vec3f(1.0, 0.92, 0.74) * glitter * 0.25;
  let breaking = smoothstep(0.72, 1.06, height);
  let streak = smoothstep(-0.15, 0.65, waves.z * waves.w);
  let foam = breaking * streak * 0.48 * filtered.w;
  return mix(color, vec3f(0.72, 0.83, 0.83), foam);
}
`
