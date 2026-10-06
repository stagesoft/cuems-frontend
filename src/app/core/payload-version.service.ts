import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { WebsocketService } from '../services/websocket.service';
import { PayloadCache } from './payload-cache';

/**
 * The editor <-> UI wire version this build implements: the editor's
 * `payload_version` integer. Not the on-disk document version marker, which is
 * a different integer that never reaches this wire.
 */
export const IMPLEMENTED_PAYLOAD_VERSION = 1;

export type PrerequisiteState =
  | { status: 'pending' }
  | { status: 'met' }
  | { status: 'failed'; reason: string; detail?: Record<string, unknown> };

/**
 * One thing the project domain cannot render without. Prerequisites are
 * resolved in the order they are registered, and one is only started once
 * every earlier one is met.
 */
export interface SessionPrerequisite {
  readonly name: string;
  readonly state: Signal<PrerequisiteState>;
  /** Begin resolving (send a request, say). Called once per connection. */
  start(): void;
  /** Forget what the last connection established. */
  reset(): void;
}

export type GateState =
  | { status: 'pending'; prerequisite: string }
  | { status: 'open' }
  | { status: 'refused'; prerequisite: string; reason: string; detail?: Record<string, unknown> };

/**
 * The single session gate (FR-034b, research R8).
 *
 * The wire fixes the order, so this does too:
 *
 *   connection opens
 *     -> first frame: `payload_version` (a peer that never sends it is version 0)
 *          -> cache evicted if the stored version differs, either way or missing
 *          -> mismatch: REFUSED, and nothing later is attempted
 *          -> match: the next prerequisite starts (the schema descriptor)
 *     -> every prerequisite met: the gate is open and the project domain renders
 *
 * It is also the one reconnect owner (FR-044a): the WebSocket service
 * reconnects by itself, and each new connection is a new session for the
 * editor — new `payload_version`, repair acknowledgements forgotten. So every
 * opened connection resets the whole sequence here, and consumers that keep
 * per-connection state listen to `sessionStarted` rather than to the socket.
 *
 * Constructed before any payload consumer (ProjectsService injects it), so it
 * sees every frame first.
 */
@Injectable({ providedIn: 'root' })
export class PayloadVersionService {
  private ws = inject(WebsocketService);

  readonly implemented = IMPLEMENTED_PAYLOAD_VERSION;

  /** What the peer announced on this connection; null until its first frame. */
  readonly announced = signal<number | null>(null);

  /** True once this connection's version is known and the cache evicted accordingly. */
  readonly cacheReady = signal(false);

  /**
   * A connection whose version matches has started (eviction done). Emits the
   * connection number. Anything holding per-connection state re-runs here:
   * the once-per-connection `project_status` query, the node list refresh, the
   * repair acknowledgements this session has sent.
   */
  readonly sessionStarted = new Subject<number>();

  /** Any connection after the first (also emitted on sessionStarted). */
  readonly sessionRestarted = new Subject<number>();

  private connection = 0;
  private awaitingFirstFrame = false;

  private readonly versionState = signal<PrerequisiteState>({ status: 'pending' });

  private readonly versionPrerequisite: SessionPrerequisite = {
    name: 'payload_version',
    state: this.versionState.asReadonly(),
    start: () => { /* resolved by the first frame, not by a request */ },
    reset: () => this.versionState.set({ status: 'pending' }),
  };

  private readonly prerequisites = signal<SessionPrerequisite[]>([this.versionPrerequisite]);

  /** The first prerequisite that is not met decides; all met opens the gate. */
  readonly gate = computed<GateState>(() => {
    for (const prerequisite of this.prerequisites()) {
      const state = prerequisite.state();
      if (state.status === 'failed') {
        return { status: 'refused', prerequisite: prerequisite.name, reason: state.reason, detail: state.detail };
      }
      if (state.status === 'pending') {
        return { status: 'pending', prerequisite: prerequisite.name };
      }
    }
    return { status: 'open' };
  });

  /** Names in resolution order — the shared mechanism, inspectable. */
  readonly prerequisiteNames = computed(() => this.prerequisites().map(p => p.name));

  constructor() {
    this.ws.connectionOpened.subscribe(n => this.onConnectionOpened(n));
    this.ws.messages.subscribe(frame => this.onFrame(frame));
  }

  /**
   * Add a prerequisite after the ones already registered. Registering the same
   * name twice is a no-op, so a service may register from its constructor.
   */
  register(prerequisite: SessionPrerequisite): void {
    if (this.prerequisites().some(p => p.name === prerequisite.name)) return;
    this.prerequisites.update(list => [...list, prerequisite]);
    // Joining a session already under way: start if everything before is met.
    if (this.versionState().status === 'met' && this.allMetBefore(prerequisite)) {
      prerequisite.start();
    }
  }

  private onConnectionOpened(connection: number): void {
    this.connection = connection;
    this.awaitingFirstFrame = true;
    this.announced.set(null);
    this.cacheReady.set(false);
    this.prerequisites().forEach(p => p.reset());
  }

  private onFrame(frame: any): void {
    if (!this.awaitingFirstFrame) return;
    this.awaitingFirstFrame = false;
    const announced = frame?.type === 'payload_version' && Number.isInteger(frame.value)
      ? frame.value as number
      : 0;   // a peer that never announces speaks the pre-001 wire
    this.onVersionKnown(announced);
  }

  private onVersionKnown(announced: number): void {
    this.announced.set(announced);
    // Before anything can read the cache: whatever this connection writes is
    // then tagged with this connection's version, refused or not.
    PayloadCache.evictUnless(announced);
    this.cacheReady.set(true);

    if (announced !== this.implemented) {
      this.versionState.set({
        status: 'failed',
        reason: 'version_mismatch',
        detail: { announced, implemented: this.implemented },
      });
      return;
    }

    this.versionState.set({ status: 'met' });
    this.startNext();
    this.sessionStarted.next(this.connection);
    if (this.connection > 1) this.sessionRestarted.next(this.connection);
  }

  /** Start every prerequisite whose predecessors are all met (in order). */
  private startNext(): void {
    for (const prerequisite of this.prerequisites()) {
      if (prerequisite === this.versionPrerequisite) continue;
      if (!this.allMetBefore(prerequisite)) return;
      if (prerequisite.state().status === 'pending') prerequisite.start();
    }
  }

  private allMetBefore(target: SessionPrerequisite): boolean {
    for (const prerequisite of this.prerequisites()) {
      if (prerequisite === target) return true;
      if (prerequisite.state().status !== 'met') return false;
    }
    return true;
  }

  /** A prerequisite reports progress; later ones start when it is met. */
  notifyResolved(): void {
    if (this.versionState().status === 'met') this.startNext();
  }
}
