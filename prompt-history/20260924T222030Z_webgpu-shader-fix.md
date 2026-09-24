2026-09-24T22:20:30Z

Cursor Grok 4.7. Token counts were not available for this run. Harness: Cursor cloud agent.

## Prompt

Follow-up on PR #702 (branch cursor/webgpu-default-renderer-1155). Push to the same branch/PR.

Patrick tested the PR in Chrome on an Apple Silicon Mac. With WebGPU selected explicitly, the settings show "WebGPU did not initialize. Using WebGL." His webgpureport.org output shows full WebGPU support (Metal-3 Apple adapter, requestAdapter/requestDevice/getContext("webgpu") successful, preferred canvas format bgra8unorm, maxBufferSize 4 GB, and timestamp-query). The failure is in our code and matches the headless Chrome result: the device was acquired, then the WebGPU shader/pipeline failed validation.

1. Root-cause the WebGPU init failure and fix it so WebGPU actually renders in headless Chrome. Keep the WebGL fallback.
2. When WebGPU fails, log the exact validation/compilation error as one `[WebGPU]` console line and show a short reason in the settings status.
3. Performance widget: active backend and fallback reason, VRAM from `adapter.limits.maxBufferSize` with a tooltip that it is not true video memory, VRAM in use for buffers and textures this renderer allocates, adapter vendor/architecture, canvas resolution and devicePixelRatio, draw calls per frame, and GPU frame time via timestamp-query when available.
4. Unit tests, `npm run lint:fix:changed`, `npm run test:unit`, and TODO/Features.md.
