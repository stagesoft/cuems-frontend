// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
//
// The editor's media_check_report as a persistent warning, one per project,
// shown in an inline banner under the header (it covers no control)
// (ClickUp 869fat84r D20; cuems-RELATIONS Plans/2026-10-01-engine-late-go-media-probe.md §8.4).
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { WebsocketService } from '../websocket.service';
import { MediaCheckReport, MediaCheckService } from './media-check.service';

function report(over: Partial<MediaCheckReport> = {}): MediaCheckReport {
  return {
    project_uuid: 'p1', project_name: 'Show One', context: 'ready', complete: true, reason: null,
    files: [{ file_name: 'clip.mov', cues: 2,
              changes: [{ field: 'duration', stored: '00:00:10.010', current: '00:00:20.020' }] }],
    unverified: [], total_files: 1, ...over,
  };
}

describe('MediaCheckService', () => {
  let messages: Subject<any>;
  let service: MediaCheckService;

  beforeEach(() => {
    messages = new Subject<any>();
    TestBed.configureTestingModule({
      providers: [
        { provide: WebsocketService, useValue: { messages } },
        { provide: TranslateService, useValue: {
            instant: (key: string, params?: any) => params ? `${key} ${JSON.stringify(params)}` : key } },
      ],
    });
    service = TestBed.inject(MediaCheckService);
  });

  const shown = () => service.warnings();

  it('shows one persistent warning per project, with a title and one line per file', () => {
    messages.next({ type: 'media_check_report', value: report() });
    expect(shown().length).toBe(1);
    const n = shown()[0];
    expect(n.projectUuid).toBe('p1');
    expect(n.title).toContain('Show One');
    expect(n.content).toContain('clip.mov');
    expect(n.content).toContain('00:00:10.010');
    expect(n.content).toContain('00:00:20.020');
    expect(n.content.split('\n').length).toBeGreaterThan(1);
  });

  it('replaces the warning when the content changes, and leaves it when it does not', () => {
    messages.next({ type: 'media_check_report', value: report() });
    const first = shown()[0];
    messages.next({ type: 'media_check_report', value: report({ context: 'open' }) });
    expect(shown()).toEqual([first]);
    messages.next({ type: 'media_check_report', value: report({
      files: [{ file_name: 'other.mov', cues: 1, changes: [{ field: 'file_size', stored: '1', current: '2' }] }] }) });
    expect(shown().length).toBe(1);
    expect(shown()[0]).not.toBe(first);
    expect(shown()[0].content).toContain('other.mov');
  });

  it('does not bring back a dismissed warning whose content has not changed', () => {
    messages.next({ type: 'media_check_report', value: report() });
    service.dismiss('p1');
    expect(shown().length).toBe(0);
    messages.next({ type: 'media_check_report', value: report({ context: 'open' }) });
    expect(shown().length).toBe(0);
    messages.next({ type: 'media_check_report', value: report({
      files: [{ file_name: 'clip.mov', cues: 2, changes: [{ field: 'duration', stored: '00:00:10.010', current: '00:00:30.030' }] }] }) });
    expect(shown().length).toBe(1);                 // new content: shown again
  });

  it('clears only on a complete report with nothing stale and nothing unverified', () => {
    messages.next({ type: 'media_check_report', value: report() });
    messages.next({ type: 'media_check_report', value: report({ files: [], total_files: 0, complete: false, reason: 'engine_running' }) });
    expect(shown().length).toBe(1);
    messages.next({ type: 'media_check_report', value: report({ files: [], total_files: 0, unverified: ['clip.mov'] }) });
    expect(shown().length).toBe(1);
    expect(shown()[0].content).toContain('clip.mov');
    messages.next({ type: 'media_check_report', value: report({ files: [], total_files: 0, unverified: [] }) });
    expect(shown().length).toBe(0);
  });

  it('keeps one warning for each project', () => {
    messages.next({ type: 'media_check_report', value: report() });
    messages.next({ type: 'media_check_report', value: report({ project_uuid: 'p2', project_name: 'Show Two' }) });
    expect(shown().length).toBe(2);
  });

  it('lists at most five files and counts the rest', () => {
    const files = Array.from({ length: 8 }, (_, i) => ({
      file_name: `f${i}.mov`, cues: 1, changes: [{ field: 'duration', stored: '1', current: '2' }] }));
    messages.next({ type: 'media_check_report', value: report({ files, total_files: 30 }) });
    const content = shown()[0].content;
    expect(content).toContain('f4.mov');
    expect(content).not.toContain('f5.mov');
    expect(content).toContain('"count":25');
  });

  it('ignores every other message type', () => {
    messages.next({ type: 'project_ready', value: 'p1' });
    messages.next({ type: 'media_check_reports', value: report() });
    expect(shown().length).toBe(0);
  });
});
