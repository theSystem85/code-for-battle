export const SCHEMA_VERSION = 1
export const SHARDS = [...'01234567']
export const TYPES = {
  bug: 'BUG',
  feature: 'FEAT',
  improvement: 'IMP',
  refactoring: 'REF',
  performance: 'PERF',
  testing: 'TEST',
  documentation: 'DOC'
}
export const STATUSES = ['NEEDS_CLARIFICATION', 'READY', 'IN_PROGRESS', 'PARTIALLY_IMPLEMENTED', 'IMPLEMENTED', 'BLOCKED', 'CANCELLED']
export const VERIFICATION = ['NOT_APPLICABLE', 'NOT_TESTED', 'PASSED', 'FAILED', 'RETEST_REQUIRED']
export const PRIORITIES = ['critical', 'high', 'normal', 'low', 'untriaged']
export const COMPLEXITIES = ['XS', 'S', 'M', 'L', 'XL']
export const ID_PATTERN = /^(BUG|FEAT|IMP|REF|PERF|TEST|DOC)-[0-9a-f]{32}$/
export const PROMPT_PATTERN = /^[0-9a-f]{32}$/
export const isText = value => typeof value === 'string' && !!value.trim()
export const isTimestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value)
const isTextList = value => Array.isArray(value) && value.every(isText)
const isRevision = value => Number.isSafeInteger(value) && value >= 0
const isOptionalText = value => value === undefined || isText(value)

export function shardFor(id) {
  return SHARDS[Number.parseInt(id.at(-1), 16) % SHARDS.length]
}

export function parseRecords(raw) {
  return raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
}

function validPlan(plan) {
  return isObject(plan) && isTextList(plan.prerequisites) && isTextList(plan.setup) &&
    isTextList(plan.regressionChecks) && isTextList(plan.platforms) && isOptionalText(plan.scenario) &&
    Number.isFinite(plan.minutes) && plan.minutes > 0 &&
    Array.isArray(plan.steps) && plan.steps.length > 0 &&
    plan.steps.every(step => isObject(step) && isText(step.id) && isText(step.action) && isText(step.expected)) &&
    new Set(plan.steps.map(step => step.id)).size === plan.steps.length
}

/** FEAT-77361c9a334540aebba139bd2302efb5 — shared repository and browser validation. */
export function validateRecord(record) {
  const check = (condition, field) => {
    if (!condition) throw new Error(`Invalid TODO ${record?.id || '(unknown)'}: ${field}`)
  }
  check(isObject(record), 'record')
  const { id, type, status, verificationStatus, revision, lastVerifiedRevision } = record
  check(record.schemaVersion === SCHEMA_VERSION, 'schemaVersion')
  check(typeof id === 'string' && ID_PATTERN.test(id) && Object.hasOwn(TYPES, type), 'id/type')
  // An ID describes the original classification and survives reclassification.
  for (const field of ['title', 'description', 'subsystem']) check(isText(record[field]), field)
  for (const field of ['acceptanceCriteria', 'questions', 'references', 'implementationRefs', 'dependencies', 'promptIds', 'clarificationPromptIds']) {
    check(isTextList(record[field]), field)
  }
  for (const field of ['tags', 'legacyIds', 'implementationNotes', 'verificationNotes']) {
    check(record[field] === undefined || isTextList(record[field]), field)
  }
  for (const field of ['batchId', 'blocker']) check(isOptionalText(record[field]), field)
  check(isTimestamp(record.createdAt) && isTimestamp(record.updatedAt) && record.updatedAt >= record.createdAt, 'timestamps')
  check(PRIORITIES.includes(record.priority) && (record.complexity === null || COMPLEXITIES.includes(record.complexity)), 'priority/complexity')
  check(STATUSES.includes(status) && VERIFICATION.includes(verificationStatus), 'statuses')
  check(record.dependencies.every(dep => ID_PATTERN.test(dep) && dep !== id) && new Set(record.dependencies).size === record.dependencies.length, 'dependencies')
  check([...record.promptIds, ...record.clarificationPromptIds].every(prompt => PROMPT_PATTERN.test(prompt)), 'prompt references')
  check(isRevision(revision) && (status !== 'IMPLEMENTED' || revision > 0), 'revision')
  check(lastVerifiedRevision === null || (isRevision(lastVerifiedRevision) && lastVerifiedRevision > 0 && lastVerifiedRevision <= revision), 'lastVerifiedRevision')
  check(!['PASSED', 'FAILED'].includes(verificationStatus) || lastVerifiedRevision === revision, 'current verification revision')
  check(status !== 'READY' || (record.acceptanceCriteria.length > 0 && record.questions.length === 0 && record.complexity), 'ready requirements')
  check(status !== 'NEEDS_CLARIFICATION' || record.questions.length > 0, 'clarification questions')
  check(status !== 'BLOCKED' || isText(record.blocker), 'blocker')
  check(record.manualTestPlan === undefined || validPlan(record.manualTestPlan), 'manualTestPlan')
  check(Array.isArray(record.verificationHistory) && record.verificationHistory.every(result =>
    isObject(result) && ['PASSED', 'FAILED'].includes(result.status) && isRevision(result.revision) &&
    result.revision > 0 && result.revision <= revision && isTimestamp(result.at) && isOptionalText(result.notes)), 'verificationHistory')
  const latest = record.verificationHistory.at(-1)
  check(lastVerifiedRevision === (latest?.revision ?? null) &&
    (!['PASSED', 'FAILED'].includes(verificationStatus) || verificationStatus === latest?.status) &&
    (verificationStatus !== 'RETEST_REQUIRED' || (latest && latest.revision < revision)), 'verification history consistency')
  return record
}
