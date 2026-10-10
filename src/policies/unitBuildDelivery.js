import { UNIT_DELIVERY_ORDERS } from './policyEffects.js'

let deliveryHandler = null
const knownDeliveries = new Set(UNIT_DELIVERY_ORDERS.map(item => item.value))

export function registerUnitBuildDeliveryHandler(handler) {
  deliveryHandler = typeof handler === 'function' ? handler : null
}

export function applyUnitBuildDelivery(unit, delivery) {
  if (!deliveryHandler || !unit || !knownDeliveries.has(delivery) || delivery === 'factoryRally') return false
  return deliveryHandler(unit, delivery) === true
}
