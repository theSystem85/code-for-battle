// rendering/unitRenderer.js
import { TILE_SIZE, HARVESTER_CAPPACITY, HARVESTER_UNLOAD_TIME, RECOIL_DISTANCE, RECOIL_DURATION, MUZZLE_FLASH_DURATION, MUZZLE_FLASH_SIZE, TANK_FIRE_RANGE, ATTACK_TARGET_INDICATOR_SIZE, ATTACK_TARGET_BOUNCE_SPEED, UNIT_TYPE_COLORS, PARTY_COLORS, TANKER_SUPPLY_CAPACITY, UTILITY_SERVICE_INDICATOR_SIZE, UTILITY_SERVICE_INDICATOR_BOUNCE_SPEED, SERVICE_DISCOVERY_RANGE, SERVICE_SERVING_RANGE, MINE_DEPLOY_STOP_TIME, VIEW_FRUSTUM_MARGIN } from '../config.js'
import { gameState } from '../gameState.js'
import { selectedUnits } from '../inputHandler.js'
import { renderTankWithImages, areTankImagesLoaded } from './tankImageRenderer.js'
import { renderHarvesterWithImage, isHarvesterImageLoaded } from './harvesterImageRenderer.js'
import { renderRocketTankWithImage, isRocketTankImageLoaded } from './rocketTankImageRenderer.js'
import { renderHowitzerWithImage, isHowitzerImageLoaded } from './howitzerImageRenderer.js'
import { renderAmbulanceWithImage, isAmbulanceImageLoaded } from './ambulanceImageRenderer.js'
import { renderTankerTruckWithImage, isTankerTruckImageLoaded } from './tankerTruckImageRenderer.js'
import { renderRecoveryTankWithImage, isRecoveryTankImageLoaded } from './recoveryTankImageRenderer.js'
import { renderAmmunitionTruckWithImage, isAmmunitionTruckImageLoaded } from './ammunitionTruckImageRenderer.js'
import { renderMineLayerWithImage, isMineLayerImageLoaded } from './mineLayerImageRenderer.js'
import { renderMineSweeperWithImage, isMineSweeperImageLoaded } from './mineSweeperImageRenderer.js'
import { renderApacheWithImage } from './apacheImageRenderer.js'
import { renderF22WithImage, isF22ImageLoaded, preloadF22Images } from './f22ImageRenderer.js'
import { getExperienceProgress, initializeUnitLeveling, getBuildingIdentifier } from '../utils.js'

export class UnitRenderer {
  constructor() {
    this.repairIcon = null
    this.loadRepairIcon()
  }

  loadRepairIcon() {
    this.repairIcon = new Image()
    this.repairIcon.src = '/cursors/wrench_cursor.svg'
    this.repairIcon.onerror = () => {
      window.logger.warn('Failed to load workshop repair indicator icon')
      this.repairIcon = null
    }
  }

  renderUnitBody(ctx, unit, centerX, centerY) {
    if (unit.type === 'apache') {
      const rendered = renderApacheWithImage(ctx, unit, centerX, centerY)
      if (rendered) {
        // For Apache, adjust selection position to account for altitude lift
        const altitudeLift = (unit.altitude || 0) * 0.4
        const adjustedCenterY = centerY - altitudeLift
        this.renderUtilityServiceRange(ctx, unit, centerX, adjustedCenterY)
        this.renderSelection(ctx, unit, centerX, adjustedCenterY)
        this.renderAlertMode(ctx, unit, centerX, adjustedCenterY)
        return
      }
    }

    if (unit.type === 'f22Raptor') {
      if (!isF22ImageLoaded()) {
        preloadF22Images()
      }
      const rendered = renderF22WithImage(ctx, unit, centerX, centerY)
      if (rendered) {
        const altitudeLift = (unit.altitude || 0) * 0.4
        const adjustedCenterY = centerY - altitudeLift
        this.renderUtilityServiceRange(ctx, unit, centerX, adjustedCenterY)
        this.renderSelection(ctx, unit, centerX, adjustedCenterY)
        this.renderAlertMode(ctx, unit, centerX, adjustedCenterY)
        return
      }
    }

    // Use consistent colors for unit types regardless of owner
    ctx.fillStyle = UNIT_TYPE_COLORS[unit.type] || '#0000FF' // Default to blue if type not found

    // Draw rectangular body instead of circle
    const bodyWidth = TILE_SIZE * 0.7
    const bodyHeight = TILE_SIZE * 0.5

    // Save the current context state
    ctx.save()

    // Translate to center of unit and rotate
    ctx.translate(centerX, centerY)
    ctx.rotate(unit.direction)

    // Draw the rectangular body centered on the unit position
    ctx.fillRect(-bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight)

    // Draw front direction indicator (triangle) - use party color for this
    ctx.fillStyle = PARTY_COLORS[unit.owner] || PARTY_COLORS.player
    ctx.beginPath()
    ctx.moveTo(bodyWidth / 2, 0)
    ctx.lineTo(bodyWidth / 2 - 8, -8)
    ctx.lineTo(bodyWidth / 2 - 8, 8)
    ctx.closePath()
    ctx.fill()

    // Restore the context to its original state
    ctx.restore()
  }

  renderTurret(ctx, unit, centerX, centerY) {
    if (unit.type === 'apache' || unit.type === 'f22Raptor') {
      return
    }
    // Harvesters use image rendering. Show mining bar only if image not loaded
    if (unit.type === 'harvester') {
      if (!isHarvesterImageLoaded()) {
        this.renderHarvesterMiningBar(ctx, unit, centerX, centerY)
      }
      return
    }

    // Ambulances don't have turrets
    if (unit.type === 'ambulance') {
      return
    }

    const now = performance.now()

    // Special handling for rocket tanks - render fallback tubes only if image not loaded
    if (unit.type === 'rocketTank' && !isRocketTankImageLoaded()) {
      this.renderRocketTubes(ctx, unit, centerX, centerY, now)
      return
    }
    if (unit.type === 'recoveryTank' && !isRecoveryTankImageLoaded()) {
      // no special fallback
    }

    if (unit.type === 'howitzer') {
      return
    }

    // Calculate recoil offset
    let recoilOffset = 0
    if (unit.recoilStartTime && now - unit.recoilStartTime <= RECOIL_DURATION) {
      const progress = (now - unit.recoilStartTime) / RECOIL_DURATION
      // Use a smooth easing function for recoil
      const easedProgress = 1 - Math.pow(1 - progress, 3)
      recoilOffset = RECOIL_DISTANCE * (1 - easedProgress)
    }

    // Draw turret for combat units - use the turretDirection for rotation
    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.rotate(unit.turretDirection)

    // Apply recoil offset (move turret backwards)
    ctx.translate(-recoilOffset, 0)

    ctx.strokeStyle = '#000'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(TILE_SIZE / 2, 0)
    ctx.stroke()

    // Render muzzle flash
    if (unit.muzzleFlashStartTime && now - unit.muzzleFlashStartTime <= MUZZLE_FLASH_DURATION) {
      const flashProgress = (now - unit.muzzleFlashStartTime) / MUZZLE_FLASH_DURATION
      const flashAlpha = 1 - flashProgress
      const flashSize = MUZZLE_FLASH_SIZE * (1 - flashProgress * 0.5)

      ctx.save()
      ctx.globalAlpha = flashAlpha

      // Create radial gradient for muzzle flash
      const gradient = ctx.createRadialGradient(TILE_SIZE / 2, 0, 0, TILE_SIZE / 2, 0, flashSize)
      gradient.addColorStop(0, '#FFF')
      gradient.addColorStop(0.3, '#FF0')
      gradient.addColorStop(1, 'rgba(255, 165, 0, 0)')

      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(TILE_SIZE / 2, 0, flashSize, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    ctx.restore()
  }

  renderHarvesterMiningBar(ctx, unit, centerX, centerY) {
    // Only show mining bar when harvesting
    if (!unit.harvesting) return

    const now = performance.now()
    const miningProgress = unit.harvestTimer ?
      Math.sin((now - unit.harvestTimer) / 200) * 0.5 + 0.5 : 0  // Oscillating animation

    const barWidth = TILE_SIZE * 0.6
    const barHeight = 4
    const barExtension = miningProgress * (barWidth * 0.3) // Bar moves back and forth

    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.rotate(unit.direction) // Orient with the unit

    // Draw mining bar base
    ctx.fillStyle = '#444'
    ctx.fillRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight)

    // Draw moving part of the bar
    ctx.fillStyle = '#FFD700'
    ctx.fillRect(-barWidth / 2 + barExtension, -barHeight / 2, 8, barHeight)

    ctx.restore()
  }

  renderSelection(ctx, unit, centerX, centerY) {
    // Draw selection corner indicators if unit is selected (like buildings)
    if (unit.selected) {
      if (this.getSelectionHudMode() === 'modern-no-border') {
        return
      }

      if (this.isDonutSelectionHud()) {
        return
      }

      if (this.getSelectionHudMode() === 'legacy') {
        ctx.strokeStyle = '#FF0'
        ctx.lineWidth = 1

        const cornerSize = 8
        const offset = 2
        const halfTile = TILE_SIZE / 2

        const left = centerX - halfTile - offset
        const right = centerX + halfTile + offset
        const top = centerY - halfTile - offset
        const bottom = centerY + halfTile + offset

        ctx.beginPath()
        ctx.moveTo(left, top + cornerSize)
        ctx.lineTo(left, top)
        ctx.lineTo(left + cornerSize, top)
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(right - cornerSize, top)
        ctx.lineTo(right, top)
        ctx.lineTo(right, top + cornerSize)
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(left, bottom - cornerSize)
        ctx.lineTo(left, bottom)
        ctx.lineTo(left + cornerSize, bottom)
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(right - cornerSize, bottom)
        ctx.lineTo(right, bottom)
        ctx.lineTo(right, bottom - cornerSize)
        ctx.stroke()
        return
      }

      ctx.strokeStyle = '#FF0'
      ctx.lineWidth = 1

      const hudBounds = this.getSelectedHudBounds(centerX, centerY)

      ctx.beginPath()
      ctx.rect(
        hudBounds.left,
        hudBounds.top,
        hudBounds.right - hudBounds.left,
        hudBounds.bottom - hudBounds.top
      )
      ctx.stroke()
    }
  }

  getSelectedHudBounds(centerX, centerY) {
    const hudPadding = 6
    const halfHudSize = (TILE_SIZE / 2) + hudPadding

    return {
      left: centerX - halfHudSize,
      right: centerX + halfHudSize,
      top: centerY - halfHudSize,
      bottom: centerY + halfHudSize,
      width: halfHudSize * 2,
      height: halfHudSize * 2
    }
  }

  isPointInRect(x, y, rect) {
    if (!rect) return false
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
  }

  getHudBarRect(hudBounds, edge) {
    const barThickness = this.getSelectionHudBarThickness()
    const barSpan = TILE_SIZE * 0.75

    if (edge === 'top' || edge === 'bottom') {
      const y = edge === 'top'
        ? hudBounds.top - (barThickness / 2)
        : hudBounds.bottom - (barThickness / 2)
      const x = ((hudBounds.left + hudBounds.right) / 2) - (barSpan / 2)
      return { x, y, width: barSpan, height: barThickness }
    }

    const x = edge === 'left'
      ? hudBounds.left - (barThickness / 2)
      : hudBounds.right - (barThickness / 2)
    const y = ((hudBounds.top + hudBounds.bottom) / 2) - (barSpan / 2)
    return { x, y, width: barThickness, height: barSpan }
  }

  getHudCenter(unit, scrollOffset) {
    const altitudeLift = (unit.isAirUnit && unit.altitude) ? unit.altitude * 0.4 : 0
    const centerX = unit.x + TILE_SIZE / 2 - scrollOffset.x
    const centerY = unit.y + TILE_SIZE / 2 - scrollOffset.y - altitudeLift
    return { centerX, centerY, altitudeLift }
  }

  getLegacyVerticalHudBarRect(unit, scrollOffset, side) {
    const { centerX, centerY } = this.getHudCenter(unit, scrollOffset)
    const halfTile = TILE_SIZE / 2
    const cornerSize = 8
    const offset = 2
    const top = centerY - halfTile - offset
    const bottom = centerY + halfTile + offset
    const barWidth = this.getSelectionHudBarThickness()
    const barHeight = bottom - top - cornerSize * 2
    const barTop = top + cornerSize

    const x = side === 'left'
      ? centerX - halfTile - offset + 1
      : centerX + halfTile + offset - barWidth - 1

    return {
      x,
      y: barTop,
      width: barWidth,
      height: barHeight
    }
  }

  getLegacyTopBarRect(unit, scrollOffset, height = 4) {
    const { altitudeLift } = this.getHudCenter(unit, scrollOffset)
    const width = TILE_SIZE * 0.8
    return {
      x: unit.x + TILE_SIZE / 2 - scrollOffset.x - width / 2,
      y: unit.y - 10 - scrollOffset.y - altitudeLift,
      width,
      height
    }
  }

  getLegacyProgressBarRect(unit, scrollOffset) {
    const { altitudeLift } = this.getHudCenter(unit, scrollOffset)
    const width = TILE_SIZE * 0.8
    const height = unit.selected ? this.getSelectionHudBarThickness() : 3
    return {
      x: unit.x + TILE_SIZE / 2 - scrollOffset.x - width / 2,
      y: unit.y - 5 - scrollOffset.y - altitudeLift,
      width,
      height
    }
  }

  hasHudFuelBar(unit) {
    return unit.selected && typeof unit.maxGas === 'number'
  }

  hasHudAmmoBar(unit) {
    return unit.selected && (
      typeof unit.maxAmmunition === 'number' ||
      typeof unit.maxRocketAmmo === 'number' ||
      unit.type === 'mineLayer' ||
      unit.type === 'apache' ||
      unit.type === 'f22Raptor'
    )
  }

  hasHudBottomProgressBar(unit) {
    if (!unit.selected) return false
    if (unit.type === 'harvester' || unit.type === 'ambulance' || unit.type === 'tankerTruck' || unit.type === 'ammunitionTruck') return true
    if (unit.type === 'mineLayer') return Boolean(unit.deployingMine && unit.deployStartTime)

    initializeUnitLeveling(unit)
    return (unit.type !== 'harvester' && unit.level < 3)
  }

  getDonutEdgeLabelAtPoint(unit, scrollOffset, mouseScreenX, mouseScreenY) {
    const { centerX, centerY } = this.getHudCenter(unit, scrollOffset)
    const hudBounds = this.getSelectedHudBounds(centerX, centerY)
    const donutRadius = (Math.min(hudBounds.width, hudBounds.height) / 2) + 2
    const barThickness = this.getSelectionHudBarThickness()
    const ringHalf = Math.max(1, (barThickness - 2) / 2)
    const dx = mouseScreenX - centerX
    const dy = mouseScreenY - centerY
    const distance = Math.hypot(dx, dy)
    if (Math.abs(distance - donutRadius) > ringHalf + 1) {
      return null
    }

    const crewSize = 5
    const crewGap = 3
    const crewHalfSpanAngle = ((crewSize / 2) + crewGap) / donutRadius
    const angle = (Math.atan2(dy, dx) + (Math.PI * 2)) % (Math.PI * 2)
    const ranges = [
      { key: 'ammo', start: Math.PI + crewHalfSpanAngle, end: (Math.PI * 1.5) - crewHalfSpanAngle },
      { key: 'health', start: (Math.PI * 1.5) + crewHalfSpanAngle, end: (Math.PI * 2) - crewHalfSpanAngle },
      { key: 'fuel', start: crewHalfSpanAngle, end: (Math.PI / 2) - crewHalfSpanAngle },
      { key: 'experience', start: (Math.PI / 2) + crewHalfSpanAngle, end: Math.PI - crewHalfSpanAngle }
    ]
    const active = new Set(['health'])
    if (this.hasHudFuelBar(unit)) active.add('fuel')
    if (this.hasHudAmmoBar(unit)) active.add('ammo')
    if (this.hasHudBottomProgressBar(unit)) active.add('experience')

    const hit = ranges.find(r => active.has(r.key) && angle >= r.start && angle <= r.end)
    return hit ? hit.key : null
  }

  getCrewRects(unit, scrollOffset, hudBounds, centerX, centerY) {
    if (!unit?.crew) return []

    const size = 5
    const rectHeight = size * 2 * 0.7
    const aliveCrew = Object.entries(unit.crew).filter(([_role, alive]) => alive)
    if (aliveCrew.length === 0) return []

    if (this.isModernCornerCrewHud()) {
      const anchors = {
        driver: { cx: hudBounds.left, cy: hudBounds.top },
        commander: { cx: hudBounds.right, cy: hudBounds.top },
        gunner: { cx: hudBounds.left, cy: hudBounds.bottom },
        loader: { cx: hudBounds.right, cy: hudBounds.bottom }
      }
      return aliveCrew.map(([role], idx) => {
        const fallback = [
          { cx: hudBounds.left, cy: hudBounds.top },
          { cx: hudBounds.right, cy: hudBounds.top },
          { cx: hudBounds.left, cy: hudBounds.bottom },
          { cx: hudBounds.right, cy: hudBounds.bottom }
        ][idx % 4]
        const anchor = anchors[role] || fallback
        return {
          role,
          x: anchor.cx - (size / 2),
          y: anchor.cy - (rectHeight / 2),
          width: size,
          height: rectHeight
        }
      })
    }

    if (this.isDonutSelectionHud()) {
      const donutRadius = (Math.min(hudBounds.width, hudBounds.height) / 2) + 2
      const offsets = {
        commander: { x: 0, y: -donutRadius },
        gunner: { x: donutRadius, y: 0 },
        loader: { x: 0, y: donutRadius },
        driver: { x: -donutRadius, y: 0 }
      }
      return aliveCrew.map(([role], idx) => {
        const fallback = [
          { x: 0, y: -donutRadius },
          { x: donutRadius, y: 0 },
          { x: 0, y: donutRadius },
          { x: -donutRadius, y: 0 }
        ][idx % 4]
        const offset = offsets[role] || fallback
        const px = centerX + offset.x
        const py = centerY + offset.y
        return {
          role,
          x: px - (size / 2),
          y: py - (rectHeight / 2),
          width: size,
          height: rectHeight
        }
      })
    }

    if (this.isLegacySelectionHud()) {
      const baseX = unit.x - scrollOffset.x
      const baseY = unit.y + TILE_SIZE - scrollOffset.y
      return aliveCrew.map(([role], idx) => ({
        role,
        x: baseX + idx * (size + 2),
        y: baseY - rectHeight,
        width: size,
        height: rectHeight
      }))
    }

    const slotSpacing = size + 2
    const totalCrewWidth = (aliveCrew.length * size) + ((aliveCrew.length - 1) * 2)
    const baseX = centerX - (totalCrewWidth / 2)
    const baseY = hudBounds.bottom + 8

    return aliveCrew.map(([role], idx) => ({
      role,
      x: baseX + idx * slotSpacing,
      y: baseY - rectHeight,
      width: size,
      height: rectHeight
    }))
  }

  getHudHoverLabelForUnit(unit, scrollOffset, mouseScreenX, mouseScreenY) {
    if (!unit?.selected || unit.health <= 0) return null

    const altitudeLift = (unit.isAirUnit && unit.altitude) ? unit.altitude * 0.4 : 0
    const centerX = unit.x + TILE_SIZE / 2 - scrollOffset.x
    const centerY = unit.y + TILE_SIZE / 2 - scrollOffset.y - altitudeLift
    const hudBounds = this.getSelectedHudBounds(centerX, centerY)

    const crewRects = this.getCrewRects(unit, scrollOffset, hudBounds, centerX, centerY)
    for (const crewRect of crewRects) {
      if (this.isPointInRect(mouseScreenX, mouseScreenY, crewRect)) {
        return crewRect.role
      }
    }

    const hasFuel = this.hasHudFuelBar(unit)
    const canShowAmmo = this.hasHudAmmoBar(unit)
    const hasBottomProgress = this.hasHudBottomProgressBar(unit)

    if (this.isDonutSelectionHud()) {
      const donutLabel = this.getDonutEdgeLabelAtPoint(unit, scrollOffset, mouseScreenX, mouseScreenY)
      if (donutLabel) return donutLabel
    } else if (this.isLegacySelectionHud()) {
      if (this.isPointInRect(mouseScreenX, mouseScreenY, this.getLegacyTopBarRect(unit, scrollOffset))) {
        return 'health'
      }
      if (hasFuel && this.isPointInRect(mouseScreenX, mouseScreenY, this.getLegacyVerticalHudBarRect(unit, scrollOffset, 'right'))) {
        return 'fuel'
      }
      if (canShowAmmo && this.isPointInRect(mouseScreenX, mouseScreenY, this.getLegacyVerticalHudBarRect(unit, scrollOffset, 'left'))) {
        return 'ammo'
      }
      if (hasBottomProgress && this.isPointInRect(mouseScreenX, mouseScreenY, this.getLegacyProgressBarRect(unit, scrollOffset))) {
        return 'experience'
      }
    } else {
      if (this.isPointInRect(mouseScreenX, mouseScreenY, this.getHudBarRect(hudBounds, 'top'))) return 'health'
      if (hasFuel && this.isPointInRect(mouseScreenX, mouseScreenY, this.getHudBarRect(hudBounds, 'right'))) return 'fuel'
      if (canShowAmmo && this.isPointInRect(mouseScreenX, mouseScreenY, this.getHudBarRect(hudBounds, 'left'))) return 'ammo'
      if (hasBottomProgress && this.isPointInRect(mouseScreenX, mouseScreenY, this.getHudBarRect(hudBounds, 'bottom'))) return 'experience'
    }

    if (unit.type !== 'harvester' && unit.level > 0) {
      const starSize = 6
      const starSpacing = 8
      const totalWidth = (unit.level * starSpacing) - (starSpacing - starSize)
      const startX = (centerX - totalWidth / 2) + (this.isDonutSelectionHud() ? 2 : 0)
      const starY = this.isLegacySelectionHud()
        ? unit.y - 20 - scrollOffset.y
        : this.isDonutSelectionHud()
          ? hudBounds.top - 12
          : hudBounds.top - 3
      const starsRect = {
        x: startX - 1,
        y: starY - (starSize / 2) - 1,
        width: totalWidth + 2,
        height: starSize + 2
      }
      if (this.isPointInRect(mouseScreenX, mouseScreenY, starsRect)) {
        return 'rank stars'
      }
    }

    return null
  }

  renderHudHoverTooltip(ctx, units, scrollOffset) {
    if (!gameState?.desktopEdgeScroll?.overCanvas) return

    const mouseScreenX = gameState.cursorX - scrollOffset.x
    const mouseScreenY = gameState.cursorY - scrollOffset.y
    const selected = units.filter(unit => unit?.selected)
    if (selected.length === 0) return

    let label = null
    for (const unit of selected) {
      label = this.getHudHoverLabelForUnit(unit, scrollOffset, mouseScreenX, mouseScreenY)
      if (label) break
    }
    if (!label) return

    const tooltipText = label
    const fontSize = 9
    ctx.save()
    ctx.font = `${fontSize}px "Rajdhani", "Arial Narrow", sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'

    const paddingX = 4
    const paddingY = 2
    const textWidth = ctx.measureText(tooltipText).width
    const boxWidth = textWidth + paddingX * 2
    const boxHeight = fontSize + paddingY * 2

    let boxX = mouseScreenX + 8
    let boxY = mouseScreenY - boxHeight - 8
    if (boxX + boxWidth > ctx.canvas.width - 2) {
      boxX = mouseScreenX - boxWidth - 8
    }
    if (boxY < 2) {
      boxY = mouseScreenY + 8
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.lineWidth = 1
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight)
    ctx.fillStyle = '#FFF'
    ctx.fillText(tooltipText, boxX + paddingX, boxY + boxHeight / 2)
    ctx.restore()
  }

  drawHudEdgeBar(ctx, hudBounds, edge, ratio, color) {
    const clampedRatio = Math.max(0, Math.min(1, ratio))
    const barThickness = this.getSelectionHudBarThickness()
    const barSpan = TILE_SIZE * 0.75

    if (this.isDonutSelectionHud()) {
      const donutBarThickness = Math.max(1, barThickness - 2)
      const centerX = (hudBounds.left + hudBounds.right) / 2
      const centerY = (hudBounds.top + hudBounds.bottom) / 2
      const donutRadius = (Math.min(hudBounds.width, hudBounds.height) / 2) + 2
      const crewSize = 5
      const crewGap = 3
      const crewHalfSpanAngle = ((crewSize / 2) + crewGap) / donutRadius

      const arcRanges = {
        left: [Math.PI + crewHalfSpanAngle, (Math.PI * 1.5) - crewHalfSpanAngle],
        top: [(Math.PI * 1.5) + crewHalfSpanAngle, (Math.PI * 2) - crewHalfSpanAngle],
        right: [crewHalfSpanAngle, (Math.PI / 2) - crewHalfSpanAngle],
        bottom: [(Math.PI / 2) + crewHalfSpanAngle, Math.PI - crewHalfSpanAngle]
      }

      const selectedArc = arcRanges[edge]
      if (!selectedArc) return

      const [startAngle, endAngle] = selectedArc
      const sweep = endAngle - startAngle

      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineWidth = donutBarThickness
      ctx.strokeStyle = '#3A3A3A'
      ctx.beginPath()
      ctx.arc(centerX, centerY, donutRadius, startAngle, endAngle)
      ctx.stroke()

      if (clampedRatio > 0) {
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.arc(centerX, centerY, donutRadius, startAngle, startAngle + (sweep * clampedRatio))
        ctx.stroke()
      }

      ctx.restore()
      return
    }

    ctx.fillStyle = '#3A3A3A'

    if (edge === 'top' || edge === 'bottom') {
      const y = edge === 'top'
        ? hudBounds.top - (barThickness / 2)
        : hudBounds.bottom - (barThickness / 2)
      const barX = ((hudBounds.left + hudBounds.right) / 2) - (barSpan / 2)
      ctx.fillRect(barX, y, barSpan, barThickness)

      if (clampedRatio > 0) {
        ctx.fillStyle = color
        ctx.fillRect(barX, y, barSpan * clampedRatio, barThickness)
      }
      return
    }

    const x = edge === 'left'
      ? hudBounds.left - (barThickness / 2)
      : hudBounds.right - (barThickness / 2)
    const barY = ((hudBounds.top + hudBounds.bottom) / 2) - (barSpan / 2)
    ctx.fillRect(x, barY, barThickness, barSpan)

    if (clampedRatio > 0) {
      const fillHeight = barSpan * clampedRatio
      ctx.fillStyle = color
      ctx.fillRect(x, barY + barSpan - fillHeight, barThickness, fillHeight)
    }
  }

  getSelectionHudMode() {
    return gameState.selectionHudMode || 'modern'
  }

  getSelectionHudBarThickness() {
    const parsed = parseInt(gameState.selectionHudBarThickness, 10)
    if (!Number.isFinite(parsed)) {
      return 4
    }
    return Math.max(1, Math.min(8, parsed))
  }

  isLegacySelectionHud() {
    return this.getSelectionHudMode() === 'legacy'
  }

  isModernCornerCrewHud() {
    return this.getSelectionHudMode() === 'modern-no-border'
  }

  isDonutSelectionHud() {
    return this.getSelectionHudMode() === 'modern-donut'
  }

  renderUtilityServiceRange(ctx, unit, centerX, centerY) {
    if (!unit?.selected) return

    const rangeInTiles = unit?.isUtilityUnit ? SERVICE_SERVING_RANGE : undefined
    if (!rangeInTiles) return

    const radius = rangeInTiles * TILE_SIZE

    ctx.save()
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  renderAlertMode(ctx, unit, centerX, centerY) {
    if (!unit.alertMode || (unit.type !== 'tank-v2' && !unit.isUtilityUnit)) {
      return
    }

    const now = performance.now()
    const pulse = Math.sin(now * 0.005) * 0.3 + 0.7 // Pulsing effect between 0.4 and 1.0

    // Tank-v2 alert should only show the larger range indicator ring (no inner tile-sized ring).
    if (unit.type === 'tank-v2') {
      ctx.strokeStyle = `rgba(255, 100, 100, ${pulse * 0.35})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(centerX, centerY, TANK_FIRE_RANGE * TILE_SIZE, 0, 2 * Math.PI)
      ctx.stroke()
      return
    }

    // Utility units keep both the tile pulse and their larger discovery ring.
    ctx.strokeStyle = `rgba(255, 0, 0, ${pulse})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(centerX, centerY, TILE_SIZE / 2, 0, 2 * Math.PI)
    ctx.stroke()

    ctx.strokeStyle = `rgba(255, 100, 100, ${pulse * 0.3})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(centerX, centerY, SERVICE_DISCOVERY_RANGE * TILE_SIZE, 0, 2 * Math.PI)
    ctx.stroke()
  }

  renderHealthBar(ctx, unit, scrollOffset) {
    // Only show health bar if unit is damaged or selected
    const isDamaged = unit.health < unit.maxHealth
    const isSelected = unit.selected

    if (!isDamaged && !isSelected) {
      return
    }

    // Apply altitude adjustment for Apache helicopters to align with selection markers
    const altitudeLift = (unit.isAirUnit && unit.altitude) ? unit.altitude * 0.4 : 0

    // Draw health bar with party colors for owner distinction
    const unitHealthRatio = unit.health / unit.maxHealth

    if (unit.selected && !this.isLegacySelectionHud()) {
      const centerX = unit.x + TILE_SIZE / 2 - scrollOffset.x
      const centerY = unit.y + TILE_SIZE / 2 - scrollOffset.y - altitudeLift
      const hudBounds = this.getSelectedHudBounds(centerX, centerY)

      const healthColor = unitHealthRatio < 0.25
        ? '#FF0000'
        : (PARTY_COLORS[unit.owner] || PARTY_COLORS.player)

      this.drawHudEdgeBar(ctx, hudBounds, 'top', unitHealthRatio, healthColor)
      return
    }

    const healthBarWidth = TILE_SIZE * 0.8
    const healthBarHeight = 4
    const healthBarX = unit.x + TILE_SIZE / 2 - scrollOffset.x - healthBarWidth / 2
    const healthBarY = unit.y - 10 - scrollOffset.y - altitudeLift

    if (this.isLegacySelectionHud()) {
      ctx.strokeStyle = '#000'
      ctx.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight)
    }

    // Use red color for critically damaged units (below 25% health when speed penalty kicks in)
    // Otherwise use party colors for health bar fill
    if (unitHealthRatio < 0.25) {
      ctx.fillStyle = '#FF0000' // Red for critical health
    } else {
      ctx.fillStyle = PARTY_COLORS[unit.owner] || PARTY_COLORS.player
    }
    ctx.fillRect(healthBarX, healthBarY, healthBarWidth * unitHealthRatio, healthBarHeight)
  }

  renderHarvesterProgress(ctx, unit, scrollOffset) {
    // Handle harvester progress, ambulance crew, and experience progress for combat units
    let progress = 0
    let barColor = '#FFD700' // Default gold
    let shouldShowBar = false

    if (unit.type === 'harvester') {
      // Harvester-specific progress logic
      shouldShowBar = true

      if (unit.unloadingAtRefinery && unit.unloadStartTime) {
        // Show unloading progress (reverse direction)
        const unloadProgress = Math.min((performance.now() - unit.unloadStartTime) / HARVESTER_UNLOAD_TIME, 1)
        progress = 1 - unloadProgress // Reverse the progress
        barColor = '#FF6B6B' // Red-ish for unloading
      } else if (unit.harvesting && unit.harvestTimer) {
        // Show harvesting progress
        progress = Math.min((performance.now() - unit.harvestTimer) / 10000, 1)
        barColor = '#32CD32' // Green for harvesting
      } else {
        // Show current ore load
        progress = unit.oreCarried / HARVESTER_CAPPACITY
        barColor = '#FFD700' // Gold for ore
      }
    } else if (unit.type === 'ambulance') {
      // Ambulance crew loading bar
      shouldShowBar = true
      progress = (unit.medics || 0) / (unit.maxMedics || 10)
      barColor = '#00FFFF' // Cyan for ambulance crew
    } else if (unit.type === 'tankerTruck') {
      shouldShowBar = true
      progress = (unit.supplyGas || 0) / (unit.maxSupplyGas || TANKER_SUPPLY_CAPACITY)
      barColor = '#4A90E2'
    } else if (unit.type === 'ammunitionTruck') {
      shouldShowBar = true
      progress = (unit.ammoCargo || 0) / (unit.maxAmmoCargo || 500)
      barColor = '#FFA500' // Orange for ammunition
    } else if (unit.type === 'mineLayer') {
      // Mine Layer - show deployment progress when deploying
      if (unit.deployingMine && unit.deployStartTime) {
        shouldShowBar = true
        progress = Math.min((performance.now() - unit.deployStartTime) / MINE_DEPLOY_STOP_TIME, 1)
        barColor = '#FFFF00' // Yellow for deployment progress
      }
      // Don't show mine capacity here - it's on the left ammunition bar
    } else {
      // Combat unit experience progress
      initializeUnitLeveling(unit)
      const expProgress = getExperienceProgress(unit)

      // Only show experience bar for selected combat units below max level
      if (unit.level < 3 && unit.selected) {
        shouldShowBar = true
        progress = expProgress
        barColor = '#FFFF00' // Bright yellow for experience
      }
    }

    if (shouldShowBar) {
      if (unit.selected && !this.isLegacySelectionHud()) {
        const altitudeLift = (unit.isAirUnit && unit.altitude) ? unit.altitude * 0.4 : 0
        const centerX = unit.x + TILE_SIZE / 2 - scrollOffset.x
        const centerY = unit.y + TILE_SIZE / 2 - scrollOffset.y - altitudeLift
        const hudBounds = this.getSelectedHudBounds(centerX, centerY)

        this.drawHudEdgeBar(ctx, hudBounds, 'bottom', progress, barColor)
        return
      }

      // Apply altitude adjustment for Apache helicopters to align with health bar
      const altitudeLift = (unit.isAirUnit && unit.altitude) ? unit.altitude * 0.4 : 0

      const progressBarWidth = TILE_SIZE * 0.8
      const progressBarHeight = unit.selected ? this.getSelectionHudBarThickness() : 3
      const progressBarX = unit.x + TILE_SIZE / 2 - scrollOffset.x - progressBarWidth / 2
      const progressBarY = unit.y - 5 - scrollOffset.y - altitudeLift

      // Background bar
      ctx.fillStyle = '#333'
      ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight)

      // Progress fill
      ctx.fillStyle = barColor
      ctx.fillRect(progressBarX, progressBarY, progressBarWidth * progress, progressBarHeight)

      if (this.isLegacySelectionHud()) {
        ctx.strokeStyle = '#000'
        ctx.strokeRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight)
      }
    }
  }

  renderGasBar(ctx, unit, scrollOffset) {
    if (!unit.selected || typeof unit.maxGas !== 'number') return

    const ratio = unit.gas / unit.maxGas

    // Apply altitude adjustment for Apache helicopters to align with selection
    const altitudeLift = (unit.isAirUnit && unit.altitude) ? unit.altitude * 0.4 : 0

    const centerX = unit.x + TILE_SIZE / 2 - scrollOffset.x
    const centerY = unit.y + TILE_SIZE / 2 - scrollOffset.y - altitudeLift
    if (this.isLegacySelectionHud()) {
      const halfTile = TILE_SIZE / 2
      const cornerSize = 8
      const offset = 2

      const right = centerX + halfTile + offset
      const top = centerY - halfTile - offset
      const bottom = centerY + halfTile + offset

      const barWidth = this.getSelectionHudBarThickness()
      const barHeight = bottom - top - cornerSize * 2
      const barX = right - barWidth - 1
      const barTop = top + cornerSize

      ctx.fillStyle = '#333'
      ctx.fillRect(barX, barTop, barWidth, barHeight)

      const fillHeight = barHeight * ratio
      ctx.fillStyle = '#4A90E2'
      ctx.fillRect(barX, barTop + barHeight - fillHeight, barWidth, fillHeight)

      ctx.strokeStyle = '#000'
      ctx.strokeRect(barX, barTop, barWidth, barHeight)
      return
    }

    const hudBounds = this.getSelectedHudBounds(centerX, centerY)
    this.drawHudEdgeBar(ctx, hudBounds, 'right', ratio, '#4A90E2')
  }

  renderAmmunitionBar(ctx, unit, scrollOffset) {
    if (!unit.selected) return

    let ratio = 0
    let hasAmmo = false
    let barColor = '#FFA500' // Default orange color for ammunition
    let reloadRatio = null // Additional reload indicator for rocket tanks

    // Special handling for rocket tanks - show ammunition with reload overlay
    if (unit.type === 'rocketTank') {
      // Show ammunition as main bar fill
      if (typeof unit.maxAmmunition === 'number') {
        ratio = unit.ammunition / unit.maxAmmunition
        hasAmmo = true
      }
      barColor = '#FFA500' // Orange for ammunition

      // Calculate reload progress as overlay indicator
      const now = performance.now()
      const fireRate = 12000 // COMBAT_CONFIG.FIRE_RATES.ROCKET
      const timeSinceLastShot = unit.lastShotTime ? now - unit.lastShotTime : fireRate

      if (unit.burstState) {
        reloadRatio = 0 // Reloading (0%)
      } else {
        reloadRatio = Math.min(1, timeSinceLastShot / fireRate) // Progress toward next shot
      }
    } else if (unit.type === 'apache' || unit.type === 'f22Raptor') {
      // Check if unit is landed on a helipad/airstrip
      if (unit.landedHelipadId && gameState.buildings) {
        const pad = gameState.buildings.find(b =>
          (b.type === 'helipad' || b.type === 'airstrip') && getBuildingIdentifier(b) === unit.landedHelipadId
        )
        if (pad && typeof pad.maxAmmo === 'number' && pad.maxAmmo > 0) {
          ratio = Math.max(0, Math.min(1, (pad.ammo ?? pad.maxAmmo) / pad.maxAmmo))
          hasAmmo = true
        }
      }

      // If not landed or no pad ammo, show unit ammo
      if (!hasAmmo && typeof unit.maxRocketAmmo === 'number') {
        ratio = Math.max(0, Math.min(1, (unit.rocketAmmo ?? 0) / unit.maxRocketAmmo))
        hasAmmo = true
      }
    } else if (typeof unit.maxAmmunition === 'number') {
      // Regular units
      ratio = unit.ammunition / unit.maxAmmunition
      hasAmmo = true
    } else if (unit.type === 'mineLayer' && typeof unit.mineCapacity === 'number') {
      // Mine Layer - show mine capacity on left bar
      ratio = (unit.remainingMines || 0) / unit.mineCapacity
      hasAmmo = true
    }

    if (!hasAmmo) return

    // Apply altitude adjustment for Apache helicopters to align with selection
    const altitudeLift = (unit.isAirUnit && unit.altitude) ? unit.altitude * 0.4 : 0
    const centerX = unit.x + TILE_SIZE / 2 - scrollOffset.x
    const centerY = unit.y + TILE_SIZE / 2 - scrollOffset.y - altitudeLift

    if (this.isLegacySelectionHud()) {
      const halfTile = TILE_SIZE / 2
      const cornerSize = 8
      const offset = 2

      const left = centerX - halfTile - offset
      const top = centerY - halfTile - offset
      const bottom = centerY + halfTile + offset

      const barWidth = this.getSelectionHudBarThickness()
      const barHeight = bottom - top - cornerSize * 2
      const barX = left + 1
      const barTop = top + cornerSize

      ctx.fillStyle = '#333'
      ctx.fillRect(barX, barTop, barWidth, barHeight)

      const fillHeight = barHeight * ratio
      ctx.fillStyle = barColor
      ctx.fillRect(barX, barTop + barHeight - fillHeight, barWidth, fillHeight)

      if (reloadRatio !== null) {
        const reloadLineY = barTop + barHeight - (barHeight * reloadRatio)
        ctx.strokeStyle = '#FF0000'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(barX, reloadLineY)
        ctx.lineTo(barX + barWidth, reloadLineY)
        ctx.stroke()
      }

      ctx.strokeStyle = '#000'
      ctx.strokeRect(barX, barTop, barWidth, barHeight)
      return
    }

    const hudBounds = this.getSelectedHudBounds(centerX, centerY)
    this.drawHudEdgeBar(ctx, hudBounds, 'left', ratio, barColor)

    // Draw reload indicator overlay for rocket tanks (red 1px line)
    if (reloadRatio !== null && !this.isDonutSelectionHud()) {
      const barThickness = this.getSelectionHudBarThickness()
      const barSpan = TILE_SIZE * 0.75
      const barY = ((hudBounds.top + hudBounds.bottom) / 2) - (barSpan / 2)
      const barX = hudBounds.left - (barThickness / 2)
      const reloadLineY = barY + barSpan - (barSpan * reloadRatio)
      ctx.strokeStyle = '#FF0000' // Light blue
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(barX, reloadLineY)
      ctx.lineTo(barX + barThickness, reloadLineY)
      ctx.stroke()
    }
  }

  renderQueueNumber(_ctx, _unit, _scrollOffset) {
    // Queue numbers are now handled by the HarvesterHUD overlay
    // This function is kept for compatibility but no longer renders anything
  }

  renderGroupNumber(ctx, unit, scrollOffset) {
    // Draw group number if assigned.
    if (unit.groupNumber) {
      // Use green color if formation mode is active, else default white.
      ctx.fillStyle = unit.formationActive ? 'green' : '#FFF'
      ctx.font = '10px "Rajdhani", "Arial Narrow", sans-serif'
      ctx.textAlign = 'left'
      // Position at bottom left of unit rectangle.
      ctx.fillText(
        unit.groupNumber,
        unit.x + 2 - scrollOffset.x,
        unit.y + TILE_SIZE - 2 - scrollOffset.y
      )
    }
  }
  renderCrewStatus(ctx, unit, scrollOffset) {
    if (!unit.selected || !unit.crew) return

    const centerX = unit.x + TILE_SIZE / 2 - scrollOffset.x
    const centerY = unit.y + TILE_SIZE / 2 - scrollOffset.y
    const hudBounds = this.getSelectedHudBounds(centerX, centerY)
    const size = 5
    const colors = { driver: '#00F', gunner: '#F00', loader: '#FFA500', commander: '#006400' }
    const letters = { driver: 'D', gunner: 'G', loader: 'L', commander: 'C' }

    const aliveCrew = Object.entries(unit.crew).filter(([_role, alive]) => alive)
    if (aliveCrew.length === 0) return

    if (this.isModernCornerCrewHud()) {
      const rectHeight = size * 2 * 0.7
      const centerAnchors = {
        driver: { cx: hudBounds.left, cy: hudBounds.top },
        commander: { cx: hudBounds.right, cy: hudBounds.top },
        gunner: { cx: hudBounds.left, cy: hudBounds.bottom },
        loader: { cx: hudBounds.right, cy: hudBounds.bottom }
      }

      const fallbackAnchors = [
        { cx: hudBounds.left, cy: hudBounds.top },
        { cx: hudBounds.right, cy: hudBounds.top },
        { cx: hudBounds.left, cy: hudBounds.bottom },
        { cx: hudBounds.right, cy: hudBounds.bottom }
      ]

      ctx.save()
      aliveCrew.forEach(([role], idx) => {
        const anchor = centerAnchors[role] || fallbackAnchors[idx % fallbackAnchors.length]
        const x = anchor.cx - (size / 2)
        const y = anchor.cy + (rectHeight / 2)

        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
        ctx.fillRect(x - 1, y - rectHeight - 1, size + 2, rectHeight + 2)

        ctx.fillStyle = colors[role]
        ctx.fillRect(x, y - rectHeight, size, rectHeight)

        ctx.fillStyle = '#FFF'
        ctx.font = '4px "Rajdhani", "Arial Narrow", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(letters[role], x + size / 2, y - rectHeight / 2)
      })
      ctx.restore()
      return
    }

    if (this.isDonutSelectionHud()) {
      const rectHeight = size * 2 * 0.7
      const donutRadius = (Math.min(hudBounds.width, hudBounds.height) / 2) + 2
      const anchorOffsets = {
        commander: { x: 0, y: -donutRadius },
        gunner: { x: donutRadius, y: 0 },
        loader: { x: 0, y: donutRadius },
        driver: { x: -donutRadius, y: 0 }
      }

      const fallbackOffsets = [
        { x: 0, y: -donutRadius },
        { x: donutRadius, y: 0 },
        { x: 0, y: donutRadius },
        { x: -donutRadius, y: 0 }
      ]

      ctx.save()
      aliveCrew.forEach(([role], idx) => {
        const offset = anchorOffsets[role] || fallbackOffsets[idx % fallbackOffsets.length]
        const centerPx = centerX + offset.x
        const centerPy = centerY + offset.y
        const x = centerPx - (size / 2)
        const y = centerPy + (rectHeight / 2)

        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
        ctx.fillRect(x - 1, y - rectHeight - 1, size + 2, rectHeight + 2)

        ctx.fillStyle = colors[role]
        ctx.fillRect(x, y - rectHeight, size, rectHeight)

        ctx.fillStyle = '#FFF'
        ctx.font = '4px "Rajdhani", "Arial Narrow", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(letters[role], x + size / 2, y - rectHeight / 2)
      })
      ctx.restore()
      return
    }

    if (this.isLegacySelectionHud()) {
      const baseX = unit.x - scrollOffset.x
      const baseY = unit.y + TILE_SIZE - scrollOffset.y

      ctx.save()
      let idx = 0
      aliveCrew.forEach(([role]) => {
        const x = baseX + idx * (size + 2)
        const y = baseY
        const rectHeight = size * 2 * 0.7

        ctx.fillStyle = colors[role]
        ctx.fillRect(x, y - rectHeight, size, rectHeight)

        ctx.fillStyle = '#FFF'
        ctx.font = '4px "Rajdhani", "Arial Narrow", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(letters[role], x + size / 2, y - rectHeight / 2)

        idx++
      })
      ctx.restore()
      return
    }

    const baseY = hudBounds.bottom + 8
    const slotSpacing = size + 2
    const totalCrewWidth = (aliveCrew.length * size) + ((aliveCrew.length - 1) * 2)
    const baseX = centerX - (totalCrewWidth / 2)

    ctx.save()
    aliveCrew.forEach(([role], idx) => {
      const x = baseX + idx * slotSpacing
      const y = baseY

      const rectHeight = size * 2 * 0.7

      ctx.fillStyle = colors[role]
      ctx.fillRect(x, y - rectHeight, size, rectHeight)

      ctx.fillStyle = '#FFF'
      ctx.font = '4px "Rajdhani", "Arial Narrow", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(letters[role], x + size / 2, y - rectHeight / 2)
    })
    ctx.restore()
  }

  getBuildingForcedAttackQueuePosition(selectedBuilding, targetUnit) {
    if (!selectedBuilding || !selectedBuilding.isBuilding || !targetUnit) {
      return null
    }

    if (selectedBuilding.forcedAttackTarget?.id === targetUnit.id) {
      return 1
    }

    if (!Array.isArray(selectedBuilding.forcedAttackQueue)) {
      return null
    }

    const index = selectedBuilding.forcedAttackQueue.findIndex(target => target?.id === targetUnit.id)
    if (index === -1) {
      return null
    }

    return (selectedBuilding.forcedAttackTarget ? 2 : 1) + index
  }

  renderAttackTargetIndicator(ctx, unit, centerX, centerY) {
    // Check if this unit is in the attack group targets OR if it's currently being targeted by selected units
    const isInAttackGroupTargets = gameState.attackGroupTargets &&
                                   gameState.attackGroupTargets.some(target => target === unit)

    // Check if any selected unit is targeting this unit (for normal attacks and to show after reselection)
    const isTargetedBySelectedUnit = selectedUnits &&
                                     selectedUnits.some(selectedUnit =>
                                       (selectedUnit.target && selectedUnit.target.id === unit.id) ||
                                       (selectedUnit.attackQueue && selectedUnit.attackQueue.some(target => target.id === unit.id))
                                     )

    let forcedAttackQueuePosition = null
    if (Array.isArray(selectedUnits) && selectedUnits.length > 0) {
      selectedUnits.forEach(selectedUnit => {
        if (!selectedUnit?.selected || !selectedUnit?.isBuilding || selectedUnit.owner !== gameState.humanPlayer) {
          return
        }
        const position = this.getBuildingForcedAttackQueuePosition(selectedUnit, unit)
        if (position !== null) {
          forcedAttackQueuePosition = forcedAttackQueuePosition === null ? position : Math.min(forcedAttackQueuePosition, position)
        }
      })
    }

    // Show red indicator if: unit is in AGF targets OR being targeted by a selected unit OR queued by selected defense buildings
    const shouldShowAttackIndicator = isInAttackGroupTargets || isTargetedBySelectedUnit || forcedAttackQueuePosition !== null

    if (shouldShowAttackIndicator) {
      const now = performance.now()
      const bounceOffset = Math.sin(now * ATTACK_TARGET_BOUNCE_SPEED) * 3 // 3 pixel bounce

      // Position above the health bar
      const indicatorX = centerX
      const indicatorY = centerY - TILE_SIZE / 2 - 15 + bounceOffset

      // Draw semi-transparent red triangle (50% transparency, half size)
      ctx.save()
      ctx.fillStyle = 'rgba(255, 0, 0, 0.35)' // Reduced from 0.7 to 0.35
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)' // Reduced from 1.0 to 0.5
      ctx.lineWidth = 1

      const halfSize = ATTACK_TARGET_INDICATOR_SIZE / 2 // Half the original size

      // Draw triangle pointing down
      ctx.beginPath()
      ctx.moveTo(indicatorX, indicatorY + halfSize)
      ctx.lineTo(indicatorX - halfSize, indicatorY - halfSize)
      ctx.lineTo(indicatorX + halfSize, indicatorY - halfSize)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      if (forcedAttackQueuePosition !== null) {
        ctx.fillStyle = '#fff'
        ctx.font = '10px "Rajdhani", "Arial Narrow", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(forcedAttackQueuePosition), indicatorX, indicatorY - halfSize / 3 + 2)
      }

      ctx.restore()
    }
  }

  getUtilityQueuePosition(selectedUnit, targetUnit, overrideType = null) {
    if (!selectedUnit || !targetUnit || selectedUnit.id === targetUnit.id) {
      return null
    }

    const queue = selectedUnit.utilityQueue
    if (queue) {
      const targetType = overrideType || 'unit'
      const currentType = queue.currentTargetType || 'unit'
      if (queue.currentTargetId === targetUnit.id && currentType === targetType) {
        return 1
      }
      if (Array.isArray(queue.targets)) {
        const index = queue.targets.findIndex(entry => {
          if (!entry) return false
          if (typeof entry === 'object') {
            const entryType = entry.type || 'unit'
            return entry.id === targetUnit.id && entryType === targetType
          }
          return entry === targetUnit.id && targetType === 'unit'
        })
        if (index !== -1) {
          return (queue.currentTargetId ? 2 : 1) + index
        }
      }
    }

    switch (selectedUnit.type) {
      case 'recoveryTank':
        if (selectedUnit.repairTarget?.id === targetUnit.id) return 1
        if (selectedUnit.repairTargetUnit?.id === targetUnit.id) return 1
        if (selectedUnit.towedUnit?.id === targetUnit.id) return 1
        return null
      case 'ambulance':
        return selectedUnit.healingTarget?.id === targetUnit.id ? 1 : null
      case 'tankerTruck':
        if (selectedUnit.refuelTarget?.id === targetUnit.id) return 1
        if (selectedUnit.emergencyTarget?.id === targetUnit.id) return 1
        return null
      default:
        return null
    }
  }

  renderUtilityServiceIndicator(ctx, unit, centerX, centerY) {
    const isBeingServedByAmbulance = Boolean(unit?.beingServedByAmbulance)

    let queuePosition = null
    const hasSelectedUnits = Array.isArray(selectedUnits) && selectedUnits.length > 0

    // Avoid drawing duplicate utility indicators while path planning mode (Alt) is active.
    // However, still show active service indicators even when path planning is enabled.
    if (hasSelectedUnits && !gameState.altKeyDown) {
      selectedUnits.forEach(selectedUnit => {
        if (!selectedUnit?.selected) return
        if (!selectedUnit.type || (selectedUnit.type !== 'ambulance' && selectedUnit.type !== 'tankerTruck' && selectedUnit.type !== 'recoveryTank')) {
          return
        }
        const position = this.getUtilityQueuePosition(selectedUnit, unit)
        if (position !== null) {
          queuePosition = queuePosition === null ? position : Math.min(queuePosition, position)
        }
      })
    }

    if (!isBeingServedByAmbulance) {
      if (!hasSelectedUnits || gameState.altKeyDown || queuePosition === null) {
        return
      }
    }

    const now = performance.now()
    const bounceOffset = Math.sin(now * UTILITY_SERVICE_INDICATOR_BOUNCE_SPEED) * 3
    const baseIndicatorY = centerY - TILE_SIZE / 2 - 15 + bounceOffset
    const indicatorX = centerX
    const indicatorY = baseIndicatorY - UTILITY_SERVICE_INDICATOR_SIZE - 4
    const halfSize = UTILITY_SERVICE_INDICATOR_SIZE / 2

    ctx.save()
    ctx.fillStyle = 'rgba(255, 215, 0, 0.45)'
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.85)'
    ctx.lineWidth = 1

    ctx.beginPath()
    ctx.moveTo(indicatorX, indicatorY + halfSize)
    ctx.lineTo(indicatorX - halfSize, indicatorY - halfSize)
    ctx.lineTo(indicatorX + halfSize, indicatorY - halfSize)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    if (queuePosition !== null) {
      ctx.fillStyle = '#000'
      ctx.font = '10px "Rajdhani", "Arial Narrow", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(queuePosition), indicatorX, indicatorY - halfSize / 3 + 2)
    }

    ctx.restore()
  }

  renderWorkshopRepairIndicator(ctx, unit, centerX, centerY) {
    if (!unit?.repairingAtWorkshop) {
      return
    }

    const iconSize = TILE_SIZE * 0.75
    const bounce = Math.sin(performance.now() / 250) * 3
    const iconX = centerX - iconSize / 2
    const iconY = centerY - TILE_SIZE / 2 - iconSize - 6 + bounce

    ctx.save()
    if (this.repairIcon) {
      ctx.globalAlpha = 0.9
      ctx.drawImage(this.repairIcon, iconX, iconY, iconSize, iconSize)
    } else {
      ctx.fillStyle = 'rgba(255, 215, 0, 0.85)'
      ctx.strokeStyle = 'rgba(255, 165, 0, 0.9)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(centerX, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }

  renderLevelStars(ctx, unit, scrollOffset) {
    // Only render stars for combat units with levels > 0
    if (unit.type === 'harvester' || !unit.level || unit.level <= 0) {
      return
    }

    initializeUnitLeveling(unit)

    const altitudeLift = (unit.isAirUnit && unit.altitude) ? unit.altitude * 0.4 : 0
    const centerX = unit.x + TILE_SIZE / 2 - scrollOffset.x
    const centerY = unit.y + TILE_SIZE / 2 - scrollOffset.y - altitudeLift
    const hudBounds = this.getSelectedHudBounds(centerX, centerY)

    // Position stars directly over the health bar with slight overlap
    const starSize = 6
    const starSpacing = 8
    const totalWidth = (unit.level * starSpacing) - (starSpacing - starSize)
    const startX = (centerX - totalWidth / 2) + (this.isDonutSelectionHud() ? 2 : 0)
    const starY = this.isLegacySelectionHud()
      ? unit.y - 20 - scrollOffset.y
      : this.isDonutSelectionHud()
        ? hudBounds.top - 12
        : hudBounds.top - 3
    ctx.save()
    ctx.fillStyle = '#FFD700' // Gold color for stars
    ctx.strokeStyle = '#FFA500' // Orange outline
    ctx.lineWidth = 1

    for (let i = 0; i < unit.level; i++) {
      const starX = startX + (i * starSpacing)

      // Draw a simple 5-pointed star
      ctx.beginPath()
      for (let j = 0; j < 5; j++) {
        const angle = (j * 4 * Math.PI) / 5 - Math.PI / 2 // Start at top
        const outerRadius = starSize / 2
        const innerRadius = starSize / 4

        if (j === 0) {
          ctx.moveTo(starX + outerRadius * Math.cos(angle), starY + outerRadius * Math.sin(angle))
        } else {
          ctx.lineTo(starX + outerRadius * Math.cos(angle), starY + outerRadius * Math.sin(angle))
        }

        // Inner point
        const innerAngle = angle + (2 * Math.PI) / 10
        ctx.lineTo(starX + innerRadius * Math.cos(innerAngle), starY + innerRadius * Math.sin(innerAngle))
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }

    ctx.restore()
  }

  renderUnitBase(ctx, unit, scrollOffset, viewportWidth, viewportHeight) {
    if (!this.shouldRenderUnit(unit, scrollOffset, viewportWidth, viewportHeight)) return

    const centerX = unit.x + TILE_SIZE / 2 - scrollOffset.x
    const centerY = unit.y + TILE_SIZE / 2 - scrollOffset.y

    // Check if this is a tank type and if image rendering is enabled
    const isTank = ['tank_v1', 'tank-v2', 'tank-v3', 'tank_v2', 'tank_v3'].includes(unit.type)
    const useTankImage = gameState.useTankImages && isTank && areTankImagesLoaded(unit.type)

    if (unit.type === 'harvester' && isHarvesterImageLoaded()) {
      const ok = renderHarvesterWithImage(ctx, unit, centerX, centerY)
      if (ok) {
        this.renderUtilityServiceRange(ctx, unit, centerX, centerY)
        this.renderSelection(ctx, unit, centerX, centerY)
        this.renderAlertMode(ctx, unit, centerX, centerY)
        return
      }
    }

    if (unit.type === 'rocketTank' && isRocketTankImageLoaded()) {
      const ok = renderRocketTankWithImage(ctx, unit, centerX, centerY)
      if (ok) {
        this.renderUtilityServiceRange(ctx, unit, centerX, centerY)
        this.renderSelection(ctx, unit, centerX, centerY)
        this.renderAlertMode(ctx, unit, centerX, centerY)
        return
      }
    }

    if (unit.type === 'recoveryTank' && isRecoveryTankImageLoaded()) {
      const ok = renderRecoveryTankWithImage(ctx, unit, centerX, centerY)
      if (ok) {
        this.renderUtilityServiceRange(ctx, unit, centerX, centerY)
        this.renderSelection(ctx, unit, centerX, centerY)
        this.renderAlertMode(ctx, unit, centerX, centerY)
        return
      }
    }

    if (unit.type === 'ambulance' && isAmbulanceImageLoaded()) {
      const ok = renderAmbulanceWithImage(ctx, unit, centerX, centerY)
      if (ok) {
        this.renderUtilityServiceRange(ctx, unit, centerX, centerY)
        this.renderSelection(ctx, unit, centerX, centerY)
        this.renderAlertMode(ctx, unit, centerX, centerY)
        return
      }
    }

    if (unit.type === 'tankerTruck' && isTankerTruckImageLoaded()) {
      const ok = renderTankerTruckWithImage(ctx, unit, centerX, centerY)
      if (ok) {
        this.renderUtilityServiceRange(ctx, unit, centerX, centerY)
        this.renderSelection(ctx, unit, centerX, centerY)
        this.renderAlertMode(ctx, unit, centerX, centerY)
        return
      }
    }

    if (unit.type === 'ammunitionTruck' && isAmmunitionTruckImageLoaded()) {
      const ok = renderAmmunitionTruckWithImage(ctx, unit, centerX, centerY)
      if (ok) {
        this.renderUtilityServiceRange(ctx, unit, centerX, centerY)
        this.renderSelection(ctx, unit, centerX, centerY)
        this.renderAlertMode(ctx, unit, centerX, centerY)
        return
      }
    }

    if (unit.type === 'mineLayer' && isMineLayerImageLoaded()) {
      const ok = renderMineLayerWithImage(ctx, unit, centerX, centerY)
      if (ok) {
        this.renderSelection(ctx, unit, centerX, centerY)
        this.renderAlertMode(ctx, unit, centerX, centerY)
        return
      }
    }

    if (unit.type === 'mineSweeper' && isMineSweeperImageLoaded()) {
      const ok = renderMineSweeperWithImage(ctx, unit, centerX, centerY)
      if (ok) {
        this.renderSelection(ctx, unit, centerX, centerY)
        this.renderAlertMode(ctx, unit, centerX, centerY)
        return
      }
    }

    if (useTankImage) {
      // Try to render with images
      const imageRenderSuccess = renderTankWithImages(ctx, unit, centerX, centerY)

      if (imageRenderSuccess) {
        // Image rendering successful, still render other components
        this.renderUtilityServiceRange(ctx, unit, centerX, centerY)
        this.renderSelection(ctx, unit, centerX, centerY)
        this.renderAlertMode(ctx, unit, centerX, centerY)
        return
      }
      // If image rendering failed, fall through to original rendering
    }

    if (unit.type === 'howitzer' && isHowitzerImageLoaded()) {
      const ok = renderHowitzerWithImage(ctx, unit, centerX, centerY)
      if (ok) {
        this.renderUtilityServiceRange(ctx, unit, centerX, centerY)
        this.renderSelection(ctx, unit, centerX, centerY)
        this.renderAlertMode(ctx, unit, centerX, centerY)
        return
      }
    }

    // Handle Apache helicopter (always uses image rendering when available)
    if (unit.type === 'apache') {
      const ok = renderApacheWithImage(ctx, unit, centerX, centerY)
      if (ok) {
        // For Apache, adjust selection position to account for altitude lift
        const altitudeLift = (unit.altitude || 0) * 0.4
        const adjustedCenterY = centerY - altitudeLift
        this.renderUtilityServiceRange(ctx, unit, centerX, adjustedCenterY)
        this.renderSelection(ctx, unit, centerX, adjustedCenterY)
        this.renderAlertMode(ctx, unit, centerX, adjustedCenterY)
        return
      }
    }

    // Handle F22 Raptor (always uses image rendering when available)
    if (unit.type === 'f22Raptor') {
      if (!isF22ImageLoaded()) {
        preloadF22Images()
      }
      const ok = renderF22WithImage(ctx, unit, centerX, centerY)
      if (ok) {
        const altitudeLift = (unit.altitude || 0) * 0.4
        const adjustedCenterY = centerY - altitudeLift
        this.renderUtilityServiceRange(ctx, unit, centerX, adjustedCenterY)
        this.renderSelection(ctx, unit, centerX, adjustedCenterY)
        this.renderAlertMode(ctx, unit, centerX, adjustedCenterY)
        return
      }
    }

    // Original rendering method (for non-tanks or when image rendering is disabled/failed)
    this.renderUnitBody(ctx, unit, centerX, centerY)
    this.renderUtilityServiceRange(ctx, unit, centerX, centerY)
    this.renderSelection(ctx, unit, centerX, centerY)
    this.renderAlertMode(ctx, unit, centerX, centerY)
    this.renderTurret(ctx, unit, centerX, centerY)
  }

  renderUnitOverlay(ctx, unit, scrollOffset, viewportWidth, viewportHeight) {
    if (!this.shouldRenderUnit(unit, scrollOffset, viewportWidth, viewportHeight)) return

    const centerX = unit.x + TILE_SIZE / 2 - scrollOffset.x
    const centerY = unit.y + TILE_SIZE / 2 - scrollOffset.y

    this.renderHealthBar(ctx, unit, scrollOffset)
    this.renderGasBar(ctx, unit, scrollOffset)
    this.renderAmmunitionBar(ctx, unit, scrollOffset)
    this.renderLevelStars(ctx, unit, scrollOffset)
    this.renderHarvesterProgress(ctx, unit, scrollOffset)
    this.renderQueueNumber(ctx, unit, scrollOffset)
    this.renderGroupNumber(ctx, unit, scrollOffset)
    this.renderCrewStatus(ctx, unit, scrollOffset)
    this.renderAttackTargetIndicator(ctx, unit, centerX, centerY)
    this.renderUtilityServiceIndicator(ctx, unit, centerX, centerY)
    this.renderWorkshopRepairIndicator(ctx, unit, centerX, centerY)
    this.renderRecoveryProgressBar(ctx, unit, scrollOffset)
  }

  renderBases(ctx, units, scrollOffset) {
    const viewportWidth = ctx.canvas.width
    const viewportHeight = ctx.canvas.height
    units.forEach(unit => {
      this.renderUnitBase(ctx, unit, scrollOffset, viewportWidth, viewportHeight)
    })
  }

  renderOverlays(ctx, units, scrollOffset) {
    const viewportWidth = ctx.canvas.width
    const viewportHeight = ctx.canvas.height
    units.forEach(unit => {
      this.renderTowCable(ctx, unit, scrollOffset)
      this.renderFuelHose(ctx, unit, units, scrollOffset)
      this.renderAmmoHose(ctx, unit, units, scrollOffset)
      this.renderUnitOverlay(ctx, unit, scrollOffset, viewportWidth, viewportHeight)
      this.renderApacheRemoteReticle(ctx, unit, scrollOffset)
    })
    this.renderHudHoverTooltip(ctx, units, scrollOffset)
  }

  renderApacheRemoteReticle(ctx, unit, scrollOffset) {
    // Handle both Apache and Rocket Tank reticles
    if (!unit || (unit.type !== 'apache' && unit.type !== 'rocketTank')) {
      return
    }

    if (!unit.remoteReticleVisible || !unit.remoteRocketTarget) {
      return
    }

    const target = unit.remoteRocketTarget
    if (typeof target.x !== 'number' || typeof target.y !== 'number') {
      return
    }

    const screenX = target.x - scrollOffset.x
    const screenY = target.y - scrollOffset.y
    const size = 10

    ctx.save()
    ctx.strokeStyle = '#ff3b30'
    ctx.lineWidth = 2

    // For rocket tanks, rotate crosshair with unit direction
    if (unit.type === 'rocketTank') {
      ctx.translate(screenX, screenY)
      const direction = unit.turretDirection !== undefined ? unit.turretDirection : (unit.movement?.rotation || unit.direction || 0)
      ctx.rotate(direction)
      ctx.translate(-screenX, -screenY)
    }

    ctx.beginPath()
    ctx.moveTo(screenX - size, screenY)
    ctx.lineTo(screenX + size, screenY)
    ctx.moveTo(screenX, screenY - size)
    ctx.lineTo(screenX, screenY + size)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(screenX, screenY, size * 0.6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  renderFuelHose(ctx, unit, units, scrollOffset) {
    if (!unit || unit.type !== 'tankerTruck' || !unit.refuelTarget) {
      return
    }

    const targetInfo = unit.refuelTarget
    const target = (targetInfo && targetInfo.id !== undefined)
      ? units.find(u => u.id === targetInfo.id) || targetInfo
      : targetInfo

    if (!target || target.health <= 0) {
      return
    }

    if (typeof target.tileX !== 'number' || typeof target.tileY !== 'number') {
      return
    }

    const dx = Math.abs(target.tileX - unit.tileX)
    const dy = Math.abs(target.tileY - unit.tileY)

    if (dx > 1 || dy > 1) {
      return
    }

    if ((unit.movement && unit.movement.isMoving) || (target.movement && target.movement.isMoving)) {
      return
    }

    const startX = unit.x + TILE_SIZE / 2 - scrollOffset.x
    const startY = unit.y + TILE_SIZE / 2 - scrollOffset.y
    const targetX = (typeof target.x === 'number') ? target.x : target.tileX * TILE_SIZE
    const targetY = (typeof target.y === 'number') ? target.y : target.tileY * TILE_SIZE
    const endX = targetX + TILE_SIZE / 2 - scrollOffset.x
    const endY = targetY + TILE_SIZE / 2 - scrollOffset.y

    ctx.save()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.lineTo(endX, endY)
    ctx.stroke()
    ctx.restore()
  }

  renderAmmoHose(ctx, unit, units, scrollOffset) {
    if (!unit || unit.type !== 'ammunitionTruck' || !unit.ammoResupplyTarget) {
      return
    }

    const targetInfo = unit.ammoResupplyTarget
    const target = (targetInfo && targetInfo.id !== undefined)
      ? units.find(u => u.id === targetInfo.id) || targetInfo
      : targetInfo

    if (!target || (target.health !== undefined && target.health <= 0)) {
      return
    }

    if (typeof target.tileX !== 'number' || typeof target.tileY !== 'number') {
      return
    }

    const dx = Math.abs(target.tileX - unit.tileX)
    const dy = Math.abs(target.tileY - unit.tileY)

    if (dx > 1 || dy > 1) {
      return
    }

    if ((unit.movement && unit.movement.isMoving) || (target.movement && target.movement.isMoving)) {
      return
    }

    const startX = unit.x + TILE_SIZE / 2 - scrollOffset.x
    const startY = unit.y + TILE_SIZE / 2 - scrollOffset.y
    const targetX = (typeof target.x === 'number') ? target.x : target.tileX * TILE_SIZE
    const targetY = (typeof target.y === 'number') ? target.y : target.tileY * TILE_SIZE
    const endX = targetX + TILE_SIZE / 2 - scrollOffset.x
    const endY = targetY + TILE_SIZE / 2 - scrollOffset.y

    ctx.save()
    ctx.strokeStyle = '#8B4513' // Brown color for ammo hose
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.lineTo(endX, endY)
    ctx.stroke()
    ctx.restore()
  }

  renderTowCable(ctx, unit, scrollOffset) {
    if (!unit || !unit.towedWreck) return
    const wreck = unit.towedWreck
    const startX = unit.x + TILE_SIZE / 2 - scrollOffset.x
    const startY = unit.y + TILE_SIZE / 2 - scrollOffset.y
    const endX = wreck.x + TILE_SIZE / 2 - scrollOffset.x
    const endY = wreck.y + TILE_SIZE / 2 - scrollOffset.y

    ctx.save()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.lineTo(endX, endY)
    ctx.stroke()
    ctx.restore()
  }

  renderRecoveryProgressBar(ctx, unit, scrollOffset) {
    if (!unit || !unit.recoveryTask || unit.recoveryTask.mode !== 'recycle' || unit.recoveryTask.state !== 'recycling') {
      return
    }

    const progress = Math.max(0, Math.min(1, unit.recoveryProgress || 0))
    const barWidth = TILE_SIZE
    const barHeight = 4
    const x = unit.x - scrollOffset.x
    const y = unit.y - scrollOffset.y - 6

    ctx.save()
    ctx.fillStyle = 'rgba(30, 70, 140, 0.35)'
    ctx.fillRect(x, y, barWidth, barHeight)
    ctx.fillStyle = '#4BA6FF'
    ctx.fillRect(x, y, barWidth * progress, barHeight)
    ctx.strokeStyle = '#0D2A57'
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, barWidth, barHeight)
    ctx.restore()
  }

  shouldRenderUnit(unit, scrollOffset, viewportWidth, viewportHeight) {
    if (!unit || unit.health <= 0) return false

    // View frustum culling - skip units outside the visible viewport
    // This is the first check as it's the cheapest and most frequently eliminates entities
    if (scrollOffset && viewportWidth && viewportHeight) {
      const screenX = unit.x - scrollOffset.x
      const screenY = unit.y - scrollOffset.y
      const margin = VIEW_FRUSTUM_MARGIN

      if (
        screenX + TILE_SIZE < -margin ||
        screenY + TILE_SIZE < -margin ||
        screenX > viewportWidth + margin ||
        screenY > viewportHeight + margin
      ) {
        return false
      }
    }

    if (!gameState.shadowOfWarEnabled) {
      return true
    }

    const visibilityMap = gameState.visibilityMap
    if (!visibilityMap || !visibilityMap.length) {
      return true
    }

    const friendlyOwners = new Set([gameState.humanPlayer, 'player'])
    if (gameState.humanPlayer === 'player1') {
      friendlyOwners.add('player1')
    }

    if (friendlyOwners.has(unit.owner)) {
      return true
    }

    const tileX = Math.floor((unit.x + TILE_SIZE / 2) / TILE_SIZE)
    const tileY = Math.floor((unit.y + TILE_SIZE / 2) / TILE_SIZE)

    if (
      tileY < 0 ||
      tileY >= visibilityMap.length ||
      tileX < 0 ||
      tileX >= (visibilityMap[tileY]?.length || 0)
    ) {
      return false
    }

    const visibility = visibilityMap[tileY]?.[tileX]
    return Boolean(visibility && visibility.visible)
  }

  renderRocketTubes(ctx, unit, centerX, centerY, now) {
    // Draw 3 static rocket tubes on top of the tank
    ctx.save()
    ctx.translate(centerX, centerY)
    ctx.rotate(unit.direction) // Use body direction instead of turret direction

    // Calculate recoil offset for rocket tubes
    let recoilOffset = 0
    if (unit.recoilStartTime && now - unit.recoilStartTime <= RECOIL_DURATION) {
      const progress = (now - unit.recoilStartTime) / RECOIL_DURATION
      const easedProgress = 1 - Math.pow(1 - progress, 3)
      recoilOffset = RECOIL_DISTANCE * 0.5 * (1 - easedProgress) // Smaller recoil for rockets
    }

    // Apply recoil offset
    ctx.translate(-recoilOffset, 0)

    // Draw 3 rocket tubes in a row
    const tubeWidth = 3
    const tubeLength = TILE_SIZE * 0.4
    const tubeSpacing = 6

    for (let i = 0; i < 3; i++) {
      const tubeY = (i - 1) * tubeSpacing // Center tube at 0, others at +/- spacing

      ctx.fillStyle = '#444'
      ctx.fillRect(0, tubeY - tubeWidth / 2, tubeLength, tubeWidth)

      // Add tube caps
      ctx.fillStyle = '#222'
      ctx.fillRect(tubeLength - 2, tubeY - tubeWidth / 2, 2, tubeWidth)
    }

    // Render muzzle flash for rocket tubes
    if (unit.muzzleFlashStartTime && now - unit.muzzleFlashStartTime <= MUZZLE_FLASH_DURATION) {
      const flashProgress = (now - unit.muzzleFlashStartTime) / MUZZLE_FLASH_DURATION
      const flashAlpha = 1 - flashProgress
      const flashSize = MUZZLE_FLASH_SIZE * 0.8 * (1 - flashProgress * 0.5)

      ctx.save()
      ctx.globalAlpha = flashAlpha

      // Create muzzle flash for each tube
      for (let i = 0; i < 3; i++) {
        const tubeY = (i - 1) * tubeSpacing

        const gradient = ctx.createRadialGradient(tubeLength, tubeY, 0, tubeLength, tubeY, flashSize)
        gradient.addColorStop(0, '#FFF')
        gradient.addColorStop(0.3, '#FF0')
        gradient.addColorStop(0.7, '#FF4500')
        gradient.addColorStop(1, 'rgba(255, 69, 0, 0)')

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(tubeLength, tubeY, flashSize, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    ctx.restore()
  }
}
