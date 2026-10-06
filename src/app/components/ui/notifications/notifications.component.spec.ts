// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
//
// The notification card shows a title, keeps the content's lines, and has a
// warning icon (ClickUp 869fat84r D20, plan §8.4: it showed the content only).
import { TestBed } from '@angular/core/testing';
import { NotificationsComponent } from './notifications.component';
import { NotificationService } from '../../../services/ui/notification.service';

describe('NotificationsComponent', () => {
  it('shows the title, keeps the lines and marks a warning', () => {
    TestBed.configureTestingModule({ imports: [NotificationsComponent], providers: [NotificationService] });
    const service = TestBed.inject(NotificationService);
    service.show('warning', 'line one\nline two', 'The Title', false);
    const fixture = TestBed.createComponent(NotificationsComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('The Title');
    const content = el.querySelector('[data-notification-content]') as HTMLElement;
    expect(content.textContent).toContain('line one\nline two');
    expect(content.className).toContain('whitespace-pre-line');
    expect(el.querySelector('[data-notification-icon="warning"]')).not.toBeNull();
  });
});
