import { PRIORITIES } from './schema.js'

const awaitingVerification = record => record.status === 'IMPLEMENTED' &&
  ['NOT_TESTED', 'RETEST_REQUIRED'].includes(record.verificationStatus)
export const availableToTest = (record, revisions) => revisions === null || revisions[record.id] === record.revision

export const VIEWS = {
  'Open & QA': record => !['IMPLEMENTED', 'CANCELLED'].includes(record.status) ||
    awaitingVerification(record) || record.verificationStatus === 'FAILED',
  Outstanding: record => !['IMPLEMENTED', 'CANCELLED'].includes(record.status),
  Ready: record => record.status === 'READY',
  'Needs clarification': record => record.status === 'NEEDS_CLARIFICATION',
  'Awaiting QA': (record, revisions) => awaitingVerification(record) && availableToTest(record, revisions),
  'Failed QA': record => record.verificationStatus === 'FAILED',
  'Retest required': record => record.verificationStatus === 'RETEST_REQUIRED',
  Completed: record => record.status === 'IMPLEMENTED' && ['PASSED', 'NOT_APPLICABLE'].includes(record.verificationStatus),
  All: () => true
}

export function todoCounts(records, revisions) {
  return [
    ['Outstanding', records.filter(VIEWS.Outstanding).length],
    ['Ready', records.filter(VIEWS.Ready).length],
    ['Needs clarification', records.filter(VIEWS['Needs clarification']).length],
    ['In progress', records.filter(record => record.status === 'IN_PROGRESS').length],
    ['Awaiting QA', records.filter(record => VIEWS['Awaiting QA'](record, revisions)).length],
    ['Failed QA', records.filter(VIEWS['Failed QA']).length],
    ['Retest required', records.filter(VIEWS['Retest required']).length]
  ]
}

export function filterTodos(records, { view, search, type, status, verification, subsystem, order }, revisions) {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return records.filter(record => {
    if (!VIEWS[view](record, revisions) || type && record.type !== type || status && record.status !== status ||
        verification && record.verificationStatus !== verification || subsystem && record.subsystem !== subsystem) return false
    if (!terms.length) return true
    const searchable = [record.id, record.title, record.description, record.subsystem, ...record.acceptanceCriteria,
      ...record.questions, ...(record.legacyIds ?? []), ...(record.tags ?? [])].join(' ').toLowerCase()
    return terms.every(term => searchable.includes(term))
  }).sort((a, b) => (order === 'created' ? b.createdAt.localeCompare(a.createdAt) :
    order === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) :
      PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority)) || a.id.localeCompare(b.id))
}
