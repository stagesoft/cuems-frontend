// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
//
// The media warnings as an inline banner under the header: it covers no
// control, keeps the lines, and can be dismissed (ClickUp 869fat84r D20).
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MediaWarningsComponent } from './media-warnings.component';
import { MediaCheckService, MediaWarning } from '../../../services/ui/media-check.service';

describe('MediaWarningsComponent', () => {
  it('renders each warning inline, with its title and lines, and dismisses it', () => {
    const warnings = signal<MediaWarning[]>([
      { projectUuid: 'p1', title: 'The Title', content: 'line one\nline two' }]);
    const dismiss = jasmine.createSpy('dismiss');
    TestBed.configureTestingModule({
      imports: [MediaWarningsComponent],
      providers: [{ provide: MediaCheckService, useValue: { warnings, dismiss } }],
    });
    const fixture = TestBed.createComponent(MediaWarningsComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('The Title');
    const content = el.querySelector('[data-media-warning-content]') as HTMLElement;
    expect(content.textContent).toContain('line one\nline two');
    expect(content.className).toContain('whitespace-pre-line');
    expect(getComputedStyle(el.querySelector('[data-media-warning]') as Element).position).not.toBe('fixed');
    (el.querySelector('[data-media-warning-dismiss]') as HTMLElement).click();
    expect(dismiss).toHaveBeenCalledWith('p1');
  });
});
