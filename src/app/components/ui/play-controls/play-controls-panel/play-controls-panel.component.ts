// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PlayControlsBase } from '../play-controls-base.component';
import { TooltipDirective } from '../../../../core/directives/tooltip.directive';

@Component({
  selector: 'app-play-controls-panel',
  imports: [TranslateModule, RouterLink, TooltipDirective],
  templateUrl: './play-controls-panel.component.html'
})
export class PlayControlsPanelComponent extends PlayControlsBase {}