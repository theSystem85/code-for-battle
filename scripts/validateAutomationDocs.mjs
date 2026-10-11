/** Validate every published CFBL example against the same parser as the editor. */
import { readFileSync } from 'node:fs'
import { parseCFBL } from '../src/automation/cfbl/index.js'

let count = 0
for (const file of ['docs/cfbl-language-reference.md', 'docs/automation-tutorial.md']) {
  for (const [, source] of readFileSync(file, 'utf8').matchAll(/```cfbl\n([\s\S]*?)```/g)) {
    const result = parseCFBL(source, { languageVersion: 1 })
    if (result.diagnostics.length) throw new Error(`${file}: ${JSON.stringify(result.diagnostics)}`)
    count++
  }
}
console.log(`${count} CFBL documentation examples validated`)
