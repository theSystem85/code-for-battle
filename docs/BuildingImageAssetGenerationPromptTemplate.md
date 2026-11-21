Generate every game-asset image with **Grok Imagine only** (Grok Bot: built-in GenerateImage; a coding agent prompted directly: the xAI Grok Imagine API). Never use ChatGPT, OpenAI, or any other image model.

If a coding agent is prompted directly, with no Grok Bot involved, that agent runs this whole art flow itself before implementing. If Grok Bot is orchestrating, Grok Bot does the art with the user first and hands the coding agent only the picked final images; the coding agent must not generate or replace art.

If the user did **not specify** the footprint, **ask first**:
> “What is the footprint size of this building (in tiles, e.g., 2x2 or 3x4)?”

Each tile = **64×64 px**, so:
- 1×1 → 64×64 px
- 2×2 → 128×128 px
- 3×3 → 192×192 px
- 4×4 → 256×256 px
...and so on.

This determines the **final downscaled map sprite resolution**.

---

### 🧩 Step 1: Generate Base Renders

Present **map-sprite options first** (8 varied options on one numbered contact sheet). Only after the user picks a map design, generate **8 fresh build-button options**. Each button is a completely new generation that matches the chosen shape and silhouette but uses its own ground-level or eye-level camera and lighting — never paste or composite the map sprite onto a desert background, and never keep the isometric map angle.

#### **A. Map Building Render (isometric 3/4, transparent)**

- **Resolution:** 2048×2048 px
- **Aspect Ratio:** 1:1 (square)
- **View:** Game map perspective — **isometric 3/4 top-down**, not a 90° satellite shot and not a ground-level hero shot
- **Lighting:** Neutral daylight, **soft shadows**, low contrast
- **Background:** **True alpha transparency** (`transparent_background: true`) — no checkerboard, no sky, no visible ground plane beyond a compact dirt/grass plot if needed
- **Style:** **Photorealistic PBR**, grey industrial military look consistent with existing building map sprites
- **Environment Reflection:** Minimal, ambient only
- **Output Format:** **PNG with real alpha transparency**

#### **B. Sidebar Build-Button Render**

- **Resolution:** 2048×2048 px
- **Aspect Ratio:** 1:1 (square)
- **Perspective:** Ground-level or eye-level **hero shot** (as if seen by a person standing near the building). Do not reuse the isometric map camera.
- **Lighting:** Its own lighting, typically bright **desert daylight**, realistic exposure, soft shadows
- **Environment:** Realistic **desert military base** under a **blue sky** (no transparency, opaque)
- **Style:** **Photorealistic PBR**, not stylized or painted
- **Scale:** Appears **large and industrial**, like a production facility or factory
- **Materials:** Reinforced **concrete**, **metal plating**, **pipes**, **silos**, **vents**, **antennas**, etc.
- **Details:** Use real-world proportions, heavy structures, and visible machinery. Match the picked map sprite's silhouette.
- **Output Format:** **PNG** (lossless, large source image, opaque)

---

### 🛠️ Step 2: Post-Processing and Conversion

1. **Sidebar Render →**
   - Downscale to **255×255 px**
   - Keep **opaque** desert background
   - Convert to **WebP (quality 80%)**
   - Save as `buildingname_sidebar.webp`

2. **Map Render →**
   - Downscale to **(tiles_x × 64) × (tiles_y × 64)** px
     (e.g., a 2×2 footprint = 128×128 px)
   - Maintain **true alpha transparency**
   - Convert to **WebP (quality 80%)**
   - Save as `buildingname_map.webp`

3. **Consistency Check**
   - Both images clearly represent the same building
   - Materials, lighting, and proportions must match
   - Map sprite remains clear and readable at its final scaled size

---

### ▶️ Step 3: Automated Workflow

1. **Ask for footprint (if not provided)**
2. **Generate 8 map-sprite options** and show one numbered contact sheet
3. **Wait for the user to pick** (or generate about 4 close variants if they ask to tweak a pick)
4. **Generate 8 fresh build-button options** from the chosen map design, each a new eye-level generation, and show one numbered contact sheet
5. **Wait for the user to pick** the button
6. **Auto-scale** the map sprite based on footprint tile size
7. **Convert both images** to final WebP formats
8. **Deliver final assets:**
   - `buildingname_sidebar.webp`
   - `buildingname_map.webp`

Commit or implement nothing until both picks are made. Commit images only if asked, and reference them in the spec. The build button also serves as the construction icon; do not generate a separate one.

---

### ✅ Notes

- Avoid cartoon-like outlines or over-saturated colors.
- All renders should look **gritty, large-scale, and functional**,
  like a real-world military or industrial base.
- Show contact sheets to the user, not file paths. Check every image and mention weak options honestly.
