import { Injectable, signal } from '@angular/core';

/**
 * View-only state for shy cues. Not saved in the script: each cue's own
 * `ui_properties.shy` is what gets saved.
 *  - false (default): each run of consecutive shy cues collapses into a
 *    single thin line.
 *  - true: shy cues are shown with a line along their bottom edge, and the
 *    shy checkbox becomes visible so cues can be marked or unmarked.
 */
@Injectable({ providedIn: 'root' })
export class ShyModeService {
  readonly editMode = signal(false);

  toggle(): void {
    this.editMode.update(v => !v);
  }
}