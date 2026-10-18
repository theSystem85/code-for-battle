export const hotSwappable = true

export function safeUpdateText(info, swapped, modules) {
  const details = []
  if (modules) details.push(`${modules} code module${modules === 1 ? '' : 's'}`)
  if (swapped) details.push(`${swapped} stylesheet${swapped === 1 ? '' : 's'}`)
  const what = details.length ? details.join(' and ') : 'no visible changes'
  return `Update v${info.version} (${info.commit}) loaded live: ${what}. No reload needed.`
}

export function hotDispose() {
  return null
}

export function hotAccept() {}
