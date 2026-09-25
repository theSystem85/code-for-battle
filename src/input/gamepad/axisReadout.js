export function clampSignedAxis(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  if (numeric > 1) return 1
  if (numeric < -1) return -1
  return numeric
}

export function formatSignedAxis(value) {
  const quant = Math.round(clampSignedAxis(value) * 100) / 100
  if (quant > 0) return `+${quant.toFixed(2)}`
  return quant.toFixed(2)
}
