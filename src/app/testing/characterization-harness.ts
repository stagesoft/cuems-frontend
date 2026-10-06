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

/** The WebSocket boundary: records what is sent, replays what is received. */
export class FakeWebsocketService {
  isConnected = signal(false);
  messages = new Subject<any>();
  errors = new Subject<WebSocketError>();
  reconnected = new Subject<void>();
  hasRecentError = false;
  /** Every frame the code under test sent, in order. */
  sent: any[] = [];
  ws = { next: (msg: any) => { this.sent.push(msg); } };

  wsEmit(msg: any): void {
    this.sent.push(msg);
  }

  /** Deliver a server frame the way WebsocketService does: errors apart. */
  receive(frame: any): void {
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
