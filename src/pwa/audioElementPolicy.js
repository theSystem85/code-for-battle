export function audioCrossOriginForUrl(url, pageOrigin) {
  if (!url || !pageOrigin) return null
  try {
    const parsed = new URL(url, pageOrigin)
    if (parsed.origin === pageOrigin) return null
    return 'anonymous'
  } catch {
    return null
  }
}

export function configureAudioElement(audio, url, pageOrigin) {
  if (!audio) return audio
  const mode = audioCrossOriginForUrl(url, pageOrigin)
  if (mode) audio.crossOrigin = mode
  return audio
}
