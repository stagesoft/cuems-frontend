import { Injectable, inject, signal } from '@angular/core';
import { WebsocketService } from '../websocket.service';
import { PayloadVersionService } from '../../core/payload-version.service';
import { NotificationService } from '../ui/notification.service';
import { TranslateService } from '@ngx-translate/core';

/** `document_load_report` — sent after every successful load, a clean one included. */
export interface LoadReport {
  report_id: string;
  project_uuid: string;
  document: string;
  outcome: 'clean' | 'converted' | 'repaired';
  /** Editor state about the file (a JSON boolean): a load never writes, so the file needs saving. */
  file_differs_from_loaded: boolean;
  conversions: Array<{ from_version: number; to_version: number; description: string; dropped_elements: string[] }>;
  repairs: Array<{ field_path: string; previous_value: unknown; substituted_value: unknown; rule_name: string }>;
}

/** `document_load_failed` — sent instead of `project`; the project stays listed. */
export interface LoadFailure {
  project_uuid: string;
  document: string;
  cue_id: string | null;
  field: string | null;
  message: string;
  next_steps: string[];
}

export interface ShownReport extends LoadReport {
  /** This tab has put the report in front of the operator. */
  shown: boolean;
  /** The editor holds this session's acknowledgement (lost on a reconnect). */
  acknowledged: boolean;
}

export type SaveRefusal =
  | { kind: 'unacknowledged'; report_id: string; reportShown: boolean }
  | { kind: 'retry_refused'; report_id: string }
  | { kind: 'preserve_failed'; report_id: string };

/**
 * The repair gate (User Story 4): load reports, acknowledgement, and what a
 * refused save means.
 *
 * The editor refuses to save a project this session opened as converted or
 * repaired until this session acknowledges that report. Acknowledgement is
 * the operator's: it is only ever sent for a report this tab has shown
 * them. Its echo is the go-ahead to retry the save that was refused.
 *
 * A reconnect is a new editor session, which forgets acknowledgements — and,
 * against today's editor, the whole repair state. A project whose last report
 * was not clean is therefore reloaded on reconnect (owner's decision, F22).
 * Should a refusal still name a report the operator already acknowledged
 * here, the acknowledgement is re-sent and the save retried — at most once,
 * and the operator is told. Anything else is put in front of them, never
 * retried.
 */
@Injectable({ providedIn: 'root' })
export class LoadReportService {
  private ws = inject(WebsocketService);
  private gate = inject(PayloadVersionService);
  private notifications = inject(NotificationService);
  private translate = inject(TranslateService);

  /** The report of the project this session loaded last. A new load replaces it. */
  readonly report = signal<ShownReport | null>(null);
  readonly failure = signal<LoadFailure | null>(null);
  readonly refusal = signal<SaveRefusal | null>(null);
  /** A duplicate's report: the copy is the repaired document, nothing to acknowledge. */
  readonly duplicateReport = signal<LoadReport | null>(null);

  /** Reports the operator acknowledged in this tab, across reconnects. */
  private acknowledgedByOperator = new Set<string>();
  /** Reports whose refused save has already been retried once. */
  private retried = new Set<string>();
  private lastSave: any = null;
  private retryPending = false;

  constructor() {
    this.ws.messages.subscribe(frame => this.onFrame(frame));
    // A new editor session holds no repair state at all (findings F22): it
    // would save a repaired document unacknowledged and without preserving
    // the original. Reloading a project whose last report was not clean makes
    // the editor rebuild that state; its new report is shown and must be
    // acknowledged again. Unsaved cue edits survive as temporary cues.
    this.gate.sessionRestarted.subscribe(() => {
      const current = this.report();
      if (!current) return;
      this.report.set({ ...current, acknowledged: false });
      if (current.outcome !== 'clean') {
        this.ws.wsEmit({ action: 'project_load', value: current.project_uuid });
      }
    });
  }

  /** ProjectsService tells us what it sent, so a refused save can be retried. */
  noteSave(payload: any): void {
    this.lastSave = payload;
  }

  /** The report is on screen. Only now may it be acknowledged. */
  markShown(reportId: string): void {
    const current = this.report();
    if (current?.report_id === reportId && !current.shown) {
      this.report.set({ ...current, shown: true });
    }
  }

  /** The operator acknowledges the report they were shown. */
  acknowledge(): void {
    const current = this.report();
    if (!current || !current.shown) return;   // never for a report no human has seen
    this.acknowledgedByOperator.add(current.report_id);
    if (this.refusal()?.kind === 'unacknowledged' && this.refusal()!.report_id === current.report_id) {
      this.retryPending = true;
    }
    this.sendAcknowledge(current);
  }

  dismissRefusal(): void {
    this.refusal.set(null);
  }

  dismissFailure(): void {
    this.failure.set(null);
  }

  dismissDuplicateReport(): void {
    this.duplicateReport.set(null);
  }

  private sendAcknowledge(report: { project_uuid: string; report_id: string }): void {
    this.ws.wsEmit({
      action: 'repair_acknowledge',
      value: { project_uuid: report.project_uuid, report_id: report.report_id },
    });
  }

  private onFrame(frame: any): void {
    switch (frame?.type) {
      case 'document_load_report':
        if (!frame.value?.report_id) return;
        this.report.set({ ...frame.value, shown: false, acknowledged: false });
        this.failure.set(null);
        this.refusal.set(null);
        this.retryPending = false;
        return;

      case 'document_load_failed':
        if (!frame.value) return;
        this.failure.set(frame.value);
        this.report.set(null);
        return;

      case 'project_duplicate':
        if (frame.value?.report) this.duplicateReport.set(frame.value.report);
        return;

      case 'repair_acknowledge':
        this.onAcknowledged(frame.value);
        return;

      case 'repair_save_refused':
        this.onRefused(frame.value);
        return;
    }
  }

  private onAcknowledged(value: any): void {
    const current = this.report();
    if (!current || value?.report_id !== current.report_id) return;
    this.report.set({ ...current, acknowledged: true });
    if (this.retryPending && this.lastSave) {
      this.retryPending = false;
      this.retried.add(current.report_id);
      this.refusal.set(null);
      this.ws.wsEmit({ action: 'project_save', value: this.lastSave });
    }
  }

  private onRefused(value: any): void {
    const reportId: string = value?.report_id;
    if (!reportId) return;

    if (value.reason === 'preserve_failed') {
      this.retryPending = false;
      this.refusal.set({ kind: 'preserve_failed', report_id: reportId });
      return;
    }

    // unacknowledged
    if (this.retried.has(reportId)) {
      // Refused again after the one retry: the operator decides, not a loop.
      this.retryPending = false;
      this.refusal.set({ kind: 'retry_refused', report_id: reportId });
      return;
    }

    const current = this.report();
    if (this.acknowledgedByOperator.has(reportId) && current?.report_id === reportId) {
      // The operator acknowledged this report; the editor lost it (a reconnect).
      this.retryPending = true;
      this.sendAcknowledge({ project_uuid: value.project_uuid, report_id: reportId });
      this.notifications.showInfo(this.translate.instant('load.report.reacknowledged'));
      return;
    }

    this.refusal.set({
      kind: 'unacknowledged',
      report_id: reportId,
      reportShown: current?.report_id === reportId && current.shown,
    });
  }
}
