// Loaded only by the headed hardware benchmark.
export function installGpuShadowBatch(foreground) {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, depth: false, stencil: false })
  if (!gl) throw new Error('The shadow prototype requires WebGL 2')
  const atlasSize = 1024
  const capacity = 1024
  const floatsPerInstance = 9
  const instances = new Float32Array(capacity * floatsPerInstance)
  const sources = new WeakMap()
  let nextX = 0
  let nextY = 0
  let rowHeight = 0
  let count = 0
  let uploads = 0
  let batches = 0
  let shadows = 0
  let skipped = 0
  let uploadMs = 0
  let submitMs = 0
  const program = gl.createProgram()
  for (const [type, source] of [
    [gl.VERTEX_SHADER, `#version 300 es
      layout(location=0) in vec4 rect;
      layout(location=1) in vec4 region;
      layout(location=2) in float opacity;
      uniform vec2 size;
      out vec2 uv;
      out float alpha;
      void main() {
        vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
        vec2 pixel = rect.xy + corner * rect.zw;
        gl_Position = vec4(pixel / size * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
        uv = region.xy + corner * region.zw;
        alpha = opacity;
      }`],
    [gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;
      uniform sampler2D atlas;
      in vec2 uv;
      in float alpha;
      out vec4 color;
      void main() { color = texture(atlas, uv) * alpha; }`]
  ]) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
    gl.attachShader(program, shader)
    gl.deleteShader(shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  gl.useProgram(program)
  const size = gl.getUniformLocation(program, 'size')
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, instances.byteLength, gl.STREAM_DRAW)
  for (const [location, components, offset] of [[0, 4, 0], [1, 4, 4], [2, 1, 8]]) {
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, components, gl.FLOAT, false, floatsPerInstance * 4, offset * 4)
    gl.vertexAttribDivisor(location, 1)
  }
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, atlasSize, atlasSize)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  function register(source, sx, sy, width, height) {
    if (nextX + width + 2 > atlasSize) {
      nextX = 0
      nextY += rowHeight
      rowHeight = 0
    }
    if (nextY + height + 2 > atlasSize) return null
    const start = performance.now()
    const crop = new OffscreenCanvas(width, height)
    crop.getContext('2d').drawImage(source, sx, sy, width, height, 0, 0, width, height)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, nextX + 1, nextY + 1, gl.RGBA, gl.UNSIGNED_BYTE, crop)
    const region = [(nextX + 1) / atlasSize, (nextY + 1) / atlasSize, width / atlasSize, height / atlasSize]
    sources.set(source, region)
    nextX += width + 2
    rowHeight = Math.max(rowHeight, height + 2)
    uploads++
    uploadMs += performance.now() - start
    return region
  }

  const target = foreground.canvas
  const original = foreground.drawImage
  const style = getComputedStyle(target)
  Object.assign(canvas.style, {
    position: style.position, top: style.top, left: style.left,
    width: style.width, height: style.height, zIndex: style.zIndex, pointerEvents: 'none'
  })
  target.before(canvas)

  function intercept(source, ...args) {
    if (!(source instanceof OffscreenCanvas) || source.width !== 276 || source.height !== 276 || args.length !== 8 ||
      foreground.globalCompositeOperation !== 'source-over' || gl.isContextLost()) return original.call(this, source, ...args)
    const [sx, sy, sw, sh, x, y, width, height] = args
    const matrix = foreground.getTransform()
    if (matrix.b !== 0 || matrix.c !== 0 || matrix.a <= 0 || matrix.d <= 0) return original.call(this, source, ...args)
    const region = sources.get(source) || register(source, sx, sy, sw, sh)
    if (!region || count >= capacity) {
      skipped++
      return original.call(this, source, ...args)
    }
    const offset = count * floatsPerInstance
    instances[offset] = x * matrix.a + matrix.e
    instances[offset + 1] = y * matrix.d + matrix.f
    instances[offset + 2] = width * matrix.a
    instances[offset + 3] = height * matrix.d
    instances.set(region, offset + 4)
    instances[offset + 8] = foreground.globalAlpha
    count++
  }

  foreground.drawImage = intercept
  return {
    draw() {
      if (gl.isContextLost()) throw new Error('Shadow prototype lost its WebGL context')
      const start = performance.now()
      if (canvas.width !== target.width || canvas.height !== target.height) {
        canvas.width = target.width
        canvas.height = target.height
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (count) {
        gl.uniform2f(size, canvas.width, canvas.height)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, instances, 0, count * floatsPerInstance)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count)
        batches++
        shadows += count
        count = 0
      }
      submitMs += performance.now() - start
    },
    stats() { return { uploads, batches, shadows, skipped, uploadMs, submitMs } },
    close() {
      delete foreground.drawImage
      canvas.remove()
      gl.deleteTexture(texture)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }
}
