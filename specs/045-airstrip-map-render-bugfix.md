# Spec 045: Airstrip map rendering bugfix

## Overview
When placing or constructing an Airstrip, the building should render with its dedicated map sprite instead of the generic grey placeholder.

## Requirements
- Register an `airstrip` mapping in the building map image registry.
- The `airstrip` map image path must resolve to `images/map/buildings/airstrip_map.webp`.
- During construction and normal on-map rendering, Airstrip must use the mapped image and not the placeholder.

## Validation
- Start building an Airstrip and verify the visible construction/on-map sprite is `airstrip_map.webp`.
- Confirm no `No image mapping found for building type: airstrip` warning appears.
