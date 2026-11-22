const projects = [
  ['tc.foundation', 'Research Program', 2, [], 'Open the three advanced research branches.', []],
  ['tc.autonomy', 'Autonomous Systems', 3, ['tc.foundation'], 'Unlock the Drone Factory and AI Center blueprints.', [
    ['droneFactory', 'Drone Factory', 'building', 'drone_factory_sidebar'],
    ['aiCenter', 'AI Center', 'building', 'ai_center_sidebar']
  ]],
  ['tc.orbit', 'Orbital Engineering', 4, ['tc.foundation'], 'Unlock the Rocket Launch Base and Spaceship Factory blueprints.', [
    ['rocketLaunchBase', 'Rocket Launch Base', 'building', 'rocket_launch_base_sidebar'],
    ['spaceshipFactory', 'Spaceship Factory', 'building', 'spaceship_factory_sidebar']
  ]],
  ['tc.aerospace', 'Aerospace Engineering', 3, ['tc.foundation'], 'Unlock the Plane Factory and C-5 Galaxy blueprints.', [
    ['planeFactory', 'Plane Factory', 'building', 'plane_factory_sidebar'],
    ['c5Galaxy', 'C-5 Galaxy', 'unit', 'c5_galaxy_sidebar']
  ]]
]

export const RESEARCH_PERKS = projects.map(([id, name, cost, prerequisites, summary, blueprints]) => ({
  id, name, cost, summary, tree: 'research', lane: prerequisites.length ? 'research' : 'start',
  requires: { all: prerequisites }, badge: `images/perks/${id}.webp`, manualAnchor: 'technology-research-center',
  howTo: 'Select your Technology Research Center and open Research.',
  unlocks: { conditions: [], effects: [], options: [] },
  blueprints: blueprints.map(([type, name, category, image]) => ({ type, name, category, image, perkId: id }))
}))
