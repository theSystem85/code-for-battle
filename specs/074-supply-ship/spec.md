# Supply Ship

## Requirements

- The Supply Ship is a naval unit produced from Shipyards.
- The Supply Ship is visible/buildable only when the player has a Shipyard and at least one supply-enabling building: Gas Station, Hospital, Ammunition Factory, or Vehicle Workshop.
- The Supply Ship moves 30% faster than the Destroyer.
- It supports friendly nearby ships within a 2-tile radius while both ships are stationary.
- When ordered to guard/protect a friendly ship, it refreshes its water path frequently, stops stale guard paths inside its support radius, and stays within the 2-tile supply range.
- It can provide fuel, ammunition, crew, and repair tools only when the owning player has the corresponding building:
  - Gas Station enables fuel support.
  - Ammunition Factory enables ammunition support.
  - Hospital enables crew support.
  - Vehicle Workshop enables repair-tool health support.
- Each Supply Ship has finite cargo pools for crew, fuel, ammunition, and repair tools.
- The Supply Ship refills its own cargo pools only while stationary in a Shipyard service area, and only for cargo types whose corresponding supply building exists.
- The HUD represents loaded ammunition, fuel, and repair tools with three supply segments, while its hover tooltip lists those amounts plus crew capacity.
- In donut HUD mode, the supply quarter is split into three equal arcs for ammunition, fuel, and repair tools; the tooltip continues to list crew plus all three supplies.
- Selecting the Supply Ship renders its 2-tile supply radius.
- The sidebar build image uses a photorealistic elevated three-quarter military replenishment ship at sea, with the horizon inside the second quarter from the top, in 512x512 WebP format.
- The map image uses a strict top-down south-facing military replenishment ship with a transparent background in 256x256 WebP format.
