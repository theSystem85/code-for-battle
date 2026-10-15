// "The Global Herald" story intro: one narration clip per newspaper section.
// Focus rectangles are in source-image pixels of
// public/images/story/global-herald-2038.webp (1536x1024). Durations are the
// measured ffprobe lengths of the matching clips in public/sound/story/.
export const STORY_IMAGE = {
  src: '/images/story/global-herald-2038.webp',
  width: 1536,
  height: 1024
}

export const STORY_SEGMENT_GAP_MS = 450

export const STORY_SEGMENTS = [
  {
    id: 'headline',
    audio: '/sound/story/herald_vo_01.mp3',
    durationMs: 7079,
    focus: { x: 0, y: 0, w: 1536, h: 290 },
    caption: 'The Global Herald. June 12, 2038. War erupts over mysterious blue crystals.'
  },
  {
    id: 'photo',
    audio: '/sound/story/herald_vo_02.mp3',
    durationMs: 10371,
    focus: { x: 257, y: 285, w: 1056, h: 470 },
    caption: 'A newly discovered resource, Kyronite, now fuels the rapid production of AI-controlled weapons. These are the first images from an extraction site in eastern Kazakhstan.'
  },
  {
    id: 'global-powers',
    audio: '/sound/story/herald_vo_03.mp3',
    durationMs: 10449,
    focus: { x: 12, y: 285, w: 248, h: 490 },
    caption: 'What began as isolated geological anomalies has escalated into a full-scale global conflict. Nations are locked in a desperate race to secure every deposit.'
  },
  {
    id: 'front-lines',
    audio: '/sound/story/herald_vo_04.mp3',
    durationMs: 11076,
    focus: { x: 1316, y: 285, w: 216, h: 495 },
    caption: 'The front lines now stretch across the globe: the Carpathian mountains of Eastern Europe, the steppes of Central Asia, the islands of the South Pacific, and the crystal fields of Africa.'
  },
  {
    id: 'kyronite-power',
    audio: '/sound/story/herald_vo_05.mp3',
    durationMs: 7889,
    focus: { x: 12, y: 768, w: 376, h: 236 },
    caption: 'Kyronite reorganizes matter at the molecular level. Energized, it accelerates manufacturing by up to 98 percent.'
  },
  {
    id: 'ai-war-machines',
    audio: '/sound/story/herald_vo_06.mp3',
    durationMs: 9874,
    focus: { x: 385, y: 776, w: 655, h: 228 },
    caption: 'Factories near the crystal sites now produce thousands of autonomous units every day. AI tanks, drone swarms and robotic infantry, born in minutes.'
  },
  {
    id: 'voices-of-concern',
    audio: '/sound/story/herald_vo_07.mp3',
    durationMs: 10919,
    focus: { x: 1040, y: 776, w: 492, h: 228 },
    caption: 'The Accord Council has called for an immediate ceasefire. Its Secretary-General warns: this is not just a war for land or power. This is a war for the future of humanity.'
  },
  {
    id: 'ticker',
    audio: '/sound/story/herald_vo_08.mp3',
    durationMs: 9796,
    focus: { x: 0, y: 930, w: 1536, h: 94 },
    caption: 'Markets collapse. The refugee crisis deepens. Cyberattacks strike the crystal grid. Commander, the battle for Kyronite begins now.'
  }
]

export function storyIntroTotalMs(segments = STORY_SEGMENTS, gapMs = STORY_SEGMENT_GAP_MS) {
  return segments.reduce((sum, segment) => sum + segment.durationMs + gapMs, 0)
}

// Camera transform that fits `focus` into the viewport (with margin) and
// centers it. Returned values apply to an element sized to the source image
// with transform-origin 0 0: translate(tx, ty) scale(scale).
export function focusTransform(focus, viewportWidth, viewportHeight, margin = 0.92) {
  const scale = Math.min(viewportWidth / focus.w, viewportHeight / focus.h) * margin
  const cx = focus.x + focus.w / 2
  const cy = focus.y + focus.h / 2
  return {
    scale,
    tx: viewportWidth / 2 - cx * scale,
    ty: viewportHeight / 2 - cy * scale
  }
}
