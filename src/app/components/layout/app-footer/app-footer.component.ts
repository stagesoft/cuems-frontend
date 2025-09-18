import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../services/language.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WebsocketService } from '../../../services/websocket.service';
import { IconComponent } from '../../ui/icon/icon.component';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    IconComponent
  ],
  templateUrl: './app-footer.component.html',
  styleUrl: './app-footer.component.css'
})
export class AppFooterComponent implements OnInit {
  languages = [
    { code: 'es', name: 'spanish' },
    { code: 'en', name: 'english' },
    { code: 'ca', name: 'catalan' }
  ];
  currentLang: string = 'es';

  public onlineUsers = signal(0);

  constructor(
    private translate: TranslateService,
    private languageService: LanguageService,
    public wsService: WebsocketService
  ) {
    this.wsService.ws
      .pipe(takeUntilDestroyed())
      .subscribe((message: any) => {
        this.handleWebSocketMessage(message);
      });
  }

  ngOnInit(): void {
    this.currentLang = this.translate.currentLang;

    this.languageService.currentLang$.subscribe(lang => {
      this.currentLang = lang;
    });
  }


  private handleWebSocketMessage(message: any): void {
    if (!message || typeof message !== 'object') return;

    switch (message.type) {
      case 'users':
        this.onlineUsers.set(message.value);
        break;
      default:
        break;
    }
  }

  setLanguage(langCode: string): void {
    this.languageService.changeLang(langCode);
  }

  /**
   * Checks if a language is active
   */
  isActive(langCode: string): boolean {
    return this.currentLang === langCode;
  }

  getCurrentYear(): number {
    return new Date().getFullYear();
  }
}
