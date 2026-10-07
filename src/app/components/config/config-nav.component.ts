import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

/** The three config documents, each linked under its own document's name. */
export const CONFIG_VIEWS = [
  { path: '/config/settings', titleKey: 'config.settings.title' },
  { path: '/config/project-settings', titleKey: 'config.project_settings.title' },
  { path: '/config/project-mappings', titleKey: 'config.project_mappings.title' },
] as const;

@Component({
  selector: 'app-config-nav',
  standalone: true,
  imports: [RouterModule, TranslateModule],
  template: `
    <nav class="flex space-x-4 border-b border-dark-300">
      @for (view of views; track view.path) {
        <a [routerLink]="view.path" routerLinkActive="bg-dark-300 text-white"
           class="px-4 py-2 text-sm font-medium rounded-t-lg">{{ view.titleKey | translate }}</a>
      }
    </nav>
  `,
})
export class ConfigNavComponent {
  readonly views = CONFIG_VIEWS;
}
