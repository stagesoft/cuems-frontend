import { Component, OnInit, OnDestroy, PLATFORM_ID, Inject, inject, effect } from '@angular/core';
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
import { ProjectWorkspaceService } from './services/project-workspace.service';
import { CustomRouteReuseStrategy } from './core/route-reuse.strategy';
import { ConfirmationDialogComponent } from './components/ui/confirmation-dialog/confirmation-dialog.component';
import { ProjectsService } from './services/projects/projects.service';
import { PlayControlsFloatingComponent } from './components/ui/play-controls/play-controls-floating/play-controls-floating.component';
import { OscService } from './services/osc.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    AppHeaderComponent,
    AppFooterComponent,
    NotificationsComponent,
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

  constructor(
    private translate: TranslateService,
    private languageService: LanguageService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private wsService: WebsocketService,
    private notificationService: NotificationService
  ) {
    effect(() => {
      const uuid = this.projectsService.runningProjectUuid();
      const projects = this.projectsService.projects();
      if (uuid && projects.length > 0) {
        const project = projects.find(p => p.uuid === uuid);
        if (project && !this.workspace.showProject()) {
          this.workspace.openInShow(uuid, project.name);
        }
      }
    });    
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