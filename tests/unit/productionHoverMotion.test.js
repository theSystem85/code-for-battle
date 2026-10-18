import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'postcss'
import { beforeEach, describe, expect, it } from 'vitest'

const styles = readdirSync(resolve('styles')).filter(file => file.endsWith('.css'))
  .map(file => parse(readFileSync(resolve('styles', file), 'utf8')))
const sidebar = parse(readFileSync(resolve('styles/sidebar.css'), 'utf8'))

function reducedMotion(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && parent.name === 'media' && parent.params.includes('prefers-reduced-motion: reduce')) return true
  }
  return false
}

function matchesTarget(rule, targets) {
  if (rule.parent.type === 'atrule' && rule.parent.name.endsWith('keyframes')) return false
  // Match pseudo-element rules against their originating element; jsdom does
  // not implement browser-specific pseudo-elements such as range thumbs.
  return rule.selectors.some(selector => targets.some(target => target.matches(
    selector.replace(/::[-\w]+(?:\([^)]*\))?/g, '').replace(/:(?:hover|focus-visible)/g, '')
  )))
}

function duration(reduced) {
  let result
  sidebar.walkDecls('--production-hover-duration', declaration => {
    if (reducedMotion(declaration) === reduced) result = declaration.value
  })
  return result
}

describe('production hover motion contract', () => {
  let targets

  beforeEach(() => {
    document.body.innerHTML = `<button class="production-button unlocked">
      <div class="production-hover-sheet"><span class="building-name">Power Plant</span>
        <div class="production-hover-stats"><span>Cost: $2000</span></div></div>
      <div class="new-label">NEW</div><div class="batch-counter">2</div><div class="ready-counter">1</div>
    </button>`
    targets = [...document.querySelectorAll('.production-button, .production-button *')]
  })

  it('[U03484] keeps transform/opacity transitions at 300ms normally and 200ms with reduced motion', () => {
    expect(duration(false)).toBe('300ms')
    expect(duration(true)).toBe('200ms')
    const transitions = []
    sidebar.walkRules(rule => {
      if (!matchesTarget(rule, targets)) return
      rule.walkDecls('transition', declaration => transitions.push(declaration.value))
    })
    expect(transitions.length).toBeGreaterThan(0)
    for (const value of transitions) {
      for (const reduced of [false, true]) {
        const resolved = value.replaceAll('var(--production-hover-duration)', duration(reduced))
        for (const transition of resolved.split(',')) {
          expect(transition.trim()).toMatch(new RegExp(`^(transform|opacity) ${duration(reduced)} ease-out$`))
        }
      }
    }
  })

  it('[U03485] uses ease-in on hover/focus entry for all animated layers', () => {
    for (const state of [':hover', ':focus-visible']) {
      for (const target of targets.filter(element => !element.matches('button, .production-hover-stats span'))) {
        const entryRules = []
        sidebar.walkRules(rule => {
          if (!rule.selector.includes(state) || !matchesTarget(rule, [target])) return
          rule.walkDecls('transition-timing-function', declaration => entryRules.push(declaration.value))
        })
        expect(entryRules, `${state}: ${target.className}`).toContain('ease-in')
      }
    }
  })

  it('[U03486] has no reduced-motion transition reset matching the hover sheet or its layers in any stylesheet', () => {
    for (const root of styles) {
      root.walkRules(rule => {
        if (!reducedMotion(rule) || !matchesTarget(rule, targets)) return
        rule.walkDecls(/^transition(?:-duration|-property)?$/, declaration => {
          expect(declaration.value).not.toMatch(/\bnone\b|(?:^|\s|,)0(?:ms|s)(?:\s|,|$)/)
        })
      })
    }
  })
})
