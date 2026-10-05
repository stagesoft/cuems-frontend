// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
//
// Keeps the editor's media_check_report as a persistent warning, one per
// project, shown by MediaWarningsComponent in an inline banner under the
// header, where it covers no control (ClickUp 869fat84r D20, D22).
//
// The editor checks a project's media files when the project is loaded,
// opened or saved. When a file was replaced by hand after its values were
// stored, the show keeps playing the stored values (duration, picture size)
// until the project is saved: the editor never rewrites a project on its own.
// This service tells the operator. Design: cuems-RELATIONS
// Plans/2026-10-01-engine-late-go-media-probe.md §8.3, §8.4.
import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { WebsocketService } from '../websocket.service';

export interface MediaChange {
  field: 'duration' | 'pixel_size' | 'file_size' | 'file_md5' | string;
  stored: string | null;
  current: string | null;
}

export interface MediaFileReport {
  file_name: string;
  cues: number;
  changes: MediaChange[];
}

export interface MediaCheckReport {
  project_uuid: string;
  project_name?: string | null;
  context: 'ready' | 'open' | 'save' | string;
  complete: boolean;
  reason?: string | null;
  files: MediaFileReport[];
  unverified: string[];
  total_files: number;
}

export interface MediaWarning {
  projectUuid: string;
  title: string;
  content: string;
}

/** Lines listed in one warning; the rest are counted. */
const MAX_LINES = 5;

@Injectable({ providedIn: 'root' })
export class MediaCheckService {
  private ws = inject(WebsocketService);
  private translate = inject(TranslateService);
  /** The warnings shown, one per project, in arrival order. */
  readonly warnings = signal<MediaWarning[]>([]);
  /** Per project: the text last reported (a dismissed warning stays hidden until it changes). */
  private known = new Map<string, string>();

  constructor() {
    this.ws.messages.subscribe(message => {
      if (message?.type === 'media_check_report' && message.value) {
        this.handle(message.value as MediaCheckReport);
      }
    });
  }

  handle(report: MediaCheckReport): void {
    const uuid = report?.project_uuid;
    if (!uuid) {
      return;
    }
    const files = report.files ?? [];
    const unverified = report.unverified ?? [];
    if (files.length === 0 && unverified.length === 0) {
      // Only a complete check clears a warning: an incomplete one (a show
      // running, a probe that failed, the time limit) proves nothing.
      if (report.complete) {
        this.clear(uuid);
      }
      return;
    }
    const title = this.t('mediaCheck.title', { project: report.project_name || uuid });
    const content = this.content(report, files, unverified);
    const text = `${title}\n${content}`;
    if (this.known.get(uuid) === text) {
      return;   // unchanged: no flicker, and a dismissed warning stays dismissed
    }
    this.known.set(uuid, text);
    const warning: MediaWarning = { projectUuid: uuid, title, content };
    this.warnings.update(list => {
      const at = list.findIndex(w => w.projectUuid === uuid);
      return at < 0 ? [...list, warning] : list.map((w, i) => (i === at ? warning : w));
    });
  }

  /** Hide a project's warning until its content changes. */
  dismiss(uuid: string): void {
    this.warnings.update(list => list.filter(w => w.projectUuid !== uuid));
  }

  private clear(uuid: string): void {
    this.known.delete(uuid);
    this.warnings.update(list => list.filter(w => w.projectUuid !== uuid));
  }

  private content(report: MediaCheckReport, files: MediaFileReport[], unverified: string[]): string {
    const lines: string[] = [];
    for (const file of files.slice(0, MAX_LINES)) {
      // What the operator sees and hears: the duration and the picture size.
      // A file whose size or MD5 alone changed is just "the file changed".
      const visible = file.changes.filter(c => c.field === 'duration' || c.field === 'pixel_size');
      const detail = visible.length
        ? visible.map(c => `${this.t(`mediaCheck.field.${c.field}`)} ${c.stored ?? '—'} → ${c.current ?? '—'}`).join(', ')
        : this.t('mediaCheck.fileChanged');
      const cues = file.cues > 1 ? ` ${this.t('mediaCheck.cues', { count: file.cues })}` : '';
      lines.push(`${file.file_name}${cues}: ${detail}`);
    }
    const listed = Math.min(files.length, MAX_LINES);
    const total = Math.max(report.total_files ?? files.length, files.length);
    if (total > listed) {
      lines.push(this.t('mediaCheck.more', { count: total - listed }));
    }
    for (const file of unverified.slice(0, MAX_LINES)) {
      lines.push(this.t('mediaCheck.unverified', { file }));
    }
    if (unverified.length > MAX_LINES) {
      lines.push(this.t('mediaCheck.more', { count: unverified.length - MAX_LINES }));
    }
    if (!report.complete) {
      lines.push(this.t('mediaCheck.incomplete'));
    }
    lines.push(this.t('mediaCheck.footer'));
    return lines.join('\n');
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.translate.instant(key, params);
  }
}
