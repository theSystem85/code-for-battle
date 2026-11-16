// Offline, periodic turbulent flame field. Runtime only samples the alpha atlas.
import sharp from 'sharp'
const w = 64, h = 128, columns = 8, rows = 4
const width = w * columns, height = h * rows
const pixels = Buffer.alloc(width * height * 4)
for (let frame = 0; frame < 32; frame++) {
  const phase = (frame % 16) / 16 * Math.PI * 2
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w * 2 - 1, v = 1 - (y + 0.5) / h
    const turbulence = Math.sin(u * 11 + v * 13 - phase) * 0.13 + Math.sin(u * 23 - v * 21 + phase * 2) * 0.07 + Math.sin(u * 41 + v * 32 - phase * 3) * 0.035
    const i = (((frame >> 3) * h + y) * width + (frame % 8) * w + x) * 4
    if (frame < 16) {
      const heat = Math.max(0, Math.min(1, (1 - Math.abs(u + Math.sin(v * 9 - phase) * v * 0.17) - v * 0.98 + turbulence) * 2.8))
      pixels[i] = 255; pixels[i + 1] = Math.round(65 + heat * 180); pixels[i + 2] = Math.round(12 + heat ** 4 * 170)
      pixels[i + 3] = Math.round(heat * Math.min(1, (1 - Math.abs(u)) * 8) * Math.min(1, v * 22) * Math.min(1, (1 - v) * 10) * 225)
    } else {
      const density = Math.max(0, 1 - Math.abs(u + Math.sin(v * 12 - phase) * 0.18) / (0.25 + v * 0.7))
      pixels[i] = 65; pixels[i + 1] = 61; pixels[i + 2] = 58
      pixels[i + 3] = Math.round(density * Math.sin(v * Math.PI) ** 2 * (0.65 + turbulence) * 105)
    }
  }
}
await sharp(pixels, { raw: { width, height, channels: 4 } }).webp({ quality: 85 }).toFile('public/images/effects/64x128_8x4_fire.webp')
