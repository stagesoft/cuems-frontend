import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { AppPageHeaderComponent } from '../../layout/app-page-header/app-page-header.component';
import { SchemaDocumentViewComponent } from '../schema-document-view/schema-document-view.component';
import { ConfigNavComponent } from '../config-nav.component';

/** The `project_settings` document, read-only, named for the document it shows (FR-080). */
@Component({
  selector: 'app-project-settings',
  standalone: true,
  imports: [TranslateModule, AppPageHeaderComponent, SchemaDocumentViewComponent, ConfigNavComponent],
  template: `
    <div class="wrapper">
      <app-page-header title="config.project_settings.title" icon="settings"></app-page-header>
    </div>
    <div class="wrapper mt-6">
      <app-config-nav></app-config-nav>
    </div>
    <div class="wrapper mt-6">
      <app-schema-document-view schema="project_settings"></app-schema-document-view>
    </div>
  `,
})
export class ProjectSettingsComponent {}
