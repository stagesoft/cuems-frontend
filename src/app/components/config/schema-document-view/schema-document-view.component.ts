import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SchemaDescriptorService } from '../../../services/projects/handlers/schema-descriptor.handler';
import { ProjectsService } from '../../../services/projects/projects.service';
import { ConfigDocumentsService, ConfigSchema } from '../../../services/config/config-documents.service';
import { documentOutline, fieldValue, rootValue } from './document-outline';

/**
 * A config document, read-only: its fields from the schema descriptor (FR-080),
 * and their values from the file through `config_load` (cuems-editor 002,
 * answering cuems-frontend UR-2).
 *
 * The two project documents need a project, chosen here. When the file does
 * not exist yet the editor answers with the schema's instance, which is not
 * the controller's configuration, so no values are shown — and a schema
 * default is labelled as the schema's, never as a value.
 *
 * Editing is not offered (owner's decision 2026-10-12): no `config_save` is
 * sent from here, and tools/wire-guards.mjs holds that.
 */
@Component({
  selector: 'app-schema-document-view',
  standalone: true,
  imports: [TranslateModule, NgTemplateOutlet],
  templateUrl: './schema-document-view.component.html',
})
export class SchemaDocumentViewComponent implements OnInit {
  private descriptors = inject(SchemaDescriptorService);
  private documents = inject(ConfigDocumentsService);
  private projectsService = inject(ProjectsService);

  readonly schema = input.required<ConfigSchema>();

  readonly projectScoped = computed(() => this.schema() !== 'settings');
  readonly projects = this.projectsService.projects;
  readonly projectUuid = signal<string | null>(null);

  readonly descriptor = computed(() => this.descriptors.descriptor(this.schema()));
  readonly outline = computed(() => {
    const descriptor = this.descriptor();
    return descriptor ? documentOutline(descriptor) : [];
  });

  readonly state = computed(() =>
    this.projectScoped() && !this.projectUuid() ? null : this.documents.state(this.schema(), this.projectUuid()));

  /** The values to show: only from a file that exists. */
  readonly values = computed(() => {
    const state = this.state();
    return state?.status === 'loaded' && state.exists ? rootValue(this.outline(), state.document) : undefined;
  });

  constructor() {
    // Read the document when its target is known (on entry, or a project chosen).
    effect(() => {
      const schema = this.schema();
      const project = this.projectUuid();
      if (this.projectScoped() && !project) return;
      if (!this.documents.state(schema, project)) this.documents.load(schema, project);
    });
  }

  ngOnInit(): void {
    // On view entry, not on connect: only `script` is a session prerequisite.
    if (!this.descriptor()) this.descriptors.request(this.schema());
    if (this.projectScoped() && this.projects().length === 0) this.projectsService.getProjectList();
  }

  selectProject(uuid: string): void {
    this.projectUuid.set(uuid || null);
  }

  reload(): void {
    this.documents.load(this.schema(), this.projectUuid());
  }

  readonly fieldValue = fieldValue;

  isList(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  display(value: unknown): string {
    if (value === null || value === undefined) return '—';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}
