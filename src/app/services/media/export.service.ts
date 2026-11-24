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

  exportProject(projectUuid: string): void {
    if (this.exportInProgress) {
      console.warn('Ya hay un export en curso, cancelando anterior intento');
      // Opcional: reset para forzar nuevo export
      this.exportInProgress = false;
    }

    this.exportInProgress = true;

    const message = {
      action: 'project_export',
      value: projectUuid,
    };

    this.sendMessageToWebSocket(message);

    // Safety timeout: the editor zips the project AND its media before it
    // answers (38 s measured for a small project), so allow minutes, not seconds.
    setTimeout(() => {
      if (this.exportInProgress) {
        console.warn('Export timed out, liberando exportInProgress');
        this.exportInProgress = false;
        this.exportError.next('Timeout exportación');
      }
    }, EXPORT_TIMEOUT_MS);
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
        this.exportError.next('No se recibió URL');
      } else {
        this.exportComplete.next(fileUrl);
        this.downloadFile(fileUrl);
      }

      // Liberar bandera siempre
      this.exportInProgress = false;
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