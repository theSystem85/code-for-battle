# Supply Ship

## Requirements

- The Supply Ship is a naval unit produced from Shipyards.
- The Supply Ship is visible/buildable only when the player has a Shipyard and at least one supply-enabling building: Gas Station, Hospital, Ammunition Factory, or Vehicle Workshop.
- The Supply Ship moves 30% faster than the Destroyer.
- It supports friendly nearby ships within a 2-tile radius while both ships are stationary.
- It can provide fuel, ammunition, crew, and repair tools only when the owning player has the corresponding building:
  - Gas Station enables fuel support.
  - Ammunition Factory enables ammunition support.
  - Hospital enables crew support.
  - Vehicle Workshop enables repair-tool health support.
- Each Supply Ship has finite cargo pools for crew, fuel, ammunition, and repair tools.
- The Supply Ship refills its own cargo pools only while stationary in a Shipyard service area, and only for cargo types whose corresponding supply building exists.
- The HUD renders a combined four-segment supply-capacity bar and its hover tooltip lists all four current cargo amounts.
