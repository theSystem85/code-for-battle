import { describe, it, expect, vi } from 'vitest'
import { createMapSettingsApplyController } from '../../src/ui/mapSettingsApply.js'

function setup(onApply = vi.fn()) {
  document.body.innerHTML = `
    <input id="seed" type="number" value="4">
    <input id="water" type="number" value="10">
    <input id="lake" type="checkbox" checked>
    <select id="biome"><option value="grass" selected>Grass</option><option value="snow">Snow</option></select>
    <button id="apply" type="button">Apply</button>`
  const $ = id => document.getElementById(id)
  const controller = createMapSettingsApplyController({
    inputs: [$('seed'), $('water'), $('lake'), $('biome')],
    button: $('apply'),
    fieldOf: input => (input.id === 'water' ? 'water' : null),
    onApply
  })
  const edit = (id, value) => {
    const input = $(id)
    if (input.type === 'checkbox') input.checked = value
    else input.value = value
    input.dispatchEvent(new Event('change'))
  }
  return { $, controller, edit, onApply }
}

describe('map settings Apply button', () => {
  it('starts disabled and enables once a value changes', () => {
    const { $, edit } = setup()
    expect($('apply').disabled).toBe(true)
    edit('seed', '5')
    expect($('apply').disabled).toBe(false)
    expect($('apply').getAttribute('aria-disabled')).toBe('false')
  })

  it('disables again when every edit is reverted', () => {
    const { $, edit } = setup()
    edit('lake', false)
    expect($('apply').disabled).toBe(false)
    edit('lake', true)
    expect($('apply').disabled).toBe(true)
  })

  it('does not regenerate on change; only the click applies, then disables', async() => {
    const onApply = vi.fn(async() => true)
    const { $, edit, controller } = setup(onApply)
    edit('biome', 'snow')
    edit('water', '20')
    expect(onApply).not.toHaveBeenCalled()
    $('apply').click()
    await vi.waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
    expect(onApply).toHaveBeenCalledWith('water')
    await vi.waitFor(() => expect($('apply').disabled).toBe(true))
    expect(controller.isDirty()).toBe(false)
  })

  it('ignores clicks while nothing changed', async() => {
    const { controller, onApply } = setup()
    expect(await controller.apply()).toBe(false)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('keeps edits pending when the apply is refused', async() => {
    const { $, edit, controller } = setup(vi.fn(() => false))
    edit('seed', '9')
    expect(await controller.apply()).toBe(false)
    expect($('apply').disabled).toBe(false)
    expect(controller.isDirty()).toBe(true)
  })

  it('keeps edits made while the map regenerates pending after Apply settles', async() => {
    let finish
    const { $, controller, edit } = setup(vi.fn(() => new Promise(resolve => { finish = resolve })))
    edit('seed', '5')
    const pending = controller.apply()
    expect($('apply').disabled).toBe(true)
    edit('water', '30')
    controller.resync() // e.g. the regeneration path resyncing mid-apply
    finish()
    await pending
    expect($('apply').disabled).toBe(false)
    edit('water', '10')
    expect($('apply').disabled).toBe(true)
  })
})
