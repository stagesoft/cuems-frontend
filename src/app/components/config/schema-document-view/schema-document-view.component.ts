import { Component, OnInit, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SchemaDescriptorService, SchemaName } from '../../../services/projects/handlers/schema-descriptor.handler';
import { documentOutline } from './document-outline';

/**
 * A config document's fields, read-only, rendered from its schema descriptor
 * rather than a hand-maintained form (FR-080).
 *
 * Values are not shown: no editor action returns a config document's current
 * contents (research R10, upstream report UR-2), and a schema default is not
 * what the controller holds, so defaults are labelled as defaults. Editing
 * waits on the same report — `config_save` replaces the whole document, and a
 * form without the current values would overwrite a working configuration.
 * No `config_save` is sent from here.
 */
@Component({
  selector: 'app-schema-document-view',
  standalone: true,
  imports: [TranslateModule, NgTemplateOutlet],
  templateUrl: './schema-document-view.component.html',
})
export class SchemaDocumentViewComponent implements OnInit {
  private descriptors = inject(SchemaDescriptorService);

  readonly schema = input.required<SchemaName>();

  readonly descriptor = computed(() => this.descriptors.descriptor(this.schema()));
  readonly outline = computed(() => {
    const descriptor = this.descriptor();
    return descriptor ? documentOutline(descriptor) : [];
  });

  ngOnInit(): void {
    // On view entry, not on connect: only `script` is a session prerequisite.
    if (!this.descriptor()) this.descriptors.request(this.schema());
  }

  display(value: unknown): string {
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}
