UTC timestamp: 2026-04-26T18:58:03Z
LLM: codex

## Prompt

1) ensure by now streets24_q90_1024x1024 is by default used instead of streets23_q90_1024x1024 as default street sprite sheet. I deleted the old version already but update all references to the old sheet.

2) ensure that the street rendering algo on the map so that it prefers the images so that when on the map a street tile has only one neighbour for example on the top that then only the image is loaded that ONLY has the top tag but not any of the other directional tags (left, right, bottom). Ensure this for all directions. In general only choose the images from the sprite sheet that have only exactly the amount of matching directional (top, left, right, bottom) tags but not more.

3) I also now introduced the tag "full" for street tiles that should be used when there is at least one direct diagonal neighbour street tile AND at least 2 direct neighbour tiles (top, left) or (top, right) or (bottom, left) or (bottom, right). If that is the case the "full" street detection is dominant over the other tags. This should prevent bigger clusters of street tiles or wider streets from being rendered with visually looping connections.
