# C-5 Galaxy airlift

The [approved Galaxy spec](../specs/140-c5-galaxy-airlift/spec.md) applies to `feat/c5-galaxy-airlift`.

The airstrip produces the Galaxy for 4,000 and reserves its three lower parking slots through departure and return. Its cargo controls follow the hovercraft. The map menu handles grounded unloading, boarding cancellation, and airdrop targeting.

Released cargo owns its descent state so it can finish landing after the aircraft is destroyed. The save format and multiplayer snapshot carry this state along with the cargo manifest and mission. The Galaxy has dedicated synthesized takeoff, touchdown, and cargo release cues.

## Remaining verification

- [ ] Add the approved Grok Imagine canopy at `public/images/map/units/c5_parachute_canopy.webp` and run `npm run make:prepared-sprites`. The preview currently draws temporary canopies and the dynamic suspension lines.
- [ ] Verify the repository’s 60 FPS acceptance criteria on a physical GPU during a drop with several vehicles descending and during fast map scrolling.
