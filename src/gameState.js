// gameState.js
import { DEFAULT_MAP_TILES_X, DEFAULT_MAP_TILES_Y } from './config.js'

export const gameState = {
  money: 12000,
  gameTime: 0,
  frameCount: 0, // Add frame counter for milestone checking
  wins: 0,
  losses: 0,
  gameStarted: false,
  gamePaused: true, // Changed from false to true to start paused
  gameOver: false,
  gameOverMessage: null,
  gameResult: null, // 'victory' or 'defeat'

  // Statistics tracking for game over screen
  playerUnitsDestroyed: 0,
  enemyUnitsDestroyed: 0,
  playerBuildingsDestroyed: 0,
  enemyBuildingsDestroyed: 0,
  totalMoneyEarned: 0,
  scrollOffset: { x: 0, y: 0 },
  dragVelocity: { x: 0, y: 0 },
  smoothScroll: {
    active: false,
    targetX: 0,
    targetY: 0
  },
  mapTilesX: DEFAULT_MAP_TILES_X,
  mapTilesY: DEFAULT_MAP_TILES_Y,
  mapEditMode: false,
  // Arrow key scrolling state
  keyScroll: { up: false, down: false, left: false, right: false },
  // ID of the unit the camera should follow when auto-focus is enabled
  cameraFollowUnitId: null,
  isRightDragging: false,
  lastDragPos: { x: 0, y: 0 },
  enemyLastProductionTime: performance.now(),
  lastOreUpdate: performance.now(),
  explosions: [],  // Initialized empty explosions array for visual effects.
  smokeParticles: [], // Smoke particles emitted by damaged units
  smokeParticlePool: [], // Reusable pool to avoid allocations during heavy smoke
  dustParticles: [], // Dust particles emitted by mine sweepers
  mineDeploymentPreview: null, // Active checkerboard drag rectangle (ephemeral)
  sweepAreaPreview: null, // Active sweep drag rectangle (ephemeral)
  mineFreeformPaint: null, // Set of painted tiles while Ctrl-dragging sweeps
  unitWrecks: [], // Destroyed unit remnants that can be recovered or recycled
  selectedWreckId: null, // Currently selected wreck (for UI feedback)
  mines: [], // Deployed land mines with position, owner, health, and arming status
  speedMultiplier: 1.0,  // Set to 1.0 as requested
  // Building related properties
  buildings: [],
  units: [], // Add units array to gameState
  factories: [], // Add factories array to gameState
  mapGrid: [], // Add mapGrid array to gameState
  occupancyMap: [], // Global occupancy map updated incrementally
  occupancyMapViewIndex: 0,
  occupancyMapViewMode: 'off',
  powerSupply: 0,
  // Separate power tracking for each side
  playerPowerSupply: 0,
  playerTotalPowerProduction: 0,
  playerPowerConsumption: 0,
  enemyPowerSupply: 0,
  enemyTotalPowerProduction: 0,
  enemyPowerConsumption: 0,
  // Build speed modifiers start at normal speed
  playerBuildSpeedModifier: 1.0,
  enemyBuildSpeedModifier: 1.0,
  buildingPlacementMode: false,
  currentBuildingType: null,
  mapEditRandomMode: true,
  cursorX: 0,
  cursorY: 0,
  desktopEdgeScroll: {
    clientX: 0,
    clientY: 0,
    overCanvas: false,
    lastMoveTime: 0,
    edgeHoverStart: null,
    lastAutoScrollTime: null
  },
  draggedBuildingType: null,
  draggedBuildingButton: null,
  // Drag and drop rally point for units
  draggedUnitType: null,
  draggedUnitButton: null,
  blueprints: [],
  // Chain build mode state
  chainBuildPrimed: false,
  chainBuildMode: false,
  chainStartX: 0,
  chainStartY: 0,
  chainBuildingType: null,
  chainBuildingButton: null,
  // Mobile freeform bulk building planning state
  mobileBuildPaintMode: false,
  mobileBuildPaintType: null,
  mobileBuildPaintButton: null,
  mobileBuildPaintTiles: [],
  shiftKeyDown: false,
  // Track option/alt key state for path planning
  altKeyDown: false,

  // Remote control key states for tanks
  remoteControl: {
    forward: 0,
    backward: 0,
    turnLeft: 0,
    turnRight: 0,
    turretLeft: 0,
    turretRight: 0,
    fire: 0
  },
  remoteControlSources: {
    forward: {},
    backward: {},
    turnLeft: {},
    turnRight: {},
    turretLeft: {},
    turretRight: {},
    fire: {}
  },
  remoteControlAbsolute: {
    wagonDirection: null,
    wagonSpeed: 0,
    turretDirection: null,
    turretTurnFactor: 0
  },
  remoteControlAbsoluteSources: {},

  // Repair mode
  repairMode: false,
  sellPlanCancellationPreview: null,
  buildingsUnderRepair: [],

  // Track active invite buttons per party so UI state persists after re-render
  hostInviteStatus: {},

  // Enemy AI learning
  playerBuildHistory: null,  // Will be initialized from localStorage if available
  currentSessionId: null,    // Will be set when first building is placed
  enemyLastBuildingTime: 0,  // Track when enemy last built something

  // Radar station status - initialize to false (no radar at game start)
  radarActive: false,

  // Shadow of war visibility state (disabled by default for new games)
  shadowOfWarEnabled: false,
  visibilityMap: [],

  // Grid visibility toggle - initialize to false (grid hidden by default)
  gridVisible: false,

  // Occupancy map visibility toggle
  occupancyVisible: false,

  // Movement waypoint visualization toggle
  moveWaypointsVisible: true,

  // Performance dialog visibility toggle
  performanceVisible: false,

  // Performance measurement frame limiter toggle (default ON = refresh-rate capped)
  frameLimiterEnabled: true,
  // Animate minimap radar-offline grain/snow effect
  radarOfflineAnimationEnabled: true,


  // LLM usage tracking (per session)
  llmUsage: {
    totalTokens: 0,
    totalCostUsd: 0,
    byModel: {}
  },
  llmStrategic: null,
  llmCommentary: null,

  // Benchmark state
  benchmarkActive: false,

  dangerZoneMaps: {},
  dzmOverlayIndex: -1,

  // FPS display toggle and tracking
  fpsVisible: false,
  fpsCounter: {
    frameCount: 0,
    lastTime: 0,
    fps: 0,
    frameTimes: [],  // Store last 60 frame times for smooth averaging
    avgFrameTime: 0,
    minFrameTime: 0,
    maxFrameTime: 0
  },

  // Tank image rendering toggle - initialize from config
  useTankImages: true,

  // Turret image rendering toggle - initialize from config
  useTurretImages: true,

  // Cheat dialog state
  cheatDialogOpen: false,

  // Help dialog state
  helpDialogOpen: false,

  // Runtime config dialog state
  runtimeConfigDialogOpen: false,

  // Selected unit HUD render mode (legacy, modern, modern-no-border, modern-donut)
  selectionHudMode: 'modern-donut',

  // Selected unit HUD bar thickness (in px)
  selectionHudBarThickness: 4,

  // Index for round-robin vehicle spawning
  nextVehicleFactoryIndex: 0,

  // Refinery state tracking
  refineryStatus: {}, // Tracks which refineries are being used and by which harvester
  refineryRevenue: {}, // Tracks total revenue per refinery (by refinery id)

  // Attack Group Feature (AGF) state
  attackGroupMode: false,
  attackGroupStart: { x: 0, y: 0 },
  attackGroupEnd: { x: 0, y: 0 },
  attackGroupTargets: [], // Array of enemy units to be attacked
  disableAGFRendering: false, // Flag to temporarily disable AGF rendering

  // Shared AI attack point updated periodically
  globalAttackPoint: null,
  lastGlobalAttackDecision: 0,

  // Multiplayer settings
  playerCount: 2,  // Number of players (2-4)
  humanPlayer: 'player1',  // Which player is controlled by human
  partyStates: [], // Tracks per-party metadata for invites and AI/human control
  gameInstanceId: null, // UUID tied to this running match
  hostId: null, // Identifier for the current host browser/session
  multiplayerSession: {
    isRemote: false,
    alias: null,
    inviteToken: null,
    status: 'idle',
    connectedAt: null,
    localRole: 'host'
  },

  // Track defeated players for sound effects
  defeatedPlayers: new Set(),

  // Spectator mode for defeated multiplayer players
  isSpectator: false,
  spectatorShadowOfWarDisabled: false,
  localPlayerDefeated: false, // True when local player is defeated in multiplayer
  _defeatSoundPlayed: false, // Guard to prevent defeat sound from looping

  // Multiplayer settings (host-controlled)
  showEnemyResources: false, // Whether to show enemy power/money on their construction yards

  // Initially no units are available (require vehicle factory), only basic buildings
  availableUnitTypes: new Set([]),
  availableBuildingTypes: new Set(['constructionYard', 'oreRefinery', 'powerPlant', 'vehicleFactory', 'vehicleWorkshop', 'radarStation', 'hospital', 'helipad', 'gasStation', 'turretGunV1', 'concreteWall']),
  newUnitTypes: new Set(),
  newBuildingTypes: new Set(),

  // Flag to refresh production buttons after building destruction
  pendingButtonUpdate: false,

  // Store current map seed so map generation stays consistent across restarts
  mapSeed: '1',

  // Lockstep deterministic multiplayer state (spec 015)
  lockstep: {
    enabled: false,             // Whether lockstep mode is active
    currentTick: 0,             // Current simulation tick number
    sessionSeed: null,          // Shared RNG seed for this session
    hashInterval: 10,           // Ticks between hash exchanges
    lastHashTick: 0,            // Last tick a hash was computed
    desyncDetected: false,      // True if desync detected
    desyncTick: null,           // Tick at which desync occurred
    pendingResync: false,       // Waiting for resync from host
    tickAccumulator: 0,         // Time accumulator for fixed timestep
    lastTickTime: 0,            // Timestamp of last tick processing
    inputDelay: 3,              // Ticks of input delay for network
    peerStates: {},             // Per-peer tick and hash info
    localInputQueue: [],        // Local inputs waiting to be sent
    confirmedInputs: {},        // Inputs confirmed for each tick
    stateHistory: [],           // Recent state snapshots for rollback
    historyLength: 60           // Ticks of history to maintain
  }
}
