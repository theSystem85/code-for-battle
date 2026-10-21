# SSE transparent source extraction

Source uploads are inspected once for alpha values below 255. Sources with actual transparency use eight-connected alpha contours rather than RGB brightness. Opaque sources keep the existing near-black and inner-cuts extraction. Mixed uploads retain the settings for both source types; each source uses its own detected mode.

Transparent extraction defaults to alpha > 0, no gap bridging, and at least two foreground pixels. Click and bulk extraction share these settings. Optional alpha cutoff (0–254), bridge gap (0–2 pixels), and minimum component size allow users to suppress faint noise or group detached nearby details. Pixels are copied with their original RGBA values; transparent holes stay transparent, and black sprite pixels remain opaque. Bridging groups components without painting gaps. Separate disconnected parts beyond the bridge distance remain separate sprites.

New sheets start with transparent pixels and export to WebP with alpha by default. Growth, sprite anchor/size changes, clearing, removal and compaction preserve transparent backgrounds. Existing opaque targets retain their black background behavior. Existing targets with transparency reserve all visible pixels, including pure black, during occupancy detection.

The tag list uses nonshrinking, wrapping rows, fixed-size radio controls and independent vertical scrolling on desktop and mobile.

All image analysis runs on source load or explicit extraction actions, outside gameplay rendering. No new binary assets are required. Hardware GPU performance acceptance is pending on qualifying hardware.
