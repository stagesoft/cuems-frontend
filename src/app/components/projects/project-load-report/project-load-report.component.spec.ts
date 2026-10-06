import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectLoadReportComponent } from './project-load-report.component';
import { LoadReportService } from '../../../services/projects/load-report.service';
import { ProjectsService } from '../../../services/projects/projects.service';
import { WebsocketService } from '../../../services/websocket.service';
import { NotificationService } from '../../../services/ui/notification.service';
import { FakeRouter, FakeWebsocketService } from '../../../testing/characterization-harness';
import { Router } from '@angular/router';
import { loadFixture } from '../../../testing/load-fixture';

/** User Story 4: the report, the acknowledgement, refused saves, the failure form (T073). */
describe('ProjectLoadReport', () => {
  let ws: FakeWebsocketService;
  let reports: LoadReportService;
  let projects: ProjectsService;
  let notifications: NotificationService;
  let fixture: ComponentFixture<ProjectLoadReportComponent>;

  const el = () => fixture.nativeElement as HTMLElement;
  const q = (test: string) => el().querySelector(`[data-test="${test}"]`);
  const qa = (test: string) => el().querySelectorAll(`[data-test="${test}"]`);
  const render = () => { fixture.detectChanges(); TestBed.flushEffects(); fixture.detectChanges(); };

  const repaired = () => loadFixture('load-repaired');
  const ids = (frame: any) => ({ project_uuid: frame.value.project_uuid, report_id: frame.value.report_id });
  const refused = (frame: any, reason: string) => ({ type: 'repair_save_refused', value: { ...ids(frame), reason } });
  const echo = (frame: any) => ({ type: 'repair_acknowledge', value: ids(frame) });
  const saves = () => ws.sent.filter(m => m.action === 'project_save');
  const acks = () => ws.sent.filter(m => m.action === 'repair_acknowledge');

  beforeEach(() => {
    localStorage.clear();
    ws = new FakeWebsocketService();
    TestBed.configureTestingModule({
      imports: [ProjectLoadReportComponent, TranslateModule.forRoot()],
      providers: [
        { provide: WebsocketService, useValue: ws },
        { provide: Router, useValue: new FakeRouter() },
      ],
    });
    projects = TestBed.inject(ProjectsService);
    reports = TestBed.inject(LoadReportService);
    notifications = TestBed.inject(NotificationService);
    spyOn(notifications, 'showInfo');
    fixture = TestBed.createComponent(ProjectLoadReportComponent);
  });

  afterEach(() => localStorage.clear());

  /** Load, save (refused or not later), as the edit page does. */
  function loadAndSave(frame: any) {
    ws.receive(frame);
    render();
    projects.updateProject({ CuemsScript: { id: frame.value.project_uuid } });
  }

  describe('outcomes', () => {
    it('clean: discoverable, not interrupting', () => {
      ws.receive(loadFixture('project-013-load-report'));
      const clean = loadFixture('project-013-load-report');
      clean.value.outcome = 'clean'; clean.value.conversions = []; clean.value.file_differs_from_loaded = false;
      ws.receive(clean);
      render();
      expect(q('report')).toBeNull();
      expect(q('report-note')?.textContent).toContain('load.report.outcome.clean');
      expect(q('needs-saving')).toBeNull();
    });

    it('converted: shown before editing, each conversion listed, "needs saving"', () => {
      ws.receive(loadFixture('project-013-load-report'));
      render();
      expect(q('report')).not.toBeNull();
      expect(qa('conversion').length).toBe(1);
      expect(q('needs-saving')).not.toBeNull();
      expect(reports.report()?.shown).toBeTrue();
    });

    it('repaired: each repair field by field — cue, field, was, now, rule', () => {
      ws.receive(repaired());
      render();
      const row = qa('repair')[0].textContent!;
      expect(row).toContain('00000000-0000-4000-8000-0000000000a1');
      expect(row).toContain('target');
      expect(row).toContain('11111111-1111-4111-8111-111111111111');
      expect(row).toContain('—');                 // substituted null
      expect(row).toContain('target_resolves');
    });

    it('a new load replaces the report', () => {
      ws.receive(repaired());
      ws.receive(loadFixture('project-013-load-report'));
      expect(reports.report()?.outcome).toBe('converted');
    });
  });

  describe('acknowledgement', () => {
    it('is sent only once the report has been shown, from the operator', () => {
      ws.receive(repaired());
      reports.acknowledge();                       // not rendered yet: never for an unseen report
      expect(acks()).toEqual([]);
      render();
      (q('acknowledge') as HTMLButtonElement).click();
      expect(acks()).toEqual([{ action: 'repair_acknowledge', value: ids(repaired()) }]);
    });

    it('the echo marks it acknowledged', () => {
      ws.receive(repaired());
      render();
      reports.acknowledge();
      ws.receive(echo(repaired()));
      render();
      expect(reports.report()?.acknowledged).toBeTrue();
      expect(q('acknowledge')).toBeNull();
    });
  });

  describe('a refused save', () => {
    it('unacknowledged, report shown: explained, acknowledgement offered, then the save retried once', () => {
      loadAndSave(repaired());
      ws.receive(refused(repaired(), 'unacknowledged'));
      render();
      expect(q('save-refused')?.textContent).toContain('load.refused.unacknowledged');
      expect(reports.refusal()).toEqual({ kind: 'unacknowledged', report_id: repaired().value.report_id, reportShown: true });
      expect(acks()).toEqual([]);                  // offered, not sent

      reports.acknowledge();
      ws.receive(echo(repaired()));
      expect(saves().length).toBe(2);              // the go-ahead: one retry
      expect(saves()[1]).toEqual(saves()[0]);
      expect(reports.refusal()).toBeNull();
    });

    it('unacknowledged, report never shown: nothing is sent; it waits for the operator', () => {
      ws.receive(repaired());                      // not rendered
      projects.updateProject({ CuemsScript: {} });
      ws.receive(refused(repaired(), 'unacknowledged'));
      expect(reports.refusal()).toEqual(jasmine.objectContaining({ kind: 'unacknowledged', reportShown: false }));
      expect(acks()).toEqual([]);
      expect(saves().length).toBe(1);
    });

    it('after a reconnect, a report the operator acknowledged is re-acknowledged and the save retried once, and they are told', () => {
      loadAndSave(repaired());
      reports.acknowledge();
      ws.receive(echo(repaired()));
      ws.connect();                                // new editor session: acknowledgement forgotten
      expect(reports.report()?.acknowledged).toBeFalse();

      projects.updateProject({ CuemsScript: {} });
      ws.receive(refused(repaired(), 'unacknowledged'));
      expect(acks().length).toBe(2);
      expect(notifications.showInfo).toHaveBeenCalledWith('load.report.reacknowledged');
      ws.receive(echo(repaired()));
      expect(saves().length).toBe(3);              // original, after reconnect, one retry
    });

    it('a second refusal after the retry is surfaced, never retried again', () => {
      loadAndSave(repaired());
      reports.acknowledge();
      ws.receive(echo(repaired()));
      ws.connect();
      projects.updateProject({ CuemsScript: {} });
      ws.receive(refused(repaired(), 'unacknowledged'));
      ws.receive(echo(repaired()));
      const savesBefore = saves().length;
      ws.receive(refused(repaired(), 'unacknowledged'));
      ws.receive(echo(repaired()));
      render();
      expect(saves().length).toBe(savesBefore);
      expect(reports.refusal()?.kind).toBe('retry_refused');
      expect(q('save-refused')?.textContent).toContain('load.refused.retry-refused');
    });

    it('preserve_failed: says plainly that nothing was written', () => {
      loadAndSave(repaired());
      ws.receive(refused(repaired(), 'preserve_failed'));
      render();
      expect(q('save-refused')?.textContent).toContain('load.refused.preserve-failed');
      expect(saves().length).toBe(1);
    });
  });

  describe('document_load_failed', () => {
    it('shows document, cue, field, the library message and all three next steps', () => {
      ws.receive(loadFixture('load-failed'));
      render();
      const text = q('load-failed')!.textContent!;
      const failed = loadFixture('load-failed').value;
      expect(text).toContain(failed.document);
      expect(text).toContain('00000000-0000-4000-8000-0000000000a4');
      expect(text).toContain('action_target');
      expect(text).toContain(failed.message);
      expect(Array.from(qa('next-step')).map(e => e.textContent!.trim())).toEqual([
        'load.failed.next.restore_from_conversion_backup',
        'load.failed.next.correct_field_by_hand',
        'load.failed.next.remove_document',
      ]);
      expect(text).toContain('load.failed.still-listed');
    });

    it('keeps the project listed and the session usable', () => {
      const failed = loadFixture('load-failed').value;
      projects.updateProjects([{ uuid: failed.project_uuid, name: 'p', unix_name: 'p', created: '', modified: '' }]);
      ws.receive(loadFixture('load-failed'));
      expect(projects.projects().map(p => p.uuid)).toEqual([failed.project_uuid]);
      expect(reports.report()).toBeNull();
      ws.receive(repaired());                    // the next load works as usual
      expect(reports.failure()).toBeNull();
    });
  });

  it('a duplicate\'s report is surfaced the same way, with nothing to acknowledge (T072)', () => {
    ws.receive({ type: 'project_duplicate', value: { uuid: 'a', new_uuid: 'b', report: repaired().value } });
    render();
    expect(q('duplicate-report')?.textContent).toContain('load.report.outcome.repaired');
    expect(q('acknowledge')).toBeNull();
  });
});
