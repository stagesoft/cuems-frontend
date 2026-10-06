/**
 * Class-level harness for the characterization specs (research R5).
 *
 * Components are instantiated inside an injection context and never rendered:
 * the two large ones take their dependencies as `inject()` field initializers,
 * so they cannot be `new`-ed bare, but the behaviour under characterization
 * needs none of their template graph (CDK drag-drop and menus, the router,
 * seven child components). `ngOnInit` is not called, which keeps them inert.
 *
 * Only the edges are faked: the WebSocket, the router, translation and the
 * media list. `ProjectsService`, `ProjectEditStateService`,
 * `NotificationService` and `DrawerService` are the real ones, so a recorded
 * frame fed through `FakeWebsocketService.receive` travels the same intake
 * path it does in the browser.
 */
import { Provider, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';
import { WebsocketService, WebSocketError } from '../services/websocket.service';
import { MediaService } from '../services/media/media.service';
import { ProjectWorkspaceService } from '../services/project-workspace.service';
import { IMPLEMENTED_PAYLOAD_VERSION } from '../core/payload-version.service';

/**
 * The WebSocket boundary: records what is sent, replays what is received.
 *
 * `receive` speaks the wire this build implements: if no connection is open
 * yet it opens one and sends `payload_version` first, exactly as the editor
 * starts every connection. Specs about the handshake itself use `open` and
 * `receiveRaw` to control each step.
 */
export class FakeWebsocketService {
  isConnected = signal(false);
  messages = new Subject<any>();
  errors = new Subject<WebSocketError>();
  connectionOpened = new Subject<number>();
  reconnected = new Subject<number>();
  hasRecentError = false;
  /** Every frame the code under test sent, in order. */
  sent: any[] = [];
  ws = { next: (msg: any) => { this.sent.push(msg); } };
  private connections = 0;
  private announcedThisConnection = false;

  wsEmit(msg: any): void {
    this.sent.push(msg);
  }

  /** A connection opens (first or reconnect); nothing is announced yet. */
  open(): void {
    this.connections += 1;
    this.announcedThisConnection = false;
    this.isConnected.set(true);
    this.connectionOpened.next(this.connections);
    if (this.connections > 1) this.reconnected.next(this.connections);
  }

  close(): void {
    this.isConnected.set(false);
  }

  /** Open a connection and announce `version`, as the tip editor does. */
  connect(version = IMPLEMENTED_PAYLOAD_VERSION): void {
    this.open();
    this.receiveRaw({ type: 'payload_version', value: version });
  }

  /** Deliver a server frame on a version-1 connection, opening one first if needed. */
  receive(frame: any): void {
    if (!this.announcedThisConnection) this.connect();
    this.receiveRaw(frame);
  }

  /** Deliver exactly this frame, nothing implied. */
  receiveRaw(frame: any): void {
    this.announcedThisConnection = true;
    this.messages.next(frame);
  }

  receiveError(error: WebSocketError): void {
    this.errors.next(error);
  }
}

export class FakeMediaService {
  fileList = signal<any[]>([]);
  fileListLoaded = new Subject<void>();
  getFileList(): void {}
  getFilesByType(): Array<{ uuid: string; file: any }> { return []; }
}

/** Keys come back untranslated, so assertions read the key itself. */
export class FakeTranslateService {
  instant(key: string): string { return key; }
  get(key: string) { return of(key); }
}

export class FakeRouter {
  events = new Subject<any>();
  navigated: any[] = [];
  navigate(commands: any[]): Promise<boolean> {
    this.navigated.push(commands);
    return Promise.resolve(true);
  }
}

export interface Harness {
  ws: FakeWebsocketService;
  media: FakeMediaService;
  router: FakeRouter;
}

/**
 * Configure TestBed with the fakes. Clears localStorage first: ProjectsService
 * reads its cache in the constructor, and a spec must not inherit another's.
 */
export function setUpCharacterization(extraProviders: Provider[] = []): Harness {
  try { localStorage.clear(); } catch { /* storage blocked: nothing to clear */ }
  const ws = new FakeWebsocketService();
  const media = new FakeMediaService();
  const router = new FakeRouter();
  TestBed.configureTestingModule({
    providers: [
      { provide: WebsocketService, useValue: ws },
      { provide: MediaService, useValue: media },
      { provide: Router, useValue: router },
      { provide: TranslateService, useClass: FakeTranslateService },
      { provide: ActivatedRoute, useValue: { parent: null, params: of({}) } },
      { provide: ProjectWorkspaceService, useValue: {} },
      ...extraProviders,
    ],
  });
  return { ws, media, router };
}

/** `new Component()` inside the injection context; no render, no ngOnInit. */
export function instantiate<T>(ctor: Type<T>): T {
  return TestBed.runInInjectionContext(() => new ctor());
}
