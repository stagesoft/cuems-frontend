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
 *    editor answers {"type":"error","value":"unsupported action: {...'project_import'...}"}
 *    with no action: that error, while our one guard is pending, is its answer. Any other
 *    error with no action is left to the app's toast.
 * 2. The UPLOAD, on /upload: first frame {"action":"upload","value":{"name","size",
 *    "type":"PROJECT","ticket"}}; each {"ready":true} gets the next binary frame (at most
 *    IMPORT_CHUNK_BYTES); after the last one, {"action":"finished","value":<md5 hex>}.
 *    The socket STAYS OPEN: the editor checks and imports, sending {"progress":{...}}
 *    at least every 5 s, then {"imported":<report>} and {"close":true}. A failure is
 *    {"error":<text>,"fatal":true}, with a "report" once something was written.
 *
 * Success is ONLY the "imported" frame, never the sending of "finished". After
 * "finished", a socket that closes, or a "close" without "imported", leaves the
 * outcome UNKNOWN (the editor goes on to its end): phase 'unknown', not 'failed'.
 * The lists (projects, media) refresh through the editor's list_update frames.
 */

/** Binary frame size: the editor's socket refuses frames above 1 048 576 bytes. */
export const IMPORT_CHUNK_BYTES = 500000;

/** The editor waits up to 25 s for the engine before it answers the guard. */
const GUARD_TIMEOUT_MS = 60 * 1000;

/**
 * How a released editor (no import) answers the guard: cuems-editor's CuemsWsUser,
 * `notify_error_to_user(f"unsupported action: {data}")`, `data` being our request as a
 * Python dict (so it names `'project_import'`), with no `action` key.
 */
const OLD_EDITOR_PREFIX = 'unsupported action: ';
const OLD_EDITOR_ACTION = "'project_import'";

/** Start of the editor's I5 refusal (a project is loaded, no accept_loaded). */
const LOADED_REFUSAL_PREFIX = 'A project is loaded';

/**
 * `failed`: the editor said no, or nothing was imported. `unknown`: the editor was
 * working when we lost it (socket closed after `finished`, `close` with no report):
 * it may have imported, the project list tells.
 */
export type ImportPhase = 'idle' | 'guard' | 'upload' | 'work' | 'done' | 'failed' | 'unknown';

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
  /** An i18n key, for what the editor could not say (old editor, connection closed...);
   *  in phase `unknown`, why the outcome is unknown. */
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
  // A guard that timed out may still be answered later. The answer carries no request
  // id, so a guard pending then takes it, and that guard's own answer, arriving with
  // no guard pending, is dropped (a ticket among them holds the editor's slot until it
  // expires, 60 s). It does no harm beyond a refusal: a late refusal is a refusal; a
  // late ticket lets in only an upload of the size it was given, while it is valid (I6
  // otherwise), and the editor asks the show rule again when the upload ends and
  // before each file (D4), with the loaded-project acceptance of the guard it answered.
  private guardTimer: ReturnType<typeof setTimeout> | null = null;
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
  ownsError(error: { action?: string | null; message?: string; raw?: any }): boolean {
    return error.action === 'project_import'
        || this.claimedErrors.has(error)
        || (!error.action && this.guardPending() && this.isOldEditorAnswer(error));
  }

  /** The released editor's bare answer to our guard: "unsupported action: {...'project_import'...}". */
  private isOldEditorAnswer(error: { message?: string; raw?: any }): boolean {
    const text = this.errorText(error);
    return text.startsWith(OLD_EDITOR_PREFIX) && text.includes(OLD_EDITOR_ACTION);
  }

  private errorText(error: { message?: string; raw?: any }): string {
    const raw = error.raw?.value;
    return typeof raw === 'string' ? raw : (error.message || '');
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
    if (!this.guardPending()) return;
    this.claimedErrors.add(error);
    this.clearGuardTimer();
    if (this.state().cancelling) {
      this.toIdle();
      return;
    }
    const text = this.errorText(error);
    if (!error.action) {
      // ownsError took it only as the released editor's answer.
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
          // The editor ended with no report: it may have imported.
          if (!ended) this.unknown('project.import.error.no.report');
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
      this.unknown('project.import.error.closed.work');
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

  /** We lost the editor while it worked: the outcome is not known here. */
  private unknown(reasonKey: string): void {
    this.clearGuardTimer();
    this.state.update(s => ({
      ...s, phase: 'unknown', error: null, errorKey: reasonKey, report: null,
      canAcceptLoaded: false, cancelling: false,
    }));
  }

  private clearGuardTimer(): void {
    if (this.guardTimer !== null) {
      clearTimeout(this.guardTimer);
      this.guardTimer = null;
    }
  }
}
