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
- **A cue muted at volume 0 stays at 0.** Before, saving or reopening it brought it back at the
  default volume.
- New audio and video outputs keep the starting levels operators already know: output and channel
  volume 80, geometry scale 1, corners at 0.
- A cue of a class this editor has no editor for (for example `lighting`) is now listed with its
  class instead of disappearing, and is saved back as it was. Its name, notes, timing and enabled
  state can still be edited.
- The media duration column shows a time instead of `[object Object]` in the show view.
- A refused save now shows the editor's own explanation without the technical prefix, including
  which cue to fix (for example a fade of zero length, or an action pointing at a cue that no
  longer exists).

## Opening a project

- When the editor converts or repairs a project as it opens it, you now see what it changed, field
  by field, before you edit — and "this file needs saving" when the change exists only in the
  editor. The editor will not save such a project until you confirm you have seen the changes.
  A clean open stays out of the way, with its details one click away.
- A project the editor cannot open now shows which document, cue and field are at fault, the
  editor's reason, and the three ways forward. The project stays in the list.
- If a save is refused because the original file could not be kept in the trash, you are told
  plainly that nothing was written.

## Nodes

- The node screen is now **Nodes** (`/nodes`; the old `/settings` address still leads there).
- **Adopting a node works again.** Its button is live for a node that discovery has just seen.
- **Un-adopting the controller is no longer offered** (it was, and the daemon then refused it).
- When cuems-nodeconf does not report itself available, adoption is disabled instead of offered.
- If the network map names the same node twice, the screen says so, shows the file, and how to fix
  it. The list shown meanwhile is the last good one.
- The node list refreshes when you open the screen and after the connection is renewed.

