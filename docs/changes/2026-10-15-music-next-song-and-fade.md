# Music: next-song button, title tooltip and audible 3 s fade

## Next-song button
- New `#musicNextButton` sits directly beside `#musicControl` in the left sidebar status row (32 px, same style). It follows the music toggle into the mobile landscape sidebar menu and is hidden together with it in the condensed/collapsed portrait sidebar.
- Pressing it walks a fixed order across all tracks (`MUSIC_SKIP_ORDER`): `music01`, `music02`, `music_attack_motivational`, `music_under_attack_danger`, `music_defeat_sad`, then wraps. Pressing while music is off turns music on.
- Automatic playback (playlist and director) keeps the random pick via `Math.random` (never the lockstep `gameRandom`).
- Interaction with the director: a manual pick plays once to its end (it does not loop), then the director's current mood resumes (the mood's loop track, or a random playlist track when normal). A mood change while the manual pick plays replaces it with the usual fade.

## Tooltip
- Hover (mouse), keyboard focus or a 450 ms touch long-press on either button shows `Now playing: <title>` (toggle) or `Now playing: <title> · Next: <title>` (next) in the custom `#musicTrackTip` tooltip. A long-press does not toggle or skip. No `title` attribute is used.

## Fade root cause and fix
- iOS/iPadOS Safari treats `HTMLMediaElement.volume` as read-only, so the previous volume ramp did nothing there: the old track kept full volume for 3.5 s and was then cut hard.
- On desktop the ramp was linear in amplitude, which sounds almost unchanged for most of the fade and then drops off in the last moment.
- Fix: music elements are routed through a Web Audio `GainNode` (fallback: element volume) and fade over a full `MUSIC_FADE_OUT_MS = 3000` on a decibel curve (to -30 dB, then tapered to silence). The fade clock uses real elapsed time and freezes while the game is paused; repeated director requests during a fade never restart or shorten it. Playlist fades start 3.25 s before a track ends so they complete before the `ended` event.
