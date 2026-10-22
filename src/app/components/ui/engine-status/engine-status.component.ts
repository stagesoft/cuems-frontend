// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

export type EngineStatus = 'checking' | 'different-project' | 'different-loaded' | 'running' | 'error' | 'ready' | 'idle';

@Component({
  selector: 'app-engine-status',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule],
  templateUrl: './engine-status.component.html'
})
export class EngineStatusComponent {
  status = input.required<EngineStatus>();
  engineError = input<string | null>(null);
  runningProject = input<any>(null);
}