# 2026-03-05T20-36-52Z
# LLM: GPT-5.2-Codex

## Prompt Summary
Add sidebar save-game JSON import/export and move load action to save label.

## Full Prompt
1) make a import and export function for save games so that form the sidebar save games can be downloaded (export) as json and imported. So any user can send a save game to any other user. After the import the game is then in the local storage like it was saved locally.

2) to the right of the save icon button put another icon button to import a save game from the disk (open default file picker with json restriction).

3) in the save games list in each row (of a save game) replace the play/load button with an export icon button. When clicked the download of the save game as a json file will be triggered. So the user first has to create a save game to be able to export/download it. Ensure to put the label of the save game and its date into the filename of the downloaded json.

4) since in step 3 the load button was replaced with the export button put the load functionality instead on the label of the save game directly like it was a clickable link. So when the user clicks it the save game will be loaded like he would have clicked the former "play" button.
