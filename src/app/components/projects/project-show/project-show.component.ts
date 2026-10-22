// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
import { Component, OnInit, OnDestroy, inject, effect, untracked, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AppPageHeaderComponent } from '../../layout/app-page-header/app-page-header.component';
import { ProjectsService } from '../../../services/projects/projects.service';
import { OscService } from '../../../services/osc.service';
import { IconComponent } from '../../ui/icon/icon.component';
import { DrawerService } from '../../../services/ui/drawer.service';
import { WebsocketService } from '../../../services/websocket.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { ProjectWorkspaceService } from '../../../services/project-workspace.service';
import { EngineStatusComponent } from '../../ui/engine-status/engine-status.component';

@Component({
  selector: 'app-project-show',
  standalone: true,
  imports: [CommonModule, RouterModule, AppPageHeaderComponent, TranslateModule, IconComponent, EngineStatusComponent],
  templateUrl: './project-show.component.html'
})
export class ProjectShowComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private projectsService = inject(ProjectsService);
  private websocketService = inject(WebsocketService);
  private oscService = inject(OscService);
  public drawerService = inject(DrawerService);
  private workspace = inject(ProjectWorkspaceService);
  
  readonly DRAWER_WIDTH = 500;
  
  public project: any;
  public projectUuid: string | null = null;
  public isProjectReady: boolean = false;
  public isCheckingEngine: boolean = false;
  public engineError: string | null = null;
  private projectLoadedSubscription?: Subscription;
  private websocketSubscription?: Subscription;
  private websocketErrorSubscription?: Subscription;
  // A signal underneath so otherLoadedProject can stay quiet during our own load.
  private loadInFlight = signal(false);
  private get isWaitingForProjectReady(): boolean { return this.loadInFlight(); }
  private set isWaitingForProjectReady(value: boolean) { this.loadInFlight.set(value); }
  private routeUuid = signal<string | null>(null);

  /**
   * The project the engine holds when it is not the one on screen, else null.
   *
   * GO always plays what the engine holds. After another tab loads a different
   * project, this page still lists its own cues — say so loudly, or an
   * operator reads the cue list on screen as what GO will play. Quiet while
   * our own project_ready is in flight: the engine still reports the previous
   * project for a moment.
   */
  readonly otherLoadedProject = computed(() => {
    const loadedName = this.oscService.loadedProject();
    const projects = this.projectsService.projects();
    const viewed = projects.find(p => p.uuid === this.routeUuid());
    if (!loadedName || !viewed?.unix_name || this.loadInFlight()) return null;
    if (loadedName.toLowerCase() === viewed.unix_name.toLowerCase()) return null;
    const loaded = projects.find(p => p.unix_name?.toLowerCase() === loadedName.toLowerCase()) ?? null;
    return { viewed, loaded, loadedName };
  });

  private publishLoadedElsewhere = effect(() => {
    const other = this.otherLoadedProject();
    this.workspace.loadedElsewhere.set(
      other ? { loadedUuid: other.loaded?.uuid ?? null, loadedName: other.loaded?.name ?? '' } : null
    );
  });
  private pendingUnloadAction: 'projects' | 'edit' | null = null;
  /** Set on every navigation; cleared once this page has decided whether to load. */
  private showDecisionPending = false;
  private router = inject(Router);
  public isUnloading = false;

  /**
   * Keep "ready" in step with the show slot once the engine has answered.
   *
   * The slot follows the engine (AppComponent), so when this project is
   * closed or replaced from another tab the page must stop claiming the
   * engine is ready with it — and claim it again if it comes back. Left alone
   * while our own project_ready is in flight: that answer decides, and the
   * slot is briefly emptied by the engine's reload in the meantime.
   */
  private followShowSlot = effect(() => {
    const shownUuid = this.workspace.showProject()?.uuid ?? null;
    untracked(() => {
      if (!this.projectUuid || !this.project || this.showDecisionPending || this.isWaitingForProjectReady || this.oscService.running()) return;
      this.isProjectReady = shownUuid === this.projectUuid;
    });
  });

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.projectUuid = params['uuid'];
      // The component is reused when only the uuid changes: start clean.
      this.showDecisionPending = true;
      this.routeUuid.set(this.projectUuid);
      this.isProjectReady = false;
      this.engineError = null;

      if (this.projectsService.projects().length === 0) {
        this.projectsService.getProjectList();
      }

      this.projectsService.loadProject(this.projectUuid);
      
      //this.checkProjectReady();
    });

    this.projectLoadedSubscription = this.projectsService.projectLoaded.subscribe(projectData => {
      if (projectData) {
        const basicProjectData = this.projectsService.projects().find(p => p.uuid === this.projectUuid);
        if (basicProjectData) {
          if (!projectData.uuid) projectData.uuid = basicProjectData.uuid;
          if (!projectData.name) projectData.name = basicProjectData.name;
          if (!projectData.unix_name) projectData.unix_name = basicProjectData.unix_name;
          if (!projectData.created) projectData.created = basicProjectData.created;
          if (!projectData.modified) projectData.modified = basicProjectData.modified;
        }
        
        this.project = projectData;

        // Decide once per navigation. projectLoaded is shared: the mixers,
        // the show sequence and detached edit pages fire it too, and acting on
        // those would reload this project over one loaded from another tab.
        if (this.projectUuid && this.project.name && this.showDecisionPending) {
          this.showDecisionPending = false;
          // Opening a project in show loads it unless it is already the show
          // project — also when another one sits loaded and stopped. Never
          // while playing: that stays the "different project" state.
          if (!this.oscService.running() && this.workspace.showProject()?.uuid !== this.projectUuid) {
            this.workspace.openInShow(this.projectUuid, this.project.name);
            this.checkProjectReady();
          } else {
            this.isCheckingEngine = false;
            if (this.workspace.showProject()?.uuid === this.projectUuid) {
              this.isProjectReady = true;
            }
          }
        }        
      }
    });

    this.setupWebSocketSubscription();
  }

  ngOnDestroy(): void {
    this.workspace.loadedElsewhere.set(null);
    if (this.projectLoadedSubscription) {
      this.projectLoadedSubscription.unsubscribe();
    }
    if (this.websocketSubscription) {
      this.websocketSubscription.unsubscribe();
    }
    if (this.websocketErrorSubscription) {
      this.websocketErrorSubscription.unsubscribe();
    }
  }

  /**
   * Toggle Activity/Warnings
   */
  toggleActivityDrawer(): void {
    this.drawerService.toggleActivityDrawer();
  }


  private setupWebSocketSubscription(): void {
    this.websocketSubscription = this.websocketService.messages.subscribe(response => {
      this.handleWebSocketMessage(response);
    });

    this.websocketErrorSubscription = this.websocketService.errors.subscribe(error => {
      this.handleWebSocketError(error);
    });
  }

  private checkProjectReady(): void {
    if (this.projectUuid) {
      if (this.oscService.running()) {
        this.isCheckingEngine = false;
        return;
      }

      this.isCheckingEngine = true;
      this.engineError = null;
      this.isProjectReady = false;
      this.isWaitingForProjectReady = true;

      const message = {
        action: 'project_ready',
        value: this.projectUuid
      };
      this.websocketService.wsEmit(message);
    }
  }

  private handleWebSocketMessage(response: any): void {
    if (response.type === 'project_ready' && response.value === this.projectUuid && this.isWaitingForProjectReady) {
      this.isCheckingEngine = false;
      this.engineError = null;
      this.isProjectReady = true;
      this.isWaitingForProjectReady = false;
    }

    if (response.type === 'project_unload' && response.value === 'OK' && this.pendingUnloadAction) {
      const action = this.pendingUnloadAction;
      this.pendingUnloadAction = null;
      this.isUnloading = false;
      this.workspace.closeShow();

      if (action === 'edit' && this.projectUuid) {
        this.router.navigate([`/projects/${this.projectUuid}/edit/sequence`]);
      } else {
        this.router.navigate(['/projects']);
      }
    }    
  }

  private handleWebSocketError(error: any): void {  
    if (error.action === 'project_ready' && this.isWaitingForProjectReady) {
      this.isCheckingEngine = false;
      this.engineError = error.message || error.value || 'Error desconocido';
      this.isProjectReady = false;
      this.isWaitingForProjectReady = false;
      
      error._handledByProjectShow = true;
    }

    if (error.action === 'project_unload' && this.pendingUnloadAction) {
      this.isUnloading = false;
      this.pendingUnloadAction = null;
    }
  }

  public get isShowActiveSequence(): boolean {
    return this.router.url.includes('/sequence');
  }

  public go(): void {
    console.log('GO!!!!');
    this.oscService.go();
  }

  public stop(): void {
    console.log('STOP!!!!');
    this.oscService.stop();
  }

  public pause(): void {
    console.log('PAUSE!!!!');
    this.oscService.pause();
  }

  get isEngineRunning(): boolean {
    return this.oscService.running();
  }
  
  get runningProject() {
    return this.projectsService.projects().find(
      p => p.unix_name?.toLowerCase() === this.oscService.loadedProject().toLowerCase()
    ) ?? null;
  }
  
  get isSameProjectRunning(): boolean {
    if (!this.project?.unix_name) return false;
    return this.oscService.loadedProject().toLowerCase() === this.project.unix_name.toLowerCase();
  }
  
  get isDifferentProjectRunning(): boolean {
    return this.isEngineRunning &&
           this.oscService.loadedProject() !== '' &&
           !this.isSameProjectRunning;
  }
  
  get engineStatus() {
    if (this.isCheckingEngine) return 'checking';
    if (this.isEngineRunning && !this.project) return 'checking';
    if (this.isDifferentProjectRunning) return 'different-project';
    if (this.isEngineRunning) return 'running';
    if (this.engineError) return 'error';
    if (this.otherLoadedProject()) return 'different-loaded';
    if (this.isProjectReady) return 'ready';
    return 'idle';
  }

  public closeProject(): void {
    this.requestProjectUnload('projects');
  }  

  public closeAndEditProject(): void {
    this.requestProjectUnload('edit');
  }

  private requestProjectUnload(afterUnload: 'projects' | 'edit'): void {
    if (this.isUnloading || !this.projectUuid) return;
    this.isUnloading = true;
    this.isWaitingForProjectReady = false;
    this.pendingUnloadAction = afterUnload;

    this.websocketService.wsEmit({
      action: 'project_unload',
      value: this.projectUuid
    });
  }
} 