import { TYPES, STATUSES, VERIFICATION } from '../todo/schema.js'
import { loadTodos } from '../todo/publication.js'
import { VIEWS, filterTodos, todoCounts, availableToTest } from '../todo/views.js'

const pageSize = 35
const label = value => value.toLowerCase().replaceAll('_', ' ').replace(/^./, char => char.toUpperCase())

function element(tag, text, className) {
  const node = document.createElement(tag)
  if (text) node.textContent = text
  if (className) node.className = className
  return node
}

function button(text) {
  const control = element('button', text)
  control.type = 'button'
  return control
}

function options(select, items) {
  const previous = select.value
  select.replaceChildren(...items.map(([value, name]) => {
    const option = element('option', name)
    option.value = value
    return option
  }))
  if (items.some(([value]) => value === previous)) select.value = previous
}

function listSection(parent, heading, items = []) {
  if (!items.length) return
  const list = element('ul')
  list.append(...items.map(text => element('li', text)))
  parent.append(element('h4', heading), list)
}

function addTestPlan(parent, plan) {
  parent.append(element('h4', `Manual test plan · ${plan.minutes} min`))
  listSection(parent, 'Prerequisites', plan.prerequisites)
  listSection(parent, 'Setup', plan.setup)
  const steps = element('ol')
  for (const step of plan.steps) {
    const item = element('li')
    item.append(element('strong', `${step.id} · ${step.action}`), element('p', `Expected: ${step.expected}`))
    steps.append(item)
  }
  parent.append(steps)
  listSection(parent, 'Regression checks', plan.regressionChecks)
  if (plan.platforms.length) parent.append(element('p', `Platforms: ${plan.platforms.join(', ')}`))
  if (plan.scenario) parent.append(element('p', `Scenario: ${plan.scenario}`))
}

function details(record, titles, revisions) {
  const body = element('div', '', 'todo-panel__details')
  body.append(element('p', record.description, 'todo-panel__description'),
    element('p', [record.id, ...(record.legacyIds ?? []), label(record.type), `${label(record.priority)} priority`, record.complexity].filter(Boolean).join(' · ')),
    element('p', `Implementation: ${label(record.status)} · Manual verification: ${label(record.verificationStatus)}`))
  if (record.revision && record.status === 'IMPLEMENTED' && record.verificationStatus !== 'NOT_APPLICABLE') {
    const availability = revisions === null ? 'Local build · deployed availability unknown' :
      availableToTest(record, revisions) ? 'Available in this build' : 'Current revision unavailable in this build'
    body.append(element('p', `Revision ${record.revision} · ${availability}`))
  }
  if (record.blocker) body.append(element('p', `Blocked: ${record.blocker}`))
  listSection(body, 'Acceptance criteria', record.acceptanceCriteria)
  listSection(body, 'Clarification questions', record.questions)
  listSection(body, 'Dependencies', record.dependencies.map(id => titles.has(id) ? `${titles.get(id)} (${id})` : id))
  if (record.manualTestPlan) addTestPlan(body, record.manualTestPlan)
  listSection(body, 'Implementation notes', record.implementationNotes)
  listSection(body, 'Verification notes', record.verificationNotes)
  listSection(body, 'Verification history', record.verificationHistory.map(result =>
    `${result.at.slice(0, 10)} · Revision ${result.revision} · ${label(result.status)}${result.notes ? ` · ${result.notes}` : ''}`))
  listSection(body, 'Implementation references', record.implementationRefs)
  listSection(body, 'Related specifications', record.references)
  return body
}

/** FEAT-77361c9a334540aebba139bd2302efb5 — render backlog activity outside the game loop. */
export function createTodoPanel(panel, { load = loadTodos, revisions = import.meta.env.DEV ? null : __TODO_REVISIONS__ } = {}) {
  let snapshot
  let inFlight
  let listPage = 0
  let titles = new Map()
  const expanded = new Set()
  const state = { view: 'Open & QA', search: '', type: '', status: '', verification: '', subsystem: '', order: 'priority' }
  panel.classList.add('todo-panel')
  const overview = element('div', '', 'todo-panel__overview')
  const filters = element('div', '', 'todo-panel__filters')
  const quick = element('div', '', 'todo-panel__quick')
  const status = element('p', '', 'todo-panel__status')
  status.setAttribute('role', 'status')
  const listing = element('div', '', 'todo-panel__list')
  const pageNav = element('nav', '', 'todo-panel__quick')
  pageNav.setAttribute('aria-label', 'TODO pages')

  const change = (key, value) => {
    state[key] = value
    listPage = 0
    renderList()
  }
  function field(caption, key, items) {
    const wrapper = element('label', caption)
    const control = element(items ? 'select' : 'input')
    if (items) options(control, items)
    else control.type = 'search'
    control.addEventListener(items ? 'change' : 'input', () => change(key, control.value))
    wrapper.append(control)
    filters.append(wrapper)
    return control
  }
  const search = field('Search TODOs', 'search')
  const view = field('View', 'view', Object.keys(VIEWS).map(name => [name, name]))
  const all = (values, show = label) => [['', 'All'], ...values.map(value => [value, show(value)])]
  field('Implementation', 'status', all(STATUSES))
  field('Verification', 'verification', all(VERIFICATION))
  const subsystem = field('Subsystem', 'subsystem', all([]))
  field('Type', 'type', all(Object.keys(TYPES)))
  field('Sort by', 'order', [['priority', 'Priority'], ['created', 'Created'], ['updated', 'Last updated']])

  const refreshButton = button('Refresh')
  refreshButton.addEventListener('click', () => refresh())
  const awaiting = button('Awaiting QA')
  awaiting.addEventListener('click', () => {
    view.value = 'Awaiting QA'
    change('view', view.value)
  })
  quick.append(awaiting, refreshButton)
  panel.append(quick, overview, filters, status, listing, pageNav)

  function renderList() {
    awaiting.setAttribute('aria-pressed', String(state.view === 'Awaiting QA'))
    if (!snapshot) return
    const matches = filterTodos(snapshot.records, state, revisions)
    const pages = Math.ceil(matches.length / pageSize)
    listPage = Math.max(0, Math.min(listPage, pages - 1))
    listing.replaceChildren()
    pageNav.replaceChildren()
    if (!matches.length) listing.append(element('p', 'No matching TODOs.'))
    for (const record of matches.slice(listPage * pageSize, (listPage + 1) * pageSize)) {
      const entry = element('details', '', 'todo-panel__entry')
      const summary = element('summary')
      summary.append(element('strong', record.title),
        element('span', `${record.subsystem} · ${label(record.status)}`, 'todo-panel__entry-meta'))
      entry.append(summary)
      entry.open = expanded.has(record.id)
      const renderDetails = () => {
        if (entry.open && entry.childElementCount === 1) entry.append(details(record, titles, revisions))
      }
      renderDetails()
      entry.addEventListener('toggle', () => {
        if (!entry.isConnected) return
        if (entry.open) expanded.add(record.id)
        else expanded.delete(record.id)
        renderDetails()
      })
      listing.append(entry)
    }
    if (pages < 2) return
    const turn = (text, target) => {
      const control = button(text)
      control.disabled = target < 0 || target >= pages
      control.addEventListener('click', () => {
        listPage = target
        renderList()
        listing.scrollIntoView({ block: 'start', behavior: 'instant' })
        listing.querySelector('summary')?.focus()
      })
      return control
    }
    pageNav.append(turn('Previous', listPage - 1), element('span', `${listPage + 1} / ${pages} · ${matches.length} TODOs`),
      turn('Next', listPage + 1))
  }

  function refresh() {
    if (inFlight) return inFlight
    refreshButton.disabled = true
    status.textContent = snapshot ? 'Checking for TODO updates…' : 'Loading TODOs…'
    inFlight = load(snapshot).then(next => {
      if (next !== snapshot) {
        snapshot = next
        titles = new Map(next.records.map(record => [record.id, record.title]))
        const systems = [...new Set(next.records.map(record => record.subsystem))].sort()
        options(subsystem, all(systems, name => name))
        state.subsystem = subsystem.value
        overview.replaceChildren(...todoCounts(next.records, revisions).map(([name, count]) => element('span', `${name} ${count}`)))
        renderList()
      }
      status.textContent = next.records.length ? '' : 'The backlog is empty.'
    }).catch(() => {
      status.textContent = snapshot ? 'Could not refresh TODOs. Showing the last loaded data.' : 'Could not load TODOs. Try Refresh.'
    }).finally(() => {
      refreshButton.disabled = false
      inFlight = null
    })
    return inFlight
  }

  function find(id) {
    search.value = id
    view.value = 'All'
    for (const select of filters.querySelectorAll('select')) {
      if (select !== view && select.options[0]?.value === '') select.value = ''
    }
    Object.assign(state, { view: 'All', search: id, status: '', verification: '', subsystem: '', type: '' })
    expanded.add(id)
    listPage = 0
    renderList()
    panel.scrollTop = 0
  }

  return { refresh, find }
}
