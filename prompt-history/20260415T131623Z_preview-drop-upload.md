2026-04-15T13:16:23Z
Model: codex

Prompt:
Follow-up SSE fixes requested:
1) Add a `Background` checkbox next to `Loop` in animation preview to render preview over grass/map-like tile background.
2) Ensure image info bubble popover is layered above SSE rendering and not clipped at sidebar edge.
3) Ensure `sseAnimationPreviewPanel` is actually hidden (`display: none`) on Static tab.
4) Add drag-and-drop upload to SSE canvas (both Static/Animated): dropped image is loaded browser-only, added to dropdown, auto-selected, and not persisted.
