export function lexCFBL(source) {
  const tokens = []
  const diagnostics = []
  const pattern = /\s+|[A-Za-z][A-Za-z0-9_-]*|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?|==|<=|>=|[{}();,.=<>]|./gy
  let match
  while ((match = pattern.exec(source))) {
    const value = match[0]
    if (/^\s+$/.test(value)) continue
    const start = match.index
    const end = start + value.length
    const type = /^[A-Za-z]/.test(value) ? 'keyword' : /^-?\d/.test(value) ? 'number' : /^[{}();,.=<>]+$/.test(value) ? 'punctuation' : 'invalid'
    tokens.push({ value, type, start, end })
    if (type === 'invalid') diagnostics.push({ code: 'illegal_token', message: `Illegal CFBL token ${value}.`, start, end, range: { start, end } })
  }
  tokens.push({ value: '', type: 'eof', start: source.length, end: source.length })
  return { tokens, diagnostics }
}
