# Fire spread, fuel and benchmark

One active fire record is allowed per tile. A successful spread event creates a fire on unlit fuel or adds one level to the existing fire, up to level five. Fire still grows every 20 simulation seconds. Spread boosts do not advance burn time. The five-second spread interval and downwind jump between buildings still apply.

Trees, woods and combustible decorative footprints are consumed after 30 simulation seconds if the fire is not extinguished. A consumed footprint disappears, stops blocking movement and cannot reignite. Farm, ruins and roadside decorations can ignite from eligible projectile impacts or neighboring fires. City buildings can ignite from attacks or spread onto their ground footprint and take normal fire damage until they are destroyed.

The first fire in an owned building’s footprint triggers a notification. Its building link centers the camera and also works from notification history. A building can alert again after all of its fires have gone out.

A unit takes 60% of its tile’s applicable fire damage and 30% from each burning orthogonal neighbor. Tanks take 20% of the on-tile damage applied to other units. Units above ground do not take tile fire damage.

In Settings, select **Fire benchmark** under **Performance benchmark**. It prepares a four-player battle with burning building and terrain tiles and fire engines, then scrolls across the map and reports 20 seconds of frame samples. Run on verified hardware with a display that can present at 60 FPS or higher. Record DPR, backend, FPS, p95/p99/max frame time, missed 16.67 ms deadlines, CPU update and render time, and GPU and memory data where available. Include cold and repeated traversal. Hardware acceptance remains pending.

Save games and replay baselines retain active fires, their severity boosts and consumed fuel. Playback resumes fire simulation using the replay's seeded random stream. In multiplayer the host applies fire damage, ignition and burnout, and clients receive the resulting fires, terrain and engine state.

CFBL unit and defence policies can use `onFire()`. Build and unit production policies can use `burningBuildingCount(buildingType=fireDepartment).absolute` to react to fires in their own base. Fire engines and departments are available in the applicable typed unit and building condition lists.

In the selected fire engine's detailed HUD, the ammo slot shows its water reserve in blue. Hovering over that slot shows the current amount and capacity.
