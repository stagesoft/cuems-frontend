import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { OscService } from '../../../services/osc.service';

@Component({
  selector: 'app-play-controls',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './play-controls.component.html'
})
export class PlayControlsComponent {
  public oscService = inject(OscService);

  /** SMPTE string for display; fallback when no timecode. */
  get timecodeDisplay(): string {
    const ms = this.oscService.timecodeMs();
    return ms != null ? this.oscService.timecodeToSMPTE(ms) : '--:--:--:--';
  }
}
