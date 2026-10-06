import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { ModalComponent } from '../../ui/modal/modal.component';
import { LoadReportService } from '../../../services/projects/load-report.service';

/**
 * What the editor did to a document on load, and what that means for saving
 * (User Story 4).
 *
 * A converted or repaired outcome is put in front of the operator before they
 * edit, field by field; a clean one stays discoverable without interrupting.
 * A refused save is explained in terms of the report, with the
 * acknowledgement on offer. A document that could not be loaded is shown with
 * the library's message and all three ways forward, while the session — and
 * the project in the list — stay usable.
 */
@Component({
  selector: 'app-project-load-report',
  standalone: true,
  imports: [CommonModule, TranslateModule, ModalComponent],
  templateUrl: './project-load-report.component.html',
})
export class ProjectLoadReportComponent {
  readonly reports = inject(LoadReportService);

  readonly report = this.reports.report;
  readonly failure = this.reports.failure;
  readonly refusal = this.reports.refusal;
  readonly duplicateReport = this.reports.duplicateReport;

  /** The operator closed the report; reopened from the clean/needs-saving note. */
  private readonly closedReportId = signal<string | null>(null);
  private readonly openedOnDemand = signal(false);

  readonly reportOpen = computed(() => {
    const report = this.report();
    if (!report) return false;
    if (this.openedOnDemand()) return true;
    return report.outcome !== 'clean' && this.closedReportId() !== report.report_id;
  });

  constructor() {
    // Rendering it is what makes it acknowledgeable (never for an unseen report).
    effect(() => {
      const report = this.report();
      if (report && this.reportOpen()) this.reports.markShown(report.report_id);
    });
  }

  openReport(): void {
    this.openedOnDemand.set(true);
  }

  closeReport(): void {
    this.openedOnDemand.set(false);
    this.closedReportId.set(this.report()?.report_id ?? null);
  }

  acknowledge(): void {
    this.reports.acknowledge();
  }

  /** From a refusal: show the report it names (if it is this one) and offer the acknowledgement. */
  showRefusedReport(): void {
    this.openReport();
  }

  /** `<cue_id>/<field>` split for display. */
  repairTarget(fieldPath: string): { cue: string; field: string } {
    const slash = fieldPath.lastIndexOf('/');
    return slash < 0 ? { cue: '', field: fieldPath } : { cue: fieldPath.slice(0, slash), field: fieldPath.slice(slash + 1) };
  }

  display(value: unknown): string {
    return value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}
