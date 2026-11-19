import { getStoredItem, setStoredItem } from '../storage/indexedDbStorage.js'

const REPORT_KEY = 'rts_graphics_tuner_report_v1'

export function loadGraphicsTunerReport() {
  try {
    const report = JSON.parse(getStoredItem(REPORT_KEY))
    return Array.isArray(report?.ranking) && report.recommendation?.settings ? report : null
  } catch {
    return null
  }
}

export function storeGraphicsTunerReport(report) {
  setStoredItem(REPORT_KEY, JSON.stringify(report))
}
