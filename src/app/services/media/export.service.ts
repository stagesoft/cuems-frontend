// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subject, Subscription } from 'rxjs';
import { filter, take, timeout } from 'rxjs/operators';
import { WebsocketService, WebSocketError } from '../websocket.service';
import { NotificationService } from '../ui/notification.service';

const EXPORT_TIMEOUT_MS = 5 * 60 * 1000;
// How long the question "is a project loaded?" waits for its answer after a refusal.
const STATUS_TIMEOUT_MS = 30 * 1000;

interface ExportInFlight {
  uuid: string;
  /** The zip the editor will answer with is `<unix_name>.zip`; undefined: not checked. */
  unixName?: string;
  acceptLoaded: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  private webSocketService = inject(WebsocketService);
  private notificationService = inject(NotificationService);
  private translate = inject(TranslateService);

  /**
   * The uuid of a project whose export the editor refused although the request
   * carried no acceptance, while the engine now says a project IS loaded: the
   * screen's idea was stale, so the operator must get the warning dialog (E5).
   */
  public loadedRefusal = new Subject<string>();

  // The one export in flight of this tab. It lives here and not in the project
  // list: the list is destroyed when the operator navigates away, the export goes on.
  private current = signal<ExportInFlight | null>(null);
  // The safety timer of the export in flight. It must die with that export: left
  // running it would release the button of a LATER export before its time.
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private statusQuestion: Subscription | null = null;

  /** uuid of the project being exported; null when nothing is. */
  get exportingUuid(): string | null {
    return this.current()?.uuid ?? null;
  }

  // acceptLoaded: the operator saw the warning for a project that is loaded (armed, waiting for GO)
  // and accepted. The editor may ask for it (extra top-level key, as nodelist_modify's modify_action).
  // false: another export is in flight and this one was not sent.
  exportProject(projectUuid: string, acceptLoaded = false, unixName?: string): boolean {
    if (this.current() !== null) {
      console.warn('Ya hay un export en curso, no se envía otro');
      return false;
    }
    this.dropStatusQuestion();
    this.current.set({ uuid: projectUuid, unixName, acceptLoaded });

    const message: { action: string; value: string; accept_loaded?: boolean } = {
      action: 'project_export',
      value: projectUuid,
    };
    if (acceptLoaded) {
      message.accept_loaded = true;
    }

    this.sendMessageToWebSocket(message);

    // Safety timeout: the editor zips the project AND its media before it
    // answers (38 s measured for a small project), so allow minutes, not seconds.
    this.timeoutHandle = setTimeout(() => {
      this.timeoutHandle = null;
      console.warn('Export timed out, liberando el export en curso');
      this.fail('project.export.error.timeout');
    }, EXPORT_TIMEOUT_MS);
    return true;
  }

  /** The export in flight is over (done or failed): lock released, timer cancelled. */
  private settle(): void {
    this.current.set(null);
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  /** A failure only this tab knows about: nobody else tells the operator, so this does. */
  private fail(messageKey: string): void {
    this.settle();
    this.notificationService.showError(this.translate.instant(messageKey));
  }

  /**
   * The editor's error answer to project_export. The app-wide handler already
   * shows its text. An error that names another project belongs to an earlier
   * export (one this tab gave up on) and releases nothing.
   */
  refused(error: WebSocketError): void {
    const sent = this.current();
    if (sent === null) return;
    const answeredUuid = error.raw?.uuid;
    if (answeredUuid && answeredUuid !== sent.uuid) {
      console.warn('Export error for another project, ignored:', answeredUuid);
      return;
    }
    this.settle();
    // A request that already carried the acceptance is never asked about again.
    if (!sent.acceptLoaded) {
      this.askIfLoaded(sent.uuid);
    }
  }

  // The error answer carries no code, and its text is for people: ask the engine's
  // state afresh instead of reading the sentence.
  private askIfLoaded(projectUuid: string): void {
    this.dropStatusQuestion();
    this.statusQuestion = this.webSocketService.messages
      .pipe(
        filter((message: any) => message?.type === 'project_status'),
        take(1),
        timeout(STATUS_TIMEOUT_MS),
      )
      .subscribe({
        next: (message: any) => {
          if (message.value?.status === 'loaded' && this.current() === null) {
            this.loadedRefusal.next(projectUuid);
          }
        },
        error: () => console.warn('No project_status answer after the export refusal'),
      });
    this.sendMessageToWebSocket({ action: 'project_status' });
  }

  private dropStatusQuestion(): void {
    this.statusQuestion?.unsubscribe();
    this.statusQuestion = null;
  }

  private sendMessageToWebSocket(message: any): void {
    if (typeof (this.webSocketService as any).wsEmit === 'function') {
      (this.webSocketService as any).wsEmit(message);
    } else {
      throw new Error('WebSocketService no tiene método para enviar mensajes');
    }
  }

  processServerResponse(message: any): void {
    if (!message || typeof message !== 'object') return;
    if (message.type !== 'project_export') return;

    const sent = this.current();
    if (sent === null) {
      // Nothing waits for it: this tab already gave up and told the operator.
      console.warn('Late project_export answer, ignored');
      return;
    }

    const fileUrl = this.extractFileUrl(message);
    if (!fileUrl) {
      this.fail('project.export.error.nourl');
      return;
    }
    if (sent.unixName && fileUrl.split('/').pop() !== `${sent.unixName}.zip`) {
      console.warn('project_export answer for another project, ignored:', fileUrl);
      return;
    }

    this.settle();
    this.downloadFile(fileUrl);
  }

  private extractFileUrl(message: any): string {
    const url = typeof message.value === 'string'
      ? message.value
      : message.value?.fileUrl || message.value?.url;
    if (!url) return url;
    // The editor answers with a path relative to its export root
    // ("exports/<name>.zip"). Resolved against the current page it would
    // depend on the route (/projects/edit/... -> /projects/edit/exports/...),
    // so anchor it at the site root.
    return /^([a-z][a-z0-9+.-]*:|\/)/i.test(url) ? url : '/' + url;
  }

  private downloadFile(fileUrl: string): void {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = decodeURIComponent(fileUrl.split('/').pop() || '') || 'project.zip';
    link.target = '_blank';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}