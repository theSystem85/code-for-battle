# Spec 043: OpenAI Image Generator Skills File

## Goal
Add repository documentation so Codex sessions can generate new unit/building art assets with OpenAI image generation and save them in the project’s existing image locations/format.

## Requirements
1. Add a root `skills.md` file with OpenAI image generation setup instructions.
2. Include links to official OpenAI documentation for image generation setup/reference.
3. Document repository asset output paths:
   - `public/images/sidebar/`
   - `public/images/map/units/`
   - `public/images/map/buildings/`
4. Include 4 explicit prompt template sections:
   - Unit sidebar image prompt template
   - Unit map image prompt template
   - Building sidebar image prompt template
   - Building map image prompt template
5. Instruct users to keep generated assets aligned with existing format/style conventions (WebP and matching visual style).
