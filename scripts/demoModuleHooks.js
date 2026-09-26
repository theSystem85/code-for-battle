const stubUrl = new URL('./demoMainStub.js', import.meta.url).href

export async function resolve(specifier, context, nextResolve) {
  const resolved = await nextResolve(specifier, context)
  if (resolved.url.endsWith('/src/main.js')) {
    return { url: stubUrl, shortCircuit: true }
  }
  return resolved
}
