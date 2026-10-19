// Inspect adapter metadata once during initialization; never probe in a frame loop.
const SOFTWARE_GPU = /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render|microsoft warp|\bwarp\b|fallback/i
const GENERIC_GPU = /^(unknown|webkit|webkit webgl|webgl|angle|0x0|0x0000)$/i

export function hasHardwareGpuInfo(info, isFallbackAdapter = false) {
  if (isFallbackAdapter) return false
  const fields = [info?.vendor, info?.architecture, info?.device, info?.description]
  const details = fields.filter(value => typeof value === 'string' && value.trim())
  if (SOFTWARE_GPU.test(details.join(' '))) return false
  return details.some(value => !GENERIC_GPU.test(value.trim()))
}

export function hasWebGlHardwareGpu(gl) {
  try {
    const debug = gl?.getExtension?.('WEBGL_debug_renderer_info')
    if (!debug) return false
    return hasHardwareGpuInfo({
      vendor: gl.getParameter(debug.UNMASKED_VENDOR_WEBGL),
      description: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
    })
  } catch {
    return false
  }
}

// Original procedural GPU water, retained for the checkbox and software fallback.
export const LEGACY_WATER_GLSL = `
vec3 legacyWater(vec2 world, float time, float zoom, float tone, float strength) {
  float t = time * 0.001;
  float scale = 1.0 / max(zoom, 0.001);
  vec2 flow = vec2(sin(world.y * (0.031 * scale) + t * 0.82), cos(world.x * (0.029 * scale) - t * 0.74));
  vec2 p = world * (0.052 * scale) + flow * 1.15;
  float wave = (sin(p.x * 1.2 + t * 1.1) + cos(p.y * 1.35 - t * 1.25) + sin((p.x - p.y) * 0.92 + t * 0.63)) / 3.0;
  float shimmer = 0.5 + 0.5 * sin(p.x * 1.2 - p.y * 1.05 + t * 1.65);
  float blend = clamp((tone + 1.0) * 0.5, 0.0, 1.0);
  vec3 deep = mix(vec3(0.04, 0.18, 0.32), vec3(0.09, 0.27, 0.30), blend);
  vec3 bright = mix(vec3(0.08, 0.39, 0.58), vec3(0.13, 0.52, 0.43), blend);
  return mix(deep, bright, clamp(0.5 + wave * 0.45 * strength, 0.0, 1.0)) + vec3(0.04, 0.08, 0.10) * shimmer * 0.42 * strength;
}
`

export const LEGACY_WATER_WGSL = `
fn legacyWater(world: vec2f, time: f32, zoom: f32, tone: f32, strength: f32) -> vec3f {
  let t = time * 0.001;
  let scale = 1.0 / max(zoom, 0.001);
  let flow = vec2f(sin(world.y * (0.031 * scale) + t * 0.82), cos(world.x * (0.029 * scale) - t * 0.74));
  let p = world * (0.052 * scale) + flow * 1.15;
  let wave = (sin(p.x * 1.2 + t * 1.1) + cos(p.y * 1.35 - t * 1.25) + sin((p.x - p.y) * 0.92 + t * 0.63)) / 3.0;
  let shimmer = 0.5 + 0.5 * sin(p.x * 1.2 - p.y * 1.05 + t * 1.65);
  let blend = clamp((tone + 1.0) * 0.5, 0.0, 1.0);
  let deep = mix(vec3f(0.04, 0.18, 0.32), vec3f(0.09, 0.27, 0.30), blend);
  let bright = mix(vec3f(0.08, 0.39, 0.58), vec3f(0.13, 0.52, 0.43), blend);
  return mix(deep, bright, clamp(0.5 + wave * 0.45 * strength, 0.0, 1.0)) + vec3f(0.04, 0.08, 0.10) * shimmer * 0.42 * strength;
}
`
