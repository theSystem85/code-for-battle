// Pure waveform and spectrogram helpers for the audio catalogue.
// Callers pass a decoded channel. Nothing here touches the network or the simulation clock.

const HANN = new Map()

function hann(size) {
  let window = HANN.get(size)
  if (window) return window
  window = new Float32Array(size)
  for (let i = 0; i < size; i++) window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)))
  HANN.set(size, window)
  return window
}

export function computeWaveformPeaks(channel, bucketCount) {
  const count = Math.max(1, bucketCount | 0)
  const peaks = new Float32Array(count)
  const length = channel.length
  if (!length) return peaks
  for (let bucket = 0; bucket < count; bucket++) {
    const start = Math.floor((bucket * length) / count)
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * length) / count))
    let max = 0
    for (let index = start; index < end && index < length; index++) {
      const value = Math.abs(channel[index])
      if (value > max) max = value
    }
    peaks[bucket] = max
  }
  return peaks
}

function fftInPlace(real, imag) {
  const size = real.length
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const swapReal = real[i]
      real[i] = real[j]
      real[j] = swapReal
      const swapImag = imag[i]
      imag[i] = imag[j]
      imag[j] = swapImag
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length
    const stepReal = Math.cos(angle)
    const stepImag = Math.sin(angle)
    for (let start = 0; start < size; start += length) {
      let twiddleReal = 1
      let twiddleImag = 0
      const half = length >> 1
      for (let k = 0; k < half; k++) {
        const even = start + k
        const odd = even + half
        const oddReal = real[odd] * twiddleReal - imag[odd] * twiddleImag
        const oddImag = real[odd] * twiddleImag + imag[odd] * twiddleReal
        real[odd] = real[even] - oddReal
        imag[odd] = imag[even] - oddImag
        real[even] += oddReal
        imag[even] += oddImag
        const nextReal = twiddleReal * stepReal - twiddleImag * stepImag
        twiddleImag = twiddleReal * stepImag + twiddleImag * stepReal
        twiddleReal = nextReal
      }
    }
  }
}

export function dominantFrequencyBin(channel, fftSize) {
  const size = fftSize | 0
  const real = new Float32Array(size)
  const imag = new Float32Array(size)
  const copy = Math.min(size, channel.length)
  for (let i = 0; i < copy; i++) real[i] = channel[i]
  fftInPlace(real, imag)
  let best = 1
  let bestMag = -1
  const limit = size >> 1
  for (let bin = 1; bin < limit; bin++) {
    const mag = real[bin] * real[bin] + imag[bin] * imag[bin]
    if (mag > bestMag) {
      bestMag = mag
      best = bin
    }
  }
  return best
}

function heatColor(amount, out, offset) {
  const t = amount < 0 ? 0 : amount > 1 ? 1 : amount
  let red = 0
  let green = 0
  let blue = 0
  if (t < 0.35) {
    const u = t / 0.35
    blue = 40 + u * 140
    green = u * 40
  } else if (t < 0.7) {
    const u = (t - 0.35) / 0.35
    blue = 180 - u * 140
    green = 40 + u * 180
    red = u * 40
  } else {
    const u = (t - 0.7) / 0.3
    red = 40 + u * 215
    green = 220 + u * 35
    blue = 40 + u * 180
  }
  out[offset] = red
  out[offset + 1] = green
  out[offset + 2] = blue
  out[offset + 3] = 255
}

// columns by rows, row 0 is the lowest frequency. Magnitudes are log-scaled to the clip's own peak.
export function computeSpectrogram(channel, { fftSize = 256, columns = 280, rows = 72 } = {}) {
  const size = fftSize | 0
  const width = Math.max(1, columns | 0)
  const height = Math.max(1, Math.min(rows | 0, size >> 1))
  const bins = new Float32Array(width * height)
  const real = new Float32Array(size)
  const imag = new Float32Array(size)
  const window = hann(size)
  const length = channel.length
  const hop = length > size ? Math.max(1, Math.floor((length - size) / Math.max(1, width - 1))) : 1
  let peak = 1e-8
  for (let column = 0; column < width; column++) {
    const start = Math.min(length, column * hop)
    real.fill(0)
    imag.fill(0)
    for (let i = 0; i < size; i++) {
      const sample = start + i < length ? channel[start + i] : 0
      real[i] = sample * window[i]
    }
    fftInPlace(real, imag)
    for (let row = 0; row < height; row++) {
      const mag = Math.hypot(real[row], imag[row])
      const value = Math.log10(mag + 1e-8)
      bins[column * height + row] = value
      if (value > peak) peak = value
    }
  }
  const floor = peak - 4
  const span = peak - floor || 1
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let column = 0; column < width; column++) {
    for (let row = 0; row < height; row++) {
      const value = bins[column * height + row]
      const amount = (value - floor) / span
      const displayRow = height - 1 - row
      heatColor(amount, rgba, (displayRow * width + column) * 4)
    }
  }
  return { columns: width, rows: height, rgba }
}
