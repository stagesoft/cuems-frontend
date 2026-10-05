// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
//
// The media warnings (MediaCheckService) as an inline banner under the
// header: in the page flow, so it pushes the page down instead of covering a
// control (ClickUp 869fat84r D20).
import { Component, inject } from '@angular/core';
import { MediaCheckService } from '../../../services/ui/media-check.service';

@Component({
  selector: 'app-media-warnings',
  standalone: true,
  templateUrl: './media-warnings.component.html',
})
export class MediaWarningsComponent {
  private mediaCheck = inject(MediaCheckService);
  warnings = this.mediaCheck.warnings;

  dismiss(projectUuid: string): void {
    this.mediaCheck.dismiss(projectUuid);
  }
}
