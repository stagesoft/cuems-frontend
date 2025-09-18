import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private currentLangSubject = new BehaviorSubject<string>('es');
  public currentLang$: Observable<string> = this.currentLangSubject.asObservable();

  constructor(private translate: TranslateService) {
      // Initialize with the current language
    this.currentLangSubject.next(this.translate.currentLang);
  }

  changeLang(lang: string): void {
    if (this.translate.getLangs().includes(lang)) {
      this.translate.use(lang);
      this.currentLangSubject.next(lang);
      localStorage.setItem('userLanguage', lang);
    }
  }

  getCurrentLang(): string {
    return this.currentLangSubject.value;
  }

  /**
   * Initialize the app language
   */
  initializeLanguage(): void {
    const savedLang = localStorage.getItem('userLanguage');
    
    if (savedLang && this.translate.getLangs().includes(savedLang)) {
      this.changeLang(savedLang);
    }
  }
} 