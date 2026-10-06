<!--
SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
SPDX-License-Identifier: GPL-3.0-or-later
-->

# Release notes — schema-descriptor migration (operator-visible changes)

Collected as each change lands; T115 completes this file.

## Projects

- **Projects can be saved again.** Against the current editor every save was refused; edits now
  save and reload.
- **New audio cues start at volume 100, not 20.** The starting master volume now comes from the
  schema (its default is 100). Before, a new audio cue took the old template's example volume (66)
  or, without one, 20. A cue whose file carries no volume also reads as 100. **Check levels before
  a show**: a new audio cue starts five times louder than the old fallback.
- New audio and video outputs keep the starting levels operators already know: output and channel
  volume 80, geometry scale 1, corners at 0.
- A cue of a class this editor has no editor for (for example `lighting`) is now listed with its
  class instead of disappearing, and is saved back as it was. Its name, notes, timing and enabled
  state can still be edited.
- The media duration column shows a time instead of `[object Object]` in the show view.
- A refused save now shows the editor's own explanation without the technical prefix, including
  which cue to fix (for example a fade of zero length, or an action pointing at a cue that no
  longer exists).
