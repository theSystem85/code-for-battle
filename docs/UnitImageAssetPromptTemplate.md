## 🧩 2D RTS Unit Asset Generation Prompt (True RGBA Transparency Version)

Generate every game-asset image with **Grok Imagine only** (Grok Bot: built-in GenerateImage; a coding agent prompted directly: the xAI Grok Imagine API). Never use ChatGPT, OpenAI, or any other image model.

If a coding agent is prompted directly, with no Grok Bot involved, that agent runs this whole art flow itself before implementing. If Grok Bot is orchestrating, Grok Bot does the art with the user first and hands the coding agent only the picked final images; the coding agent must not generate or replace art.

You will create two optimized images for a new 2D RTS game unit.
The user will specify the **unit name** (e.g., “recovery tank” or “mine clearance tank”).

Present **map-sprite options first** (8 varied options on one numbered contact sheet). Only after the user picks a map design, generate **8 fresh build-button options**. Each button is a completely new generation that matches the chosen shape and silhouette but uses its own ground-level or eye-level camera and lighting — never paste or composite the map sprite onto a desert background, and never keep the map-sprite camera. Units do not need a separate construction icon; the build button serves as that icon.

---

### Step 1: Generate Base Renders

#### A. Map Unit Render (Top-Down with Real Alpha Channel)

Photorealistic physically-based render (PBR) of a **[unit name]**, viewed from a **perfect 90° top-down orthographic perspective** — as if seen from a satellite or aircraft (air units follow the repo's nose-up map convention when that applies).
- Perspective: **Perfect 90° top-down orthographic**
- Orientation: Unit faces **downward (toward the bottom of the image)** unless an air-unit convention says otherwise
- Lighting: **Neutral daylight with soft shadows**, low contrast for gameplay clarity
- Style: **Realistic (not stylized or pixel-art)**
- Camouflage: Same materials, patterns, and colors as the later sidebar render
- **Background: True transparent alpha (RGBA)** — no fake checkerboard, no solid color, no white layer
- Scale: **2048×2048 px**
- Purpose: For use as a freely rotatable top-down sprite in a 2D RTS map
- Output Format: **PNG with true RGBA transparency**

#### B. Sidebar Build-Button Render

- Resolution: **2048×2048 px**
- Perspective: **Ground-level or eye-level hero shot** (front-left ¾ low-angle is a good default). Do not reuse the top-down map camera.
- Lighting: **Its own lighting**, typically bright desert daylight with soft shadows
- Background: **Desert environment under a blue sky (no transparency, opaque)**
- Style: **Photorealistic, physically-based render (PBR)** — realistic military photo look with dust, wear, and camouflage
- Output Format: **PNG (lossless, RGB)**

---

### Step 2: Post-Processing

1. **Sidebar Render**
   - Downscale to **255×255 px**
   - Convert to **WebP (quality 80%)**
   - Keep opaque background
   - Filename: `unitname_sidebar.webp`

2. **Map Render**
   - Downscale to **64×64 px**
   - Maintain real transparency
   - Convert to **WebP (quality 80%)**
   - Filename: `unitname_map.webp`

3. **Visual Consistency Checks**
   - Same geometry, materials, and camouflage between both renders
   - Top-down version clearly depicts the same unit from above
   - Silhouette must remain crisp and readable at small scale

---

### Step 3: Output Workflow

- Always **generate and present 8 map-sprite options first** as one numbered contact sheet
- Wait for the user to pick (or generate about 4 close variants if they ask to tweak a pick)
- Then **generate 8 fresh build-button options** from the chosen map design, each a new eye-level generation, and show one numbered contact sheet
- Wait for the user to pick the button
- Deliver both final `.webp` files ready for game integration

Commit or implement nothing until both picks are made. Commit images only if asked, and reference them in the spec. Show contact sheets to the user, not file paths. Check every image and mention weak options honestly.

---

Now render a new unit:
**mine clearance tank (no gun)**
→ Execute the map-first flow above automatically, using true RGBA transparency for the top-down render, and Grok Imagine only.
