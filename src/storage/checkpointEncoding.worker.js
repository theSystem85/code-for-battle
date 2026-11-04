import { encodeCompactSave } from '../saveFormat.js'

let generation = -1
let rows = []
let configuration = {}

globalThis.onmessage = ({ data }) => {
  try {
    if (data.type === 'reset') {
      generation = data.generation
      rows = Array.from({ length: data.height }, () => new Array(data.width))
    } else if (data.type === 'configuration') {
      configuration = data.configuration
    } else if (data.generation === generation && data.type === 'chunk') {
      for (let y = 0; y < data.rows.length; y++) for (let x = 0; x < data.rows[y].length; x++) {
        rows[data.y + y][data.x + x] = data.rows[y][x]
      }
    } else if (data.generation === generation && data.type === 'encode') {
      const save = data.save
      save.state.gameState = { ...save.state.gameState, ...configuration }
      save.state.mapTileState = rows
      // Messages are ordered. Encoding finishes before a later patch can change
      // the worker's map, without cloning or serializing 40k tiles on the UI.
      const encoded = encodeCompactSave(save)
      globalThis.postMessage({ id: data.id, generation, encoded })
    }
  } catch (error) {
    globalThis.postMessage({ id: data.id, error: error.message })
  }
}
