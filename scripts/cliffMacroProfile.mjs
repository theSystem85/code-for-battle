// Offline atlas geometry. Endpoint perturbations must vanish so successive
// straight macro strips meet with identical wall depth and lighting.
export function cliffMacroProfile(mask, u, variant) {
  const envelope = Math.sin(Math.PI * u) ** 2
  const directionalDepth = mask === 3 ? 108 : mask === 12 ? 64 : 92
  return {
    wave: envelope * (Math.sin(u * Math.PI * (2.4 + variant * .13) + variant) * 8 + Math.sin(u * 31 + variant * 2) * 3),
    roughness: envelope * (Math.sin(u * 47 + variant * 1.7) * 3 + Math.sin(u * 19) * 2),
    wallDepth: directionalDepth + envelope * (Math.sin(u * 13 + variant) * 9 + Math.sin(u * 29 + variant * 3) * 6),
    strataPhase: envelope * u * 8
  }
}
