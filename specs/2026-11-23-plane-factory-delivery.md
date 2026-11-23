# Plane Factory aircraft delivery

An operational Plane Factory unlocks the Apache, F-22 Raptor, F-35, and C-5 Galaxy. Aircraft use base production times with the existing power modifier. Helipads and airstrips serve as destinations.

The Apache, F-22, and F-35 roll through the shaded hangar gate. The C-5 appears past the apron with footprint clearance. The Apache and F-35 take off and use normal structure landing. The F-22 and C-5 taxi on connected street and airstrip tiles. A blocked taxi notification links to the affected aircraft, and the aircraft retries when streets are added. The Galaxy reserves three adjacent lower parking slots.

Check that the aircraft appear at the factory, that VTOL arrivals settle normally, and that paving beneath a blocked aircraft lets it resume taxiing. Verify the gate at DPR 1 and 3 and confirm that the C-5 clears the factory.

The delivery update uses one unit pass per simulation tick and prepares facility lookup tables only with deliveries active. Taxi routes are searched on dispatch and retried at one-second intervals. The prepared doorway shadow covers 24 × 28 logical pixels, or about 24 KiB at DPR 3. Hardware 75 FPS acceptance is pending on a verified GPU.
