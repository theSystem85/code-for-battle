# Spec 144: Rocket Launch Base

The Rocket Launch Base uses the approved [map sprite](../public/images/map/buildings/rocket_launch_base_map.webp) and [sidebar art](../public/images/sidebar/rocket_launch_base_sidebar.webp). Its card appears after **Orbital Engineering**. Queuing and placement require a living Technology Research Center, a Radar Station, and the standard construction chain.

| Footprint | Cost | Power draw | HP | Armor | Limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3×3 | $7,500 | 180 | 650 | 2 | 1 per player |

The standard one-yard timer is 5.625 simulation seconds at normal power. The placed base provides its owner with 14 tiles of local reconnaissance centered on the structure in Shadow of War. This is an infrastructure benefit rather than a rocket unit or an attack. The tower and rocket are part of the existing artwork. A sold or destroyed base loses its extended sight, and previously discovered terrain remains known. Existing bases continue to provide reconnaissance after prerequisite loss.

Visibility uses the existing fog pass and tile mask, up to about 900 tile checks per tick for one operational base, independent of display DPI. Hardware frame-time acceptance is pending. Scripted opponents do not independently research and build this tier.
