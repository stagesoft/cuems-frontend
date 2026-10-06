import { Injectable, DestroyRef, InjectionToken, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { webSocket, WebSocketSubject, WebSocketSubjectConfig } from 'rxjs/webSocket';
import { AppConfig } from '../core/config/app.config';
import { Subject } from 'rxjs';

export interface WebSocketError {
  action: string | null;
  message: string;
  raw: any;
}

/** How a socket is made. Tests replace it; the app uses rxjs' webSocket. */
export const WEBSOCKET_FACTORY = new InjectionToken<(config: WebSocketSubjectConfig<any>) => WebSocketSubject<any>>(
  'WEBSOCKET_FACTORY',
  { providedIn: 'root', factory: () => webSocket }
);

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private destroyRef = inject(DestroyRef);
  private createSocket = inject(WEBSOCKET_FACTORY);
  private host = `${AppConfig.websocketBaseUrl}/ws`;

  public isConnected = signal(false);

  public ws!: WebSocketSubject<any>;

  public messages = new Subject<any>();
  public errors = new Subject<WebSocketError>();

  /**
   * Emits once per connection, as it opens: 1 for the first, then 2, 3, … for
   * each reconnect. The editor starts every connection afresh — it re-sends
   * `payload_version` first and forgets this session's repair
   * acknowledgements — so whoever depends on per-connection state must hear
   * about each one. PayloadVersionService is the single owner that listens.
   */
  public connectionOpened = new Subject<number>();

  /** A new connection after a lost one (connectionOpened, without the first). */
  public reconnected = new Subject<number>();

  public hasRecentError = false;

  private connectionCount = 0;

  constructor() {
    this.connect();
  }

  /**
   * Make a socket and subscribe to it. Used for the first connection and for
   * every reconnect, so both announce themselves the same way. `ws` is
   * replaced, which is why callers send through `ws`/`wsEmit` at call time
   * rather than holding on to the subject.
   */
  private connect(): void {
    this.ws = this.createSocket({
      url: this.host,
      openObserver: {
        next: () => {
          this.isConnected.set(true);
          this.connectionCount += 1;
          this.connectionOpened.next(this.connectionCount);
          if (this.connectionCount > 1) this.reconnected.next(this.connectionCount);
        }
      },
      closeObserver: {
        next: () => this.isConnected.set(false)
      }
    });

    this.ws
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.handleServerMessage(response),
        error: () => this.reconnect()
      });
  }

  private handleServerMessage(response: any): void {

    if (response && response.type === 'error') {
      const experimentalActions = ['file_load_thumbnail', 'file_load_waveform'];
      const isExperimentalError = experimentalActions.includes(response.action);

      if (!isExperimentalError) {
        this.hasRecentError = true;

        const errorPayload: WebSocketError = {
          action: response.action || null,
          message: this.parseErrorMessage(response.value),
          raw: response
        };

        this.errors.next(errorPayload);

        setTimeout(() => {
          this.hasRecentError = false;
        }, 3000);
      }
    } else {
      this.messages.next(response);
    }
  }

  private parseErrorMessage(value: any): string {
    if (typeof value === 'string') {
      // Try to extract the main message if it's a long string
      const match = value.match(/Reason: (.+?)\n/);
      if (match) {
        return match[1];
      }
      // A refused save arrives as `str(type(e)) + str(e)`: drop the Python
      // class name, keep the library's sentence — it names the offending cue.
      return value.replace(/^<class '[^']*'>\s*/, '');
    }
    return 'Ocurrió un error desconocido / Unknown error occurred';
  }

  wsEmit(msg: any): void {
    this.ws.next(msg);
  }


  private reconnect(): void {
    this.isConnected.set(false);
    setTimeout(() => this.connect(), 10000);
  }
}
