// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
import { Injectable, DestroyRef, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import * as CryptoJS from 'crypto-js';
import { AppConfig } from '../../core/config/app.config';
import { WebsocketService, WebSocketError } from '../websocket.service';

/*
 * Import of a project archive (a zip made by "Export"), ClickUp 1amfwm7kcjp.
 * The wire is cuems-editor's docs/project-archive.md, section 8:
 *
 * 1. The GUARD, on the main socket: {"action":"project_import","value":{"size","name"}}
 *    (+ "accept_loaded": true only after the operator accepted the loaded-project
 *    warning). Answer: {"type":"project_import","value":{"ticket","expires_s"}}, or the
 *    action error {"type":"error","action":"project_import","value":<text>}. A released
 *    editor answers {"type":"error","value":"unsupported action: ..."} with no action:
 *    an error with no action that arrives while our one guard is pending is its answer.
 * 2. The UPLOAD, on /upload: first frame {"action":"upload","value":{"name","size",
 *    "type":"PROJECT","ticket"}}; each {"ready":true} gets the next binary frame (at most
 *    IMPORT_CHUNK_BYTES); after the last one, {"action":"finished","value":<md5 hex>}.
 *    The socket STAYS OPEN: the editor checks and imports, sending {"progress":{...}}
 *    at least every 5 s, then {"imported":<report>} and {"close":true}. A failure is
 *    {"error":<text>,"fatal":true}, with a "report" once something was written.
 *
 * Success is ONLY the "imported" frame, never the sending of "finished".
 * The lists (projects, media) refresh through the editor's list_update frames.
 */

/** Binary frame size: the editor's socket refuses frames above 1 048 576 bytes. */
export const IMPORT_CHUNK_BYTES = 500000;

/** The editor waits up to 25 s for the engine before it answers the guard. */
const GUARD_TIMEOUT_MS = 60 * 1000;

/** How a released editor (no import) answers the guard. */
const OLD_EDITOR_PREFIX = 'unsupported action';

/** Start of the editor's I5 refusal (a project is loaded, no accept_loaded). */
const LOADED_REFUSAL_PREFIX = 'A project is loaded';

export type ImportPhase = 'idle' | 'guard' | 'upload' | 'work' | 'done' | 'failed';

/** The editor's progress frame: `check` in bytes, `media` in files, `project` once. */
export interface ImportProgress {
  phase: string;
  done: number;
  total: number;
  name: string;
}

/** The editor's report, in `imported` and beside a fatal error (section 8.3). */
export interface ImportReport {
  project?: { uuid?: string; name?: string; unix_name?: string; renamed?: boolean } | null;
  media?: {
    added?: string[];
    reused?: string[];
    renamed?: { from: string; to: string }[];
    missing?: string[];
    from_library?: string[];
  };
  sidecars_failed?: { name: string; what: string }[];
  relinked?: { project: string; name: string }[];
  ignored?: string[];
  warnings?: string[];
}

export interface ImportState {
  phase: ImportPhase;
  fileName: string;
  size: number;
  /** Bytes the editor has acknowledged. */
  sent: number;
  /** The editor's last progress frame (after `finished`). */
  progress: ImportProgress | null;
  /** The report: on success, or what a failure left written. */
  report: ImportReport | null;
  /** The editor's text, shown as it comes (English). */
  error: string | null;
  /** An i18n key, for what the editor could not say (old editor, connection closed...). */
  errorKey: string | null;
  /** Refused because a project is loaded and the warning was not accepted: the dialog may offer it. */
  canAcceptLoaded: boolean;
  /** Cancel pressed while the guard was pending: its answer is awaited and dropped. */
  cancelling: boolean;
}

const IDLE: ImportState = {
  phase: 'idle', fileName: '', size: 0, sent: 0, progress: null, report: null,
  error: null, errorKey: null, canAcceptLoaded: false, cancelling: false,
};

@Injectable({
  providedIn: 'root'
})
export class ImportService {
  private destroyRef = inject(DestroyRef);
  private wsService = inject(WebsocketService);

  private wsUploadUrl = `${AppConfig.websocketBaseUrl}/upload`;

  public readonly state = signal<ImportState>(IDLE);

  /** An import is under way in this tab: the project list stays locked. */
  public readonly busy = computed(() => {
    const phase = this.state().phase;
    return phase === 'guard' || phase === 'upload' || phase === 'work';
  });

  private file: File | null = null;
  private acceptLoadedSent = false;
  private guardTimer: ReturnType<typeof setTimeout> | null = null;
  // Guards that timed out: their answer may still come and must not be taken
  // as the answer of a later guard.
  private staleGuardAnswers = 0;
  private socket: WebSocketSubject<any> | null = null;
  // Bare error frames (no action) taken as the guard's answer, so that the other
  // subscribers of WebsocketService.errors can tell them apart whatever their order.
  private claimedErrors = new WeakSet<object>();

  constructor() {
    this.wsService.messages
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(message => this.onMainMessage(message));
    this.wsService.errors
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(error => this.onMainError(error));
  }

  /** True while the guard waits for its answer. */
  guardPending(): boolean {
    return this.state().phase === 'guard';
  }

  /**
   * Whether an error frame of the main socket is this import's: the app-level toast
   * leaves those to the import dialog. Asked by other subscribers of the same frame,
   * before or after this service handled it (a bare error is remembered once claimed).
   */
  ownsError(error: { action?: string | null }): boolean {
    return error.action === 'project_import'
        || this.claimedErrors.has(error)
        || (!error.action && this.guardPending());
  }

  /**
   * Ask the editor for an import of `file`. `acceptLoaded` only after the operator
   * accepted the loaded-project warning. Returns false when an import is already
   * under way (nothing is sent).
   */
  start(file: File, acceptLoaded: boolean): boolean {
    if (this.busy()) return false;
    this.file = file;
    this.acceptLoadedSent = acceptLoaded;
    this.state.set({ ...IDLE, phase: 'guard', fileName: file.name, size: file.size });

    if (file.size <= 0) {
      this.fail(null, 'project.import.error.empty');
      return true;
    }
    if (!this.wsService.isConnected()) {
      this.fail(null, 'project.import.error.offline');
      return true;
    }

    const message: { action: string; value: { size: number; name: string }; accept_loaded?: boolean } = {
      action: 'project_import',
      value: { size: file.size, name: file.name },
    };
    if (acceptLoaded) {
      message.accept_loaded = true;
    }
    this.guardTimer = setTimeout(() => {
      this.guardTimer = null;
      if (!this.guardPending()) return;
      this.staleGuardAnswers++;
      if (this.state().cancelling) {
        this.toIdle();
      } else {
        this.fail(null, 'project.import.error.no.answer');
      }
    }, GUARD_TIMEOUT_MS);
    this.wsService.wsEmit(message);
    return true;
  }

  /** The same file again, with the loaded-project warning accepted. */
  retryAcceptingLoaded(): void {
    const file = this.file;
    if (!file || this.state().phase !== 'failed' || !this.state().canAcceptLoaded) return;
    this.toIdle();
    this.start(file, true);
  }

  /**
   * Cancel before the editor works. While the guard is pending its answer is awaited
   * and dropped (no upload is opened); during the upload the socket is closed and the
   * editor drops the import. Once `finished` was sent the editor goes on: no cancel.
   */
  cancel(): void {
    const phase = this.state().phase;
    if (phase === 'guard') {
      this.state.update(s => ({ ...s, cancelling: true }));
    } else if (phase === 'upload') {
      this.closeSocket();
      this.toIdle();
    }
  }

  /** Forget a finished or failed import (its dialog was closed). */
  reset(): void {
    if (this.busy()) return;
    this.toIdle();
  }

  private toIdle(): void {
    this.clearGuardTimer();
    this.file = null;
    this.acceptLoadedSent = false;
    this.state.set(IDLE);
  }

  // --- the guard, on the main socket

  private onMainMessage(message: any): void {
    if (!message || message.type !== 'project_import') return;
    if (!this.guardPending()) {
      if (this.staleGuardAnswers > 0) this.staleGuardAnswers--;
      console.warn('ImportService: project_import answer with no guard pending, ignored');
      return;
    }
    this.clearGuardTimer();
    if (this.state().cancelling) {
      // Nothing is sent on /upload; the editor frees the slot when the ticket expires.
      this.toIdle();
      return;
    }
    const ticket = message.value?.ticket;
    if (typeof ticket !== 'string' || ticket === '') {
      this.fail(null, 'project.import.error.unknown');
      return;
    }
    this.beginUpload(ticket);
  }

  private onMainError(error: WebSocketError): void {
    if (!this.ownsError(error)) return;
    if (this.guardPending()) this.claimedErrors.add(error);
    if (!this.guardPending()) {
      if (error.action === 'project_import' && this.staleGuardAnswers > 0) this.staleGuardAnswers--;
      return;
    }
    this.clearGuardTimer();
    if (this.state().cancelling) {
      this.toIdle();
      return;
    }
    const raw = error.raw?.value;
    const text = typeof raw === 'string' ? raw : (error.message || '');
    if (!error.action && text.startsWith(OLD_EDITOR_PREFIX)) {
      this.fail(null, 'project.import.error.old.editor');
      return;
    }
    const canAcceptLoaded = !this.acceptLoadedSent && text.startsWith(LOADED_REFUSAL_PREFIX);
    this.fail(text || null, text ? null : 'project.import.error.unknown', null, canAcceptLoaded);
  }

  // --- the upload, on /upload

  private beginUpload(ticket: string): void {
    const file = this.file;
    if (!file) {
      this.fail(null, 'project.import.error.unknown');
      return;
    }
    const socket: WebSocketSubject<any> = webSocket({
      url: this.wsUploadUrl,
      serializer: (msg: any) => msg,
    });
    this.socket = socket;
    this.state.update(s => ({ ...s, phase: 'upload', sent: 0 }));

    // The MD5 of the whole zip, computed while it is sent (as the media upload does).
    const md5 = CryptoJS.algo.MD5.create();
    const reader = new FileReader();
    let offset = 0;          // bytes read and sent
    let finishedSent = false;

    reader.onload = (event) => {
      if (this.socket !== socket) return;
      const buffer = event.target?.result as ArrayBuffer | null;
      if (!buffer) return;
      socket.next(buffer);
      md5.update(CryptoJS.lib.WordArray.create(buffer));
      offset += buffer.byteLength;
    };
    reader.onerror = () => {
      if (this.socket !== socket) return;
      this.closeSocket();
      this.fail(null, 'project.import.error.read');
    };

    const onReady = () => {
      if (finishedSent) return;
      this.state.update(s => ({ ...s, sent: offset }));
      if (offset >= file.size) {
        finishedSent = true;
        const hashHex = md5.finalize().toString(CryptoJS.enc.Hex);
        socket.next(JSON.stringify({ action: 'finished', value: hashHex }));
        // Not a success: the editor now checks and imports, on this same socket.
        this.state.update(s => ({ ...s, phase: 'work', progress: null }));
        return;
      }
      const end = Math.min(offset + IMPORT_CHUNK_BYTES, file.size);
      reader.readAsArrayBuffer(file.slice(offset, end));
    };

    socket.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (frame: any) => {
        if (this.socket !== socket || !frame || typeof frame !== 'object') return;
        if ('error' in frame) {
          this.closeSocket();
          this.fail(String(frame.error), null, frame.report ?? null);
          return;
        }
        if ('imported' in frame) {
          this.state.update(s => ({ ...s, phase: 'done', report: frame.imported ?? {} }));
          return;
        }
        if (frame.progress) {
          if (this.state().phase === 'work') {
            this.state.update(s => ({ ...s, progress: this.toProgress(frame.progress) }));
          }
          return;
        }
        if (frame.close) {
          const ended = this.state().phase === 'done';
          this.closeSocket();
          if (!ended) this.fail(null, 'project.import.error.no.report');
          return;
        }
        if (frame.ready) {
          onReady();
        }
      },
      error: () => this.onUploadClosed(socket),
      complete: () => this.onUploadClosed(socket),
    });

    socket.next(JSON.stringify({
      action: 'upload',
      value: { name: file.name, size: file.size, type: 'PROJECT', ticket },
    }));
  }

  /** The socket closed and this service did not close it. */
  private onUploadClosed(socket: WebSocketSubject<any>): void {
    if (this.socket !== socket) return;
    this.socket = null;
    const phase = this.state().phase;
    if (phase === 'upload') {
      // Before `finished` the editor drops the import and removes what it received.
      this.fail(null, 'project.import.error.closed.upload');
    } else if (phase === 'work') {
      // After `finished` the editor goes on to its end; the lists refresh by list_update.
      this.fail(null, 'project.import.error.closed.work');
    }
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.complete();
  }

  private toProgress(value: any): ImportProgress {
    return {
      phase: typeof value?.phase === 'string' ? value.phase : '',
      done: Number(value?.done) || 0,
      total: Number(value?.total) || 0,
      name: typeof value?.name === 'string' ? value.name : '',
    };
  }

  private fail(error: string | null, errorKey: string | null,
               report: ImportReport | null = null, canAcceptLoaded = false): void {
    this.clearGuardTimer();
    this.state.update(s => ({
      ...s, phase: 'failed', error, errorKey, report, canAcceptLoaded, cancelling: false,
    }));
  }

  private clearGuardTimer(): void {
    if (this.guardTimer !== null) {
      clearTimeout(this.guardTimer);
      this.guardTimer = null;
    }
  }
}
