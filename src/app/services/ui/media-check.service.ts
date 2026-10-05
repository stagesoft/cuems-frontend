// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
//
// Shows the editor's media_check_report as a persistent warning, one per
// project (ClickUp 869fat84r D20, D22).
//
// The editor checks a project's media files when the project is loaded,
// opened or saved. When a file was replaced by hand after its values were
// stored, the show keeps playing the stored values (duration, picture size)
// until the project is saved: the editor never rewrites a project on its own.
// This service tells the operator. Design: cuems-RELATIONS
// Plans/2026-10-01-engine-late-go-media-probe.md §8.3, §8.4.
import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { WebsocketService } from '../websocket.service';
import { NotificationService } from './notification.service';

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

/** Lines listed in one warning; the rest are counted. */
const MAX_LINES = 5;

@Injectable({ providedIn: 'root' })
export class MediaCheckService {
  private ws = inject(WebsocketService);
  private notifications = inject(NotificationService);
  private translate = inject(TranslateService);
  /** Per project: the warning shown, and the text it was shown with. */
  private shown = new Map<string, { id: number; text: string }>();

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
    const current = this.shown.get(uuid);
    if (current?.text === text) {
      return;   // unchanged: no flicker, and a dismissed warning stays dismissed
    }
    if (current) {
      this.notifications.remove(current.id);
    }
    const id = this.notifications.show('warning', content, title, false);
    this.shown.set(uuid, { id, text });
  }

  private clear(uuid: string): void {
    const current = this.shown.get(uuid);
    if (current) {
      this.notifications.remove(current.id);
      this.shown.delete(uuid);
    }
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
