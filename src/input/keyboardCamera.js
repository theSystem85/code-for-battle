import {
  KEYBOARD_SCROLL_SPEED,
  KEYBOARD_SCROLL_ACCELERATION,
  KEYBOARD_SCROLL_DECELERATION,
  KEYBOARD_SCROLL_AUTO_BRAKE
} from '../config.js'

export const CAMERA_REFERENCE_FPS = 60

// Scalar arithmetic only: two calls per camera frame, no entity/DPR multiplier
// and no allocations. Existing camera velocities are pixels per 60 Hz frame.
export function advanceKeyboardCameraVelocity(current, direction, seconds) {
  let velocity = current * CAMERA_REFERENCE_FPS
  if (direction === 0) {
    const speed = Math.max(0, Math.abs(velocity) - KEYBOARD_SCROLL_AUTO_BRAKE * seconds)
    return speed === 0 ? 0 : Math.sign(velocity) * speed / CAMERA_REFERENCE_FPS
  }
  if (velocity * direction < 0) {
    const stoppingTime = Math.abs(velocity) / KEYBOARD_SCROLL_DECELERATION
    if (seconds <= stoppingTime) {
      return (velocity - Math.sign(velocity) * KEYBOARD_SCROLL_DECELERATION * seconds) / CAMERA_REFERENCE_FPS
    }
    seconds -= stoppingTime
    velocity = 0
  }
  const target = direction * KEYBOARD_SCROLL_SPEED * CAMERA_REFERENCE_FPS
  const rate = Math.abs(velocity) > Math.abs(target) ? KEYBOARD_SCROLL_DECELERATION : KEYBOARD_SCROLL_ACCELERATION
  return (velocity + Math.sign(target - velocity) * Math.min(Math.abs(target - velocity), rate * seconds)) / CAMERA_REFERENCE_FPS
}
