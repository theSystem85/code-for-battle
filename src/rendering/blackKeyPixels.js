// Shared by startup fallback and the worker: identical integer alpha rounding.
export function applyBlackKey(data, cutoffBrightness = 24, softenBrightness = 48) {
  for (let i = 0; i < data.length; i += 4) {
    const brightness = Math.max(data[i], data[i + 1], data[i + 2])
    if (brightness <= cutoffBrightness) data[i + 3] = 0
    else if (brightness < softenBrightness) {
      const t = (brightness - cutoffBrightness) / (softenBrightness - cutoffBrightness)
      data[i + 3] = Math.round(data[i + 3] * t)
    }
  }
}
