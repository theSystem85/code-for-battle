const projects = [
  ['tc.foundation', 'Research Program', 2, [], 'Open the advanced research branches.', []],
  ['tc.autonomy', 'Autonomous Systems', 3, ['tc.foundation'], 'Unlock the Drone Factory and AI Center blueprints.', [
    ['droneFactory', 'Drone Factory', 'drone_factory_sidebar'],
    ['aiCenter', 'AI Center', 'ai_center_sidebar']
  ]],
  ['tc.orbit', 'Orbital Engineering', 4, ['tc.foundation'], 'Unlock the Rocket Launch Base and Spaceship Factory blueprints.', [
    ['rocketLaunchBase', 'Rocket Launch Base', 'rocket_launch_base_sidebar'],
    ['spaceshipFactory', 'Spaceship Factory', 'spaceship_factory_sidebar']
  ]],
  ['tc.aerospace', 'Aerospace Engineering', 3, ['tc.foundation'], 'Reserved for flight drones.', []]
]

export const RESEARCH_PERK_CATALOG = projects.map(([id, name, cost, prerequisites, summary, blueprints]) => ({
  id, name, cost, summary, tree: 'research', lane: prerequisites.length ? 'research' : 'start',
  requires: { all: prerequisites }, badge: `images/perks/${id}.webp`, manualAnchor: 'technology-research-center',
  howTo: 'Right-click or touch and hold your Technology Research Center, then choose Research Perks.',
  unlocks: { conditions: [], effects: [], options: [] },
  blueprints: blueprints.map(([type, name, image]) => ({ type, name, image }))
}))

// Keep Aerospace Engineering in the catalog for existing saves and replays.
export const RESEARCH_PERKS = RESEARCH_PERK_CATALOG.filter(perk => perk.id !== 'tc.aerospace')
