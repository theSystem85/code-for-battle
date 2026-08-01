# Spec 013: Gas Station Explosion Damage Bounds

## Summary
When a gas station is destroyed, its explosion should severely damage nearby assets without instantly deleting construction yards. Construction yards must survive the blast with 10% health remaining to keep early-game softlock scenarios from happening.

## Requirements
- Gas station destruction triggers the existing explosion effect (radius: 5 tiles, constant damage) for nearby units/buildings.
- Construction yards hit by that explosion take **no more than 90% of their maximum health** as damage (i.e., they always retain at least 10% health after the blast if undamaged beforehand).
- Other buildings continue to receive the standard gas station explosion damage.
- The explosion configuration should remain centralized in the gas station destruction logic to avoid altering unrelated explosion behaviors.
- The 90%-of-maximum-health damage cap applies whether a construction yard is represented in the factory collection or the general building collection.
