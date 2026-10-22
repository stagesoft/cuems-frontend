// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
import { Component, OnInit, OnDestroy, PLATFORM_ID, Inject, inject, effect, untracked } from '@angular/core';
import { Router, RouterOutlet, RouteReuseStrategy } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AppHeaderComponent } from './components/layout/app-header/app-header.component';
import { AppFooterComponent } from './components/layout/app-footer/app-footer.component';
import { LanguageService } from './services/language.service';
import { isPlatformBrowser } from '@angular/common';
import { WebsocketService } from './services/websocket.service';
import { Subscription } from 'rxjs';
import { NotificationsComponent } from './components/ui/notifications/notifications.component';
import { NotificationService } from './services/ui/notification.service';
import { MediaCheckService } from './services/ui/media-check.service';
import { MediaWarningsComponent } from './components/ui/media-warnings/media-warnings.component';
import { ProjectWorkspaceService } from './services/project-workspace.service';
import { CustomRouteReuseStrategy } from './core/route-reuse.strategy';
import { ConfirmationDialogComponent } from './components/ui/confirmation-dialog/confirmation-dialog.component';
import { ProjectList, ProjectsService } from './services/projects/projects.service';
import { PlayControlsFloatingComponent } from './components/ui/play-controls/play-controls-floating/play-controls-floating.component';
import { ClusterWarning, OscService } from './services/osc.service';

/** How long an empty engine load must last before an open show is closed.
 *  Engines from cdf8fcf on blank /engine/status/load at the start of every
 *  load and send the new name a fraction of a second later; closing on the
 *  blank would flash "no project" in every tab on each load. The grace also
 *  covers a plain X->Y change, where the new name follows at once. */
const SHOW_CLEAR_GRACE_MS = 2000;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    AppHeaderComponent,
    AppFooterComponent,
    NotificationsComponent,
    MediaWarningsComponent,
    ConfirmationDialogComponent,
    TranslateModule,
    PlayControlsFloatingComponent,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'formitgo-tw';
  private errorSubscription = new Subscription();
  workspace = inject(ProjectWorkspaceService);
  private strategy = inject(RouteReuseStrategy) as CustomRouteReuseStrategy;
  private router = inject(Router);
  private projectsService = inject(ProjectsService);
  oscService = inject(OscService);
  // Keeps the editor's media_check_report warnings on every page (869fat84r D20).
  private mediaCheck = inject(MediaCheckService);

  constructor(
    private translate: TranslateService,
    private languageService: LanguageService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private wsService: WebsocketService,
    private notificationService: NotificationService
  ) {
    // Open whatever the engine holds in show mode — loaded, not only running.
    // A new tab used to come up empty while a stopped project sat loaded,
    // because only runningProjectUuid was read here (869fdvdk3).
    // While the engine channel is up, its live /engine/status/load (a
    // unix_name) is the only source: project_status is queried once per
    // connection and another tab's unload never clears it, so its uuids go
    // stale and would reopen an unloaded project. They serve only as a
    // fallback while the engine channel is down.
    effect(() => {
      const projects = this.projectsService.projects();
      const liveName = this.oscService.loadedProject().toLowerCase();
      const live = liveName ? projects.find(p => p.unix_name?.toLowerCase() === liveName) : undefined;
      const uuid = this.oscService.isConnected()
        ? (live?.uuid ?? null)
        : (this.projectsService.runningProjectUuid() ?? this.projectsService.loadedProjectUuid());
      if (uuid && projects.length > 0) {
        const project = projects.find(p => p.uuid === uuid);
        if (project && !this.workspace.showProject()) {
          this.workspace.openInShow(uuid, project.name);
          this.mirroredShowUuid = uuid;
        }
      }
    });

    // A tab's project list is fetched once; a project created elsewhere after
    // that (another tab's duplicate, an import) is unknown here, and every
    // name lookup for the engine's project would come up empty. Refresh the
    // list once per unknown name instead of ever showing the unix_name.
    effect(() => {
      const name = this.oscService.loadedProject().toLowerCase();
      const projects = this.projectsService.projects();
      if (!name || projects.length === 0) return;
      if (projects.some(p => p.unix_name?.toLowerCase() === name)) return;
      untracked(() => {
        if (this.listRefreshedFor === name) return;
        this.listRefreshedFor = name;
        this.projectsService.getProjectList();
      });
    });

    // The effect above only fills an empty show slot. This one keeps an open
    // tab in step with the engine afterwards, so a project closed or loaded
    // elsewhere (another tab, the boot auto-load) is not left in the header.
    effect(() => {
      const name = this.oscService.loadedProject().toLowerCase();
      const projects = this.projectsService.projects();
      untracked(() => this.followEngineLoad(name, projects));
    });

    // The missing-node alert lives here, not in the page header or the
    // transport bar: the header injects no services, and the transport bar is
    // rendered behind showPlayControls, which needs oscService.running() — and
    // running only turns yes on GO, so it is false at the instant of every
    // load. This component mounts unconditionally, which is the requirement.
    effect(() => {
      const warning = this.oscService.clusterWarning();
      if (!warning) return;
      this.announceClusterWarning(warning);
    });
  }

  /** Load id already announced. 0 = nothing yet (engine load ids start at 1). */
  private lastWarnedLoadId = 0;

  /**
   * Toast the load diagnosis once per load.
   *
   * Deduped on the load id and never on the payload's contents: un-adopt a
   * node, load, get warned, unload to fix it, fail to fix it, load again —
   * the diagnosis is byte-identical, and a content-keyed dedupe would stay
   * silent while the operator read that silence as "solved". A reconnect
   * replays the same id; a retry brings a new one.
   *
   * Compared with `!==` rather than `>` on purpose: a restarted engine begins
   * counting again from 1, and a warning must not be swallowed because the
   * previous engine had got further.
   */
  private announceClusterWarning(warning: ClusterWarning): void {
    if (warning.loadId === this.lastWarnedLoadId) return;
    this.lastWarnedLoadId = warning.loadId;

    const label = (uuid: string) => this.projectsService.nodeLabel(uuid);
    const parts: string[] = [];
    if (warning.missing.length) {
      const names = warning.missing.map(label).join(', ');
      parts.push(warning.missing.length === 1
        ? `${names} no está en el clúster`
        : `${names} no están en el clúster`);
    }
    if (warning.unreachable.length) {
      const names = warning.unreachable.map(label).join(', ');
      parts.push(warning.unreachable.length === 1
        ? `${names} no responde`
        : `${names} no responden`);
    }
    if (!parts.length) return;   // clean load: nothing to say, id still noted

    const total = warning.missing.length + warning.unreachable.length;
    this.notificationService.showWarning(
      (total === 1
        ? `El proyecto usa un nodo que no se puede utilizar: `
        : `El proyecto usa nodos que no se pueden utilizar: `) +
      `${parts.join('; ')}. Sus cues no se reproducirán.`,
      total === 1 ? 'Nodo no disponible' : 'Nodos no disponibles'
    );
  }

  ngOnInit() {
    this.translate.addLangs(['es', 'en', 'ca']);
    this.translate.setDefaultLang('es');
    const savedLang = localStorage.getItem('userLanguage');
    if (savedLang && this.translate.getLangs().includes(savedLang)) {
      this.translate.use(savedLang);
    } else {
      const browserLang = this.translate.getBrowserLang();
      if (browserLang && this.translate.getLangs().includes(browserLang)) {
        this.translate.use(browserLang);
      } else {
        this.translate.use('es');
      }
    }
    this.languageService.initializeLanguage();
    if (isPlatformBrowser(this.platformId)) {
      this.updateHtmlLang(this.translate.currentLang);
      this.languageService.currentLang$.subscribe(lang => {
        this.updateHtmlLang(lang);
      });
    }
    this.errorSubscription = this.wsService.errors.subscribe(error => {
      this.handleWebSocketError(error);
    });
  }

  ngOnDestroy() {
    this.errorSubscription.unsubscribe();
    if (this.clearShowTimer) clearTimeout(this.clearShowTimer);
  }

  /** unix_name for which a project-list refresh was already requested. */
  private listRefreshedFor = '';

  /** Engine load already reflected in the show slot. null = nothing seen yet. */
  private appliedLoad: string | null = null;
  /** Show slot entry this tab put there from the engine's state. The slot may
   *  instead hold a project the operator just opened here, whose load is
   *  still in flight; that one is never replaced or closed from here. */
  private mirroredShowUuid: string | null = null;
  private clearShowTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Mirror a change of the engine's load into the show slot.
   *
   * Acts on changes of the load only, never on changes of the slot, and only
   * touches a slot that is empty or still holds what the engine last had: a
   * tab that has just opened a project in show is waiting for the engine to
   * load it, and must not get the previous project back meanwhile.
   */
  private followEngineLoad(name: string, projects: ProjectList[]): void {
    if (name === this.appliedLoad) return;
    if (this.clearShowTimer) {
      clearTimeout(this.clearShowTimer);
      this.clearShowTimer = null;
    }

    if (name === '') {
      // The first empty value is just the signal's initial state.
      if (this.appliedLoad !== null) {
        this.clearShowTimer = setTimeout(() => {
          this.clearShowTimer = null;
          const shown = this.workspace.showProject();
          if (this.oscService.loadedProject() === '' && shown && shown.uuid === this.mirroredShowUuid) {
            this.workspace.closeShow();
            this.mirroredShowUuid = null;
          }
        }, SHOW_CLEAR_GRACE_MS);
      }
      this.appliedLoad = '';
      return;
    }

    // Not in the list yet: the projects() update runs this again.
    const live = projects.find(p => p.unix_name?.toLowerCase() === name);
    if (!live) return;
    const shown = this.workspace.showProject();
    if (!shown || (shown.uuid === this.mirroredShowUuid && shown.uuid !== live.uuid)) {
      this.workspace.openInShow(live.uuid, live.name);
    }
    if (this.workspace.showProject()?.uuid === live.uuid) this.mirroredShowUuid = live.uuid;
    this.appliedLoad = name;
  }

  onConfirmClose(): void {
    const uuid = this.workspace.pendingCloseUuid();
    if (uuid) {
      this.strategy.clearProjectRoutes(uuid);
      if (this.router.url.includes(`/projects/${uuid}/edit`)) {
        this.router.navigate(['/projects']);
      }
    }
    this.workspace.onConfirmClose();
  }

  private handleWebSocketError(error: any): void {
    if (error._handledByProjectShow) return;
    // WebsocketService emits {action, message, raw} — the old error.value
    // branch was always undefined, so every backend rejection surfaced as the
    // generic toast. Match special cases against the raw backend text and
    // otherwise show the parsed message (stripping the "<class '...'>"
    // prefix the editor prepends to forwarded exceptions).
    let errorMessage = 'Ha ocurrido un error';
    const detail = typeof error.message === 'string' ? error.message : '';
    const rawValue = typeof error.raw?.value === 'string' ? error.raw.value : '';
    const haystack = rawValue || detail;
    if (haystack) {
      if (haystack.includes('cannot be lesser than 3')) {
        errorMessage = 'El nombre debe tener al menos 3 caracteres';
      } else if (haystack.includes('XMLSchemaValidationError')) {
        errorMessage = 'Error de validación: ' + error.action;
      } else {
        const cleaned = detail.replace(/^<class '[^']+'>/, '').trim();
        errorMessage = cleaned || `Error en la acción "${error.action}"`;
      }
    }
    this.notificationService.showError(errorMessage);
  }

  private updateHtmlLang(lang: string): void {
    document.documentElement.lang = lang;
  }

  get showPlayControls(): boolean {
    const showProject = this.workspace.showProject();
    if (!showProject) return false;
  
    const url = this.router.url;
    const isInShowSequence = url.includes('/sequence') && !url.includes('/edit/sequence');
    return this.oscService.running() || isInShowSequence;
  }  
}