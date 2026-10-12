import { lexCFBL } from './lexer.js'
import { getCatalog } from './catalog.js'
import { validateCFBL } from './validation.js'
import { completionWaitKind } from '../../policies/policyEffects.js'

export class CFBLParser {
  constructor(source) {
    this.source = source
    this.tokens = lexCFBL(source).tokens
    this.position = 0
    this.variant = 'unit'
  }
  get token() { return this.tokens[this.position] }
  expect(values, slot = 'keyword', numericDomain) {
    const options = Array.isArray(values) ? values : [values]
    if (!options.includes(this.token.value)) {
      const problem = new Error(`Expected ${options.join(' or ')}, found ${this.token.value || 'end of input'}.`)
      Object.assign(problem, { code: 'expected_token', start: this.token.start, end: this.token.end, options, slot, numericDomain })
      throw problem
    }
    const token = this.tokens[this.position++]
    token.role = slot
    return token
  }
  take(value) { if (this.token.value !== value) return false; this.position++; return true }
  number(domain = {}, slot = 'number') {
    if (this.token.type !== 'number' || ['delay', 'state-reference', 'state-index'].includes(slot) && !/^(0|[1-9][0-9]*)$/.test(this.token.value)) this.expect([], slot, domain)
    const token = this.tokens[this.position++]
    token.role = slot
    const value = Number(token.value)
    if (!Number.isFinite(value) || domain.integer && !Number.isInteger(value) || domain.min != null && value < domain.min || domain.max != null && value > domain.max) {
      const problem = new Error(`Value must be ${domain.integer ? 'an integer ' : ''}between ${domain.min} and ${domain.max}.`)
      Object.assign(problem, { code: 'numeric_domain', start: token.start, end: token.end, options: [], slot, numericDomain: domain })
      throw problem
    }
    return value
  }
  call(kind) {
    const catalog = getCatalog(this.variant)[kind]
    const name = this.expect(Object.keys(catalog), kind).value
    const meta = catalog[name]
    this.expect('(')
    const params = {}
    if (this.token.type === 'eof') this.expect([...meta.params.map(param => param.key), ')'], 'parameter')
    const remaining = () => meta.params.filter(param => !Object.hasOwn(params, param.key))
    if (!this.take(')')) {
      do {
        const key = this.expect(remaining().map(param => param.key), 'parameter').value
        const param = meta.params.find(param => param.key === key)
        this.expect('=')
        params[key] = param.options ? this.expect(param.options.map(option => option.value), 'enum').value : this.number(param)
      } while (this.take(','))
      this.expect(')')
    }
    for (const param of meta.params) if (!Object.hasOwn(params, param.key)) params[param.key] = param.default
    return { name, params, meta }
  }
  unary() {
    if (this.take('not')) return { type: 'not', of: this.primary() }
    return this.primary()
  }
  primary() {
    const start = this.token.start
    const node = this.primaryValue()
    return { ...node, range: { start, end: this.tokens[this.position - 1].end } }
  }
  primaryValue() {
    if (this.take('(')) { const condition = this.expression(); this.expect(')'); return condition }
    const catalog = getCatalog(this.variant)
    const atoms = this.variant === 'unit' || this.variant === 'defence' ? ['always', 'enemyInRange', 'underFire'] : ['always']
    const name = this.token.value
    this.expect([...atoms, ...Object.keys(catalog.fields), ...Object.keys(catalog.checks), 'not', '('], 'condition')
    this.position--
    if (atoms.includes(name)) { this.position++; return { type: name } }
    if (catalog.checks[name]) {
      const call = this.call('checks')
      return { type: 'check', check: call.name, ...call.params }
    }
    const call = this.call('fields')
    this.expect('.')
    const mode = this.expect(call.meta.modes, 'mode').value
    this.expect(['==', '<=', '>=', '<', '>'], 'operator')
    const op = this.tokens[this.position - 1].value
    const range = mode === 'relative' ? call.meta.range : call.meta.absRange
    const value = this.number({ min: range[0], max: range[1] })
    return { type: 'compare', field: call.name, ...call.params, mode, op, value }
  }
  and() {
    const children = [this.unary()]
    while (this.take('and')) children.push(this.unary())
    return children.length === 1 ? children[0] : { type: 'and', of: children }
  }
  expression() {
    const children = [this.and()]
    while (this.take('or')) children.push(this.and())
    return children.length === 1 ? children[0] : { type: 'or', of: children }
  }
  condition() { this.expect('('); const value = this.expression(); this.expect(')'); return value }
  rule() {
    const start = this.token.start
    const kind = this.expect(['if', 'while', 'after'], 'rule').value
    let delaySeconds
    if (kind === 'after') { delaySeconds = this.number({ min: 1, max: 3600, integer: true }, 'delay'); this.expect('s'); this.expect('if') }
    const when = this.condition()
    const until = kind === 'while' && this.take('until') ? this.condition() : undefined
    this.expect('goto')
    const to = this.number({ min: 1, max: 7, integer: true }, 'state-reference')
    this.expect(';')
    let elseTo
    if (kind === 'if' && this.take('else')) { this.expect('goto'); elseTo = this.number({ min: 1, max: 7, integer: true }, 'state-reference'); this.expect(';') }
    return { kind, when, to, ...(delaySeconds == null ? {} : { delaySeconds }), ...(until ? { until } : {}), ...(elseTo == null ? {} : { elseTo }), range: { start, end: this.tokens[this.position - 1].end } }
  }
  parse() {
    const category = this.expect(['control', 'build'], 'category').value
    const target = this.expect(category === 'control' ? ['unit', 'defence-building'] : ['unit', 'building'], 'category').value
    this.variant = category === 'control' ? target === 'unit' ? 'unit' : 'defence' : target === 'unit' ? 'unitBuild' : 'build'
    this.expect('{'); this.expect('scope')
    const scope = this.expect(category === 'build' ? ['global'] : ['global', 'individual'], 'scope').value === 'individual' ? 'perUnit' : 'global'
    this.expect(';'); this.expect('run')
    const execution = this.expect(['continuous', 'once'], 'execution').value === 'once' ? 'oneTime' : 'continuous'
    this.expect(';'); this.expect('start')
    const initialStateId = this.number({ min: 1, max: 7, integer: true }, 'state-reference')
    this.expect(';')
    const states = []
    do {
      const start = this.expect('state').start
      const index = this.number({ min: 1, max: 7, integer: true }, 'state-index')
      this.expect('{'); this.expect('do')
      let effect = null
      if (this.token.type === 'eof') this.expect(['wait', ...Object.keys(getCatalog(this.variant).effects)], 'effects')
      if (!this.take('wait')) { const call = this.call('effects'); effect = { type: call.name, ...call.params } }
      const waitKind = effect && completionWaitKind(effect.type, this.variant)
      this.actionWaitKind = waitKind
      const ending = this.expect(waitKind ? ['wait', ';'] : [';'], 'action-end')
      if (ending.value === 'wait') {
        this.expect('until')
        this.expect(waitKind, 'completion-mode')
        effect.waitForCompletion = true
        this.expect(';')
      }
      const transitions = []
      while (this.token.value !== '}') {
        if (this.token.type === 'eof') this.expect(['if', 'while', 'after', '}'], 'rule')
        transitions.push(this.rule())
      }
      this.expect('}')
      states.push({ id: index, index, effect, transitions, range: { start, end: this.tokens[this.position - 1].end } })
    } while (this.token.value === 'state')
    if (this.token.type === 'eof') this.expect(['state', '}'], 'state')
    this.expect('}'); this.expect('')
    return { languageVersion: 1, variant: this.variant, scope, execution, initialStateId, states, range: { start: 0, end: this.source.length } }
  }
}
export function parseCFBL(source, { languageVersion = 1 } = {}) {
  const lexed = lexCFBL(source)
  if (languageVersion !== 1) return { tokens: lexed.tokens, diagnostics: [{ code: 'language_version', message: 'Only CFBL version 1 is supported.', start: 0, end: source.length, range: { start: 0, end: source.length } }] }
  if (lexed.diagnostics.length) return lexed
  const parser = new CFBLParser(source)
  try {
    const ast = parser.parse()
    const diagnostics = validateCFBL(ast)
    return { ast: diagnostics.length ? undefined : ast, tokens: parser.tokens, diagnostics }
  } catch (problem) {
    return { tokens: parser.tokens, diagnostics: [{ code: problem.code || 'invalid_program', message: problem.message, start: problem.start || 0, end: problem.end || 0, range: { start: problem.start || 0, end: problem.end || 0 } }] }
  }
}
