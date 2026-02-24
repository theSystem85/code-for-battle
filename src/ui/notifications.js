// notifications.js
// Handle notification display system

import { pushNotification } from './notificationHistory.js'

export function showNotification(message, duration = 3000, options = {}) {
  // Remove any existing notifications immediately
  document.querySelectorAll('.notification').forEach((el) => el.remove())

  const notification = document.createElement('div')
  notification.className = 'notification'

  // Add LLM indicator if llmPlayerId is provided
  if (typeof options.renderContent === 'function') {
    options.renderContent(notification, message)
  } else if (options.llmPlayerId) {
    notification.style.display = 'flex'
    notification.style.alignItems = 'center'
    notification.style.gap = '8px'

    const indicator = document.createElement('span')
    indicator.style.display = 'inline-flex'
    indicator.style.alignItems = 'center'
    indicator.style.justifyContent = 'center'
    indicator.style.width = '24px'
    indicator.style.height = '24px'
    indicator.style.borderRadius = '50%'
    indicator.style.backgroundColor = options.llmColor || '#FF0000'
    indicator.style.fontSize = '14px'
    indicator.style.lineHeight = '1'
    indicator.style.flexShrink = '0'
    indicator.textContent = '🤖'
    notification.appendChild(indicator)

    const textSpan = document.createElement('span')
    textSpan.textContent = message
    notification.appendChild(textSpan)
  } else {
    notification.textContent = message
  }

  notification.style.position = 'absolute'
  notification.style.top = '10px'
  notification.style.left = '50%'
  notification.style.transform = 'translateX(-50%)'
  notification.style.backgroundColor = 'rgba(0,0,0,0.7)'
  notification.style.color = 'white'
  notification.style.padding = '10px 15px'
  notification.style.borderRadius = '5px'
  notification.style.zIndex = '1000'

  document.body.appendChild(notification)

  // Push to persistent notification history
  const historyMessage = typeof options.historyMessage === 'string' ? options.historyMessage : message
  pushNotification(historyMessage, { llmPlayerId: options.llmPlayerId, llmColor: options.llmColor })

  // Fade out and remove
  setTimeout(() => {
    notification.style.opacity = '0'
    notification.style.transition = 'opacity 0.5s ease'
    setTimeout(() => notification.remove(), 500)
  }, duration)
}
