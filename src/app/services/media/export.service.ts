// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
import { Injectable, inject } from '@angular/core';
import { WebsocketService } from '../websocket.service';
import { Subject } from 'rxjs';

const EXPORT_TIMEOUT_MS = 5 * 60 * 1000;

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  private webSocketService = inject(WebsocketService);
  public exportComplete = new Subject<string>(); // fileUrl
  public exportError = new Subject<string>();

  private exportInProgress = false;
  // The safety timer of the export in flight. It must die with that export: left
  // running it would release the button of a LATER export before its time.
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  // acceptLoaded: the operator saw the warning for a project that is loaded (armed, waiting for GO)
  // and accepted. The editor may ask for it (extra top-level key, as nodelist_modify's modify_action).
  exportProject(projectUuid: string, acceptLoaded = false): void {
    if (this.exportInProgress) {
      console.warn('Ya hay un export en curso, cancelando anterior intento');
    }
    this.settle();

    this.exportInProgress = true;

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
      if (this.exportInProgress) {
        console.warn('Export timed out, liberando exportInProgress');
        this.fail('Timeout exportación');
      }
    }, EXPORT_TIMEOUT_MS);
  }

  /** The export in flight is over (done, failed or replaced): flag down, timer cancelled. */
  private settle(): void {
    this.exportInProgress = false;
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  /** An error answer (or the timeout) ends the export in flight and tells the listeners. */
  fail(message: string): void {
    this.settle();
    this.exportError.next(message);
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

    if (message.type === 'project_export') {
      const fileUrl = this.extractFileUrl(message);

      if (!fileUrl) {
        this.fail('No se recibió URL');
      } else {
        this.exportComplete.next(fileUrl);
        this.downloadFile(fileUrl);
      }

      // Liberar bandera y temporizador siempre
      this.settle();
    }
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