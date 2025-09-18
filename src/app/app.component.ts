import { Component, OnInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { AppHeaderComponent } from './components/layout/app-header/app-header.component';
import { AppFooterComponent } from './components/layout/app-footer/app-footer.component';
import { LanguageService } from './services/language.service';
import { isPlatformBrowser } from '@angular/common';
import { WebsocketService } from './services/websocket.service';
import { Subscription } from 'rxjs';
import { NotificationsComponent } from './components/ui/notifications/notifications.component';
import { NotificationService } from './services/ui/notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    AppHeaderComponent,
    AppFooterComponent,
    NotificationsComponent
  ],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'formitgo-tw';

  private errorSubscription = new Subscription();

  constructor(
    private translate: TranslateService,
    private languageService: LanguageService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private wsService: WebsocketService,
    private notificationService: NotificationService
  ) {}

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

  /**
   * Handle the errors received from the WebSocket
   */
  private handleWebSocketError(error: any): void {
    // If the error was already handled by a specific component, don't show it globally
    if (error._handledByProjectShow) {
      return;
    }

    let errorMessage = 'Ha ocurrido un error';

    if (error.value && typeof error.value === 'string') {
      if (error.value.includes('cannot be lesser than 3')) {
        errorMessage = 'El nombre debe tener al menos 3 caracteres';
      } else if (error.value.includes('XMLSchemaValidationError')) {
        errorMessage = 'Error de validación: ' + error.action;
      } else {
        errorMessage = `Error en la acción "${error.action}"`;
      }
    }

    this.notificationService.showError(errorMessage);
  }

  /**
   * Update the lang attribute of the HTML element
   */
  private updateHtmlLang(lang: string): void {
    document.documentElement.lang = lang;
  }
}
