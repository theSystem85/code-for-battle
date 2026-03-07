# Skills: OpenAI Image Generator (Codex Workflow)

Use this skill to generate new RTS art assets directly during coding tasks (units/buildings, sidebar + map variants).

## Official references (web-searched)
- OpenAI Cookbook example (official): https://github.com/openai/openai-cookbook/blob/main/examples/Generate_Images_With_GPT_Image.ipynb
- OpenAI Images guide (official): https://platform.openai.com/docs/guides/image-generation
- OpenAI Images API reference (official): https://platform.openai.com/docs/api-reference/images/create

## Setup in this repository
1. Set your API key before running generation commands:
   - `export OPENAI_API_KEY="your_key_here"`
2. Generate images with OpenAI image models (for example `gpt-image-1.5-2025-12-16`) via the Images API.
3. Save outputs in this repo using existing conventions:
   - Unit sidebar image: `public/images/sidebar/<unit_name>.webp`
   - Unit map image: `public/images/map/units/<unit_name>.webp`
   - Building sidebar image: `public/images/sidebar/<building_name>.webp`
   - Building map image: `public/images/map/buildings/<building_name>.webp`
4. Match current asset format/style:
   - Keep `.webp` format
   - Keep similar framing, perspective, and contrast to existing assets in those folders
   - Keep transparent background when required by existing art style

## Prompt templates (fill in later)

### 1) Unit Sidebar and Map Image Prompt
```text
## 🧩 2D RTS Unit Asset Generation Prompt

You will create two optimized images for a new 2D RTS game unit.  
The user will specify the **unit name** (e.g., “recovery tank” or “attack helicopter”).  

---

### Step 1: Generate Base Renders

#### A. Sidebar Build-Button Render
- Resolution: 2048×2048 px  
- Perspective: Front-left ¾ low-angle  
- Lighting: Bright desert daylight with soft shadows  
- Background: Desert environment (no transparency)  
- Style: Photorealistic, physically-based render (PBR) — realistic military photo look with dust, wear, and camouflage  
- Output Format: PNG (lossless, large source image)

---

#### B. Map Unit Render (Top-Down)
Photorealistic physically-based render (PBR) of a **[unit name]**, viewed from a **perfect 90° top-down orthographic perspective** — as if seen from a satellite or aircraft.  
- Style: Realistic, not stylized or pixel-art  
- Lighting: Neutral daylight with soft shadows, low contrast for gameplay clarity  
- Background: **True transparent alpha background** (no fake checkerboard or surface)  
- Orientation: The unit faces **downward (toward the bottom of the image)**  
- Environment reflection: Subtle ambient light only — no visible ground  
- Camouflage: Same pattern and materials as the sidebar render (e.g., desert beige/brown or woodland green depending on environment)  
- Scale: 2048×2048 px  
- Purpose: For use as a freely rotatable top-down sprite on a 2D RTS map  
- Output Format: PNG (lossless, full transparency)

---

### Step 2: Post-Processing

1. Sidebar Render → Downscale to 255×255 px  
   - Convert to WebP (quality 80%)  
   - Keep full opaque background  
   - Filename: `unitname_sidebar.webp`

2. Map Render → Downscale to 64×64 px  
   - Maintain full transparency  
   - Convert to WebP (quality 80%)  
   - Filename: `unitname_map.webp`

3. Visual Consistency Checks  
   - Same geometry, materials, and camouflage between both images  
   - Top-down version must clearly depict the same unit from above  
   - Ensure clarity and readable silhouette at small scale  

---

### Step 3: Output Workflow

- Always **generate and present the sidebar version first**  
- Wait for user confirmation ("ok" or "approved")  
- Then **generate and process the map version**  
- Deliver both final `.webp` files ready for game integration  

---

### ✅ Example Future Command

“Render me a new unit: [NAME_OF_UNIT]”  
→ Execute all steps above automatically.
```

### 2) Building Sidebar and Map Image Prompt
```text
## 🏗️ 2D RTS Building Asset Generation — Final Template (v3) You will generate **two realistic image assets** for a new 2D RTS game building — one for the **sidebar build button** and one for the **map sprite**. --- ### 🧮 Footprint & Scale If the user did **not specify** the footprint, ask first: > “What is the footprint size of this building (in tiles, e.g., 2x2 or 3x4)?” Each tile = **64×64 px**, so: - 1×1 → 64×64 px - 2×2 → 128×128 px - 3×3 → 192×192 px - 4×4 → 256×256 px …and so on. This determines the **final scaled size of the map sprite**. --- ### 🧩 Step 1: Generate Base Renders #### **A. Sidebar Build-Button Render** - **Resolution:** 2048×2048 px - **Aspect Ratio:** 1:1 (square) - **Perspective:** Front-left **¾ low-angle** (eye-level, slightly above ground) - **Lighting:** Bright **desert daylight** with soft shadows - **Environment:** Realistic **desert military base** with **blue sky and light clouds** in the background - **Style:** - **Photorealistic PBR** (Physically Based Rendering) - Realistic materials: **reinforced concrete**, **metal plating**, **pipes**, **antennas**, **silos**, **vents** - **Clean and slightly futuristic** aesthetic — no steampunk or pencil-drawn look - Natural, balanced colors (not oversaturated or flat) - **Mood:** Feels functional, industrial, and advanced (Command & Conquer style) - **Output Format:** PNG (opaque background, no transparency) --- #### **B. Map Building Render (Top-Down Transparent)** - **Resolution:** 2048×2048 px - **Aspect Ratio:** 1:1 (square) - **View:** **Perfect 90° top-down orthographic** (satellite-like) - **Rotation:** Building rotated **45° on the ground** (diagonal grid alignment) - **Lighting:** Neutral daylight with **soft, minimal shadows** - **Background:** **True alpha transparency (RGBA)** - No checkerboard, no ground, no visible shadow plane - **Style:** - **Photorealistic PBR**, consistent with sidebar image - Clean, functional, slightly futuristic industrial look - Balanced and realistic color palette - **Output Format:** PNG with **real alpha transparency** --- ### 🛠️ Step 2: Post-Processing and Conversion 1. **Sidebar Render →** - Downscale to **255×255 px** - Keep **opaque** desert background and sky - Convert to **WebP (quality 80%)** - Save as buildingname_sidebar.webp 2. **Map Render →** - Downscale to **(tiles_x × 64) × (tiles_y × 64)** px (e.g., 3×3 footprint = 192×192 px) - Maintain **real alpha transparency** - Convert to **WebP (quality 80%)** - Save as buildingname_map.webp 3. **Consistency Check** - Both images must clearly represent the **same building** - Materials, geometry, and lighting must be consistent - Map version must remain readable and sharp at its scaled size --- ### ▶️ Step 3: Workflow 1. Ask for **footprint** (if not given). 2. Generate **Sidebar Render** (Step 1A). 3. Wait for approval (ok / approved). 4. Generate **Map Render** (Step 1B) with transparency. 5. Auto-scale both images according to specs. 6. Convert to final **WebP** assets. 7. Deliver: - buildingname_sidebar.webp - buildingname_map.webp --- ### ✅ Style Summary - Realistic industrial architecture - Slightly futuristic (clean, advanced, metallic hints) - Natural daylight colors, moderate contrast - No stylization, painting, sketch, or steampunk look - Consistent PBR realism across both renders - Sidebar = with sky background - Map = transparent RGBA background Now generate the assets for [NAME_OF_BUILDING]
```
