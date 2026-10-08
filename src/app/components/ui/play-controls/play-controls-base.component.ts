// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
import { inject } from '@angular/core';
import { OscService } from '../../../services/osc.service';
import { ProjectWorkspaceService } from '../../../services/project-workspace.service';
import { ProjectsService } from '../../../services/projects/projects.service';

export abstract class PlayControlsBase {
  protected oscService = inject(OscService);
  protected workspace = inject(ProjectWorkspaceService);
  private projectsService = inject(ProjectsService);

  /** The engine's project by the name the operator knows it by. The engine
   *  only reports the unix_name, which is never shown: until the project list
   *  has it (AppComponent refreshes the list when it does not) this is ''. */
  get loadedProjectName(): string {
    const unixName = this.oscService.loadedProject();
    if (!unixName) return '';
    const project = this.projectsService.projects().find(p => p.unix_name?.toLowerCase() === unixName.toLowerCase());
    return project?.name || '';
  }

  /** The engine's next cue by name: engine-fed table first (what GO plays),
   *  the page-fed table as a fallback, the uuid when neither knows it. */
  get nextCueName(): string {
    const id = this.oscService.nextCue();
    if (!id) return '—';
    return this.oscService.engineCueNames()[id] || this.oscService.cueNames()[id] || id;
  }

  get timecodeDisplay(): string {
    const ms = this.oscService.timecodeMs();
    return ms != null ? this.oscService.timecodeToHHMMSS(ms) : '--:--:--';
  }
}