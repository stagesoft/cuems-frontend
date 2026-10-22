// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { ProjectWorkspaceService } from '../../../services/project-workspace.service';
import { OscService } from '../../../services/osc.service';

@Component({
  selector: 'app-show-project-loaded-indicator',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './show-project-loaded-indicator.component.html',
})
export class ShowProjectLoadedIndicatorComponent {
  workspace = inject(ProjectWorkspaceService);
  oscService = inject(OscService);
  router = inject(Router);
  
  navigateToProject(uuid: string): void {
    this.router.navigateByUrl('/projects', { skipLocationChange: true }).then(() => {
      this.router.navigate(['/projects', uuid, 'sequence']);
    });
  }  
}