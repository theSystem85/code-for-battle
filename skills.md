# Skills: OpenAI Image Generator (Codex Workflow)

Use this skill to generate new RTS art assets directly during coding tasks (units/buildings, sidebar + map variants).

## Official references (web-searched)
- OpenAI Cookbook example (official): https://github.com/openai/openai-cookbook/blob/main/examples/Generate_Images_With_GPT_Image.ipynb
- OpenAI Images guide (official): https://platform.openai.com/docs/guides/image-generation
- OpenAI Images API reference (official): https://platform.openai.com/docs/api-reference/images/create

## Setup in this repository
1. Set your API key before running generation commands:
   - `export OPENAI_API_KEY="your_key_here"`
2. Generate images with OpenAI image models (for example `gpt-image-1`) via the Images API.
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

### 1) Unit Sidebar Image Prompt
```text
[UNIT_SIDEBAR_PROMPT_PLACEHOLDER]
```

### 2) Unit Map Image Prompt
```text
[UNIT_MAP_PROMPT_PLACEHOLDER]
```

### 3) Building Sidebar Image Prompt
```text
[BUILDING_SIDEBAR_PROMPT_PLACEHOLDER]
```

### 4) Building Map Image Prompt
```text
[BUILDING_MAP_PROMPT_PLACEHOLDER]
```
