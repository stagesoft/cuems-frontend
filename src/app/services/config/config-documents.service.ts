import { Injectable, inject, signal } from '@angular/core';
import { WebsocketService } from '../websocket.service';
import { PayloadVersionService } from '../../core/payload-version.service';

/** The config documents `config_load` serves (cuems-editor 002 FR-012). */
export type ConfigSchema = 'settings' | 'project_settings' | 'project_mappings';

/** One `config_load` answer, or why there is none. */
export type ConfigDocumentState =
  | { status: 'loading' }
  /** `exists: false` means no file yet; `document` is then the schema's instance, not values. */
  | { status: 'loaded'; exists: boolean; revision: string | null; document: any }
  | { status: 'failed'; message: string };

export function configKey(schema: ConfigSchema, projectUuid: string | null): string {
  return `${schema}|${projectUuid ?? ''}`;
}

/**
 * Reads config documents through `config_load` — their file's actual values
 * and revision (cuems-editor 002 US2, which answers cuems-frontend UR-2).
 *
 * Read-only here: nothing sends `config_save` (owner's decision 2026-10-12;
 * tools/wire-guards.mjs holds it). When another session saves a document this
 * one has read, the editor broadcasts `config_changed` and it is read again.
 */
@Injectable({ providedIn: 'root' })
export class ConfigDocumentsService {
  private ws = inject(WebsocketService);
  private gate = inject(PayloadVersionService);

  readonly documents = signal<Record<string, ConfigDocumentState>>({});

  /** Requests in flight, oldest first: the error frame does not say which one it answers. */
  private pending: string[] = [];

  constructor() {
    this.ws.messages.subscribe(frame => {
      switch (frame?.type) {
        case 'config_load': return this.onLoaded(frame.value);
        case 'config_load_failed': return this.onFailed(frame.value);
        case 'config_changed': return this.onChanged(frame.value);
      }
    });
    this.ws.errors.subscribe(error => {
      if (error?.action !== 'config_load') return;
      const key = this.pending.shift();
      if (key) this.set(key, { status: 'failed', message: error.message });
    });
    // A new connection may be a different editor: what was read is not known any more.
    this.gate.sessionRestarted.subscribe(() => {
      for (const key of Object.keys(this.documents())) this.request(key);
    });
  }

  state(schema: ConfigSchema, projectUuid: string | null): ConfigDocumentState | null {
    return this.documents()[configKey(schema, projectUuid)] ?? null;
  }

  load(schema: ConfigSchema, projectUuid: string | null): void {
    this.request(configKey(schema, projectUuid));
  }

  private request(key: string): void {
    const [schema, project] = key.split('|');
    this.set(key, { status: 'loading' });
    this.pending.push(key);
    this.ws.wsEmit({
      action: 'config_load',
      value: project ? { schema, project_uuid: project } : { schema },
    });
  }

  private onLoaded(value: any): void {
    if (!value?.schema) return;
    const key = configKey(value.schema, value.project_uuid ?? null);
    this.pending = this.pending.filter(k => k !== key);
    this.set(key, { status: 'loaded', exists: value.exists === true, revision: value.revision ?? null, document: value.document });
  }

  private onFailed(value: any): void {
    if (!value?.schema) return;
    const key = configKey(value.schema, value.project_uuid ?? null);
    this.pending = this.pending.filter(k => k !== key);
    this.set(key, { status: 'failed', message: value.message ?? JSON.stringify(value) });
  }

  private onChanged(value: any): void {
    if (!value?.schema) return;
    const key = configKey(value.schema, value.project_uuid ?? null);
    if (key in this.documents()) this.request(key);
  }

  private set(key: string, state: ConfigDocumentState): void {
    this.documents.update(all => ({ ...all, [key]: state }));
  }
}
