// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ModalComponent } from '../modal/modal.component';
import { IconComponent } from '../icon/icon.component';
import { ImportReport, ImportState } from '../../../services/media/import.service';

/** One block of the report: a title (i18n key), an optional hint, its lines. */
export interface ImportReportSection {
  titleKey: string;
  hintKey?: string;
  lines: string[];
  tone: 'normal' | 'warning';
}

/**
 * The progress of a project import and then its report (1amfwm7kcjp).
 * Presentational: the state comes from ImportService, the actions go back to the
 * page. It cannot be dismissed while the import is under way; Cancel is offered
 * only before the editor starts working (the guard and the upload).
 */
@Component({
  selector: 'app-import-dialog',
  standalone: true,
  imports: [CommonModule, TranslateModule, ModalComponent, IconComponent],
  templateUrl: './import-dialog.component.html'
})
export class ImportDialogComponent {
  @Input({ required: true }) state!: ImportState;

  @Output() cancel = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  @Output() acceptLoaded = new EventEmitter<void>();

  get isOpen(): boolean {
    return this.state.phase !== 'idle';
  }

  get isWorking(): boolean {
    const phase = this.state.phase;
    return phase === 'guard' || phase === 'upload' || phase === 'work';
  }

  get canCancel(): boolean {
    return (this.state.phase === 'guard' && !this.state.cancelling) || this.state.phase === 'upload';
  }

  get titleKey(): string {
    switch (this.state.phase) {
      case 'done': return 'project.import.title.done';
      case 'failed': return 'project.import.title.failed';
      default: return 'project.import.title.working';
    }
  }

  /** What is happening now, as an i18n key. */
  get stepKey(): string {
    if (this.state.phase === 'guard') {
      return this.state.cancelling ? 'project.import.step.cancelling' : 'project.import.step.guard';
    }
    if (this.state.phase === 'upload') return 'project.import.step.upload';
    switch (this.state.progress?.phase) {
      case 'check': return 'project.import.step.check';
      case 'media': return 'project.import.step.media';
      case 'project': return 'project.import.step.project';
      default: return 'project.import.step.check';
    }
  }

  /** The file the editor is on, when it says. */
  get stepName(): string {
    return this.state.phase === 'work' ? (this.state.progress?.name || '') : '';
  }

  /** The bar, 0 to 100; null when there is no measure (the guard, the project's creation). */
  get percent(): number | null {
    const s = this.state;
    if (s.phase === 'upload') {
      return s.size > 0 ? Math.min(100, Math.round((s.sent * 100) / s.size)) : 0;
    }
    if (s.phase === 'work' && s.progress && s.progress.total > 0 && s.progress.phase !== 'project') {
      return Math.min(100, Math.round((s.progress.done * 100) / s.progress.total));
    }
    return null;
  }

  /** "12 / 30" under the bar: MB for bytes, a count for files. */
  get countText(): string {
    const s = this.state;
    if (s.phase === 'upload') return `${this.mb(s.sent)} / ${this.mb(s.size)}`;
    if (s.phase !== 'work' || !s.progress || s.progress.total <= 0) return '';
    if (s.progress.phase === 'check') return `${this.mb(s.progress.done)} / ${this.mb(s.progress.total)}`;
    if (s.progress.phase === 'media') return `${s.progress.done} / ${s.progress.total}`;
    return '';
  }

  get fileSize(): string {
    return this.mb(this.state.size);
  }

  get projectName(): string {
    return this.state.report?.project?.name || '';
  }

  get projectUnixName(): string {
    return this.state.report?.project?.unix_name || '';
  }

  get projectRenamed(): boolean {
    return this.state.report?.project?.renamed === true;
  }

  get sections(): ImportReportSection[] {
    return buildReportSections(this.state.report);
  }

  onModalClose(): void {
    // Escape or a click outside: only a finished dialog goes away.
    if (!this.isWorking) this.close.emit();
  }

  private mb(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/** The report as readable blocks, empty ones left out. */
export function buildReportSections(report: ImportReport | null): ImportReportSection[] {
  if (!report) return [];
  const media = report.media || {};
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter(v => v !== null && v !== undefined).map(v => String(v)) : [];
  const sections: ImportReportSection[] = [
    { titleKey: 'project.import.report.added', lines: list(media.added), tone: 'normal' },
    { titleKey: 'project.import.report.reused', lines: list(media.reused), tone: 'normal' },
    {
      titleKey: 'project.import.report.renamed',
      hintKey: 'project.import.report.renamed.hint',
      lines: (media.renamed || []).map(r => `${r?.from ?? ''} → ${r?.to ?? ''}`),
      tone: 'normal',
    },
    {
      titleKey: 'project.import.report.missing',
      hintKey: 'project.import.report.missing.hint',
      lines: list(media.missing),
      tone: 'warning',
    },
    {
      titleKey: 'project.import.report.from_library',
      hintKey: 'project.import.report.from_library.hint',
      lines: list(media.from_library),
      tone: 'warning',
    },
    {
      titleKey: 'project.import.report.sidecars_failed',
      lines: (report.sidecars_failed || []).map(f => `${f?.name ?? ''} (${f?.what ?? ''})`),
      tone: 'warning',
    },
    {
      titleKey: 'project.import.report.relinked',
      hintKey: 'project.import.report.relinked.hint',
      lines: (report.relinked || []).map(r => `${r?.project ?? ''}: ${r?.name ?? ''}`),
      tone: 'normal',
    },
    { titleKey: 'project.import.report.warnings', lines: list(report.warnings), tone: 'warning' },
    {
      titleKey: 'project.import.report.ignored',
      hintKey: 'project.import.report.ignored.hint',
      lines: list(report.ignored),
      tone: 'normal',
    },
  ];
  return sections.filter(section => section.lines.length > 0);
}
