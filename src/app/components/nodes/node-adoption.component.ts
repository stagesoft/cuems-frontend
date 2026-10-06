import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppPageHeaderComponent } from '../layout/app-page-header/app-page-header.component';
import { ConfirmationDialogComponent  } from '../ui/confirmation-dialog/confirmation-dialog.component';
import { IconComponent } from '../ui/icon/icon.component';
import { ProjectsService } from '../../services/projects/projects.service';
import { PayloadVersionService } from '../../core/payload-version.service';
import { TranslateModule } from '@ngx-translate/core';
import { WebsocketService } from '../../services/websocket.service';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NotificationService } from '../../services/ui/notification.service';
import { deviceOutputs } from '../../core/mapping-wire';

/**
 * Adoption and liveness of the cluster's nodes — the network_map document's
 * nodes, which is what this screen edits (it was `settings`, a name that
 * belongs to another document; FR-058).
 */
@Component({
  selector: 'app-node-adoption',
  imports: [CommonModule, AppPageHeaderComponent, IconComponent, TranslateModule, ConfirmationDialogComponent],
  templateUrl: './node-adoption.component.html'
})
export class NodeAdoptionComponent implements OnInit, OnDestroy {
  private projectsService = inject(ProjectsService);
  private payloadVersion = inject(PayloadVersionService);
  private wsService = inject(WebsocketService);
  private destroyRef = inject(DestroyRef);
  private notificationService = inject(NotificationService);
  public isConfirmRemoveNodeOpen = false;
  private selectedNodeUuidToRemove: string | null = null;
  public isConfirmAddNodeOpen = false;
  private selectedNodeUuidToAdd: string | null = null;

  /**
   * Read straight off the signal, never copied.
   *
   * The editor pushes a fresh `node_list` after every adopt/un-adopt and
   * whenever cuems-nodeconf rewrites network_map.xml (a node powered on, a node
   * gone). Copying the arrays once in ngOnInit meant none of that reached the
   * screen: the node stayed in the wrong column until the component was
   * remounted, so a working adoption still looked broken.
   */
  public nodeList = computed(() => this.projectsService.nodeList());
  public activeNodes = computed(() => this.nodeList()?.nodes ?? []);
  public newNodes = computed(() => this.nodeList()?.new_nodes ?? []);
  /**
   * True only when the frame says so. False means cuems-nodeconf is not
   * running and every adopt/un-adopt would fail; ABSENT is a fault, not a
   * default — the flag is always present on this payload version (FR-056).
   */
  public nodeconfAvailable = computed(() => this.nodeList()?.nodeconf_available === true);
  /** A duplicate node identity in network_map.xml, while it stands. */
  public networkMapError = computed(() => this.projectsService.networkMapError());

  /**
   * The engine's runtime view: which nodes answered its last ping.
   *
   * Deliberately NOT merged with each node's `online` field. `online` is
   * cuems-nodeconf's discovery view, refreshed within ~30 s; `alive` here is
   * the engine's sub-second ping/pong and the only signal the GO gate trusts.
   * Merging them would tell the operator a node is dead when it was merely
   * missed by the last discovery pass, or alive when it vanished 20 s ago.
   *
   * null = we have not been told yet, or the last request failed. That is
   * UNKNOWN, never dead: the engine serializes editor commands, so this can
   * time out behind a slow project load while every node is healthy.
   */
  private liveness = signal<{
    alive: string[];
    age_s: number;
    /** Project nodes not in the cluster at all, from the last load. */
    missing?: string[];
    /** Project nodes that are adopted but did not answer. */
    unreachable?: string[];
  } | null>(null);

  /**
   * The last load's unusable nodes, as a persistent banner.
   *
   * The toast in AppComponent is an event and is gone in seconds; this is a
   * condition, and it stays until the cause does. The two cases need different
   * actions from the operator, so they are never merged: `missing` means adopt
   * it (or fix the project), `unreachable` means go and switch it on.
   *
   * Fed by the same `node_status` poll as the badges, so it is re-asserted
   * every 5 s rather than depending on a push having arrived.
   */
  public unusableNodes = computed(() => {
    const status = this.liveness();
    const missing = status?.missing ?? [];
    const unreachable = status?.unreachable ?? [];
    if (!missing.length && !unreachable.length) return null;
    return {
      missing: missing.map(uuid => this.projectsService.nodeLabel(uuid)),
      unreachable: unreachable.map(uuid => this.projectsService.nodeLabel(uuid)),
      total: missing.length + unreachable.length
    };
  });

  /** Last refusal from the backend, shown next to the buttons. */
  public lastNodeError = signal<string | null>(null);
  private pollHandle: ReturnType<typeof setInterval> | null = null;

  /** How often to ask while the panel is open. The engine clamps at 2 s. */
  private static readonly POLL_MS = 5000;

  constructor() {
    this.wsService.messages
      .pipe(
        filter(response => response && response.type === 'nodelist_modify'),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          if (response.value === 'OK') {
            this.lastNodeError.set(null);
            this.notificationService.showSuccess('Lista de nodos modificada exitosamente');
          }
        }
      });

    this.wsService.messages
      .pipe(
        filter(response => response && response.type === 'node_status'),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => this.liveness.set(response.value ?? null)
      });

    // Refusals travel on `errors`, not `messages` — without this subscription
    // the operator would click, see nothing happen, and never learn that the
    // engine said "unload the project first" or "nodeconf is not running".
    this.wsService.errors
      .pipe(
        filter(error => error && (error.action === 'nodelist_modify'
                               || error.action === 'node_status')),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (error) => {
          if (error.action === 'node_status') {
            this.liveness.set(null);   // unknown, not dead
            return;
          }
          this.lastNodeError.set(error.message);
          this.isConfirmAddNodeOpen = false;
          this.isConfirmRemoveNodeOpen = false;
          this.notificationService.showError(error.message);
        }
      });

    // A reconnect may have missed a push: ask again rather than wait.
    this.payloadVersion.sessionRestarted
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.projectsService.requestNodeList());
  }

  ngOnInit(): void {
    // Targeted refresh on entry; liveness stays on its own poll (node_status).
    this.projectsService.requestNodeList();
    this.requestNodeStatus();
    this.pollHandle = setInterval(
      () => this.requestNodeStatus(), NodeAdoptionComponent.POLL_MS);
  }

  ngOnDestroy(): void {
    // Stop polling the moment the panel is gone: each probe pings every
    // adopted node.
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  private requestNodeStatus(): void {
    this.wsService.wsEmit({ action: 'node_status' });
  }

  /** 'alive' | 'unknown' — never 'dead' from a failed poll. */
  isAlive(nodeWrapper: any): 'alive' | 'absent' | 'unknown' {
    const status = this.liveness();
    if (!status || !Array.isArray(status.alive)) return 'unknown';
    return status.alive.includes(nodeWrapper?.node?.uuid) ? 'alive' : 'absent';
  }

  /** Seconds since the engine actually probed, for the tooltip. */
  livenessAge(): number | null {
    return this.liveness()?.age_s ?? null;
  }

  /**
   * nodeconf's discovery view. A different question from isAlive().
   * JSON true from cuems-utils 014 on, "True" before it — both arrive at
   * payload version 1 (findings F6), so both are read.
   */
  isSeenByDiscovery(nodeWrapper: any): boolean {
    const online = nodeWrapper?.node?.online;
    return online === true || online === 'True';
  }

  /** The controller cannot be un-adopted — nodeconf refuses it. */
  canUnadopt(nodeWrapper: any): boolean {
    return this.nodeconfAvailable()
      && nodeWrapper?.node?.node_role !== 'controller';
  }

  /** nodeconf refuses to adopt a node it has not just seen. */
  canAdopt(nodeWrapper: any): boolean {
    return this.nodeconfAvailable() && this.isSeenByDiscovery(nodeWrapper);
  }

  getNodeName(nodeWrapper: any, index: number): string {
    const node = nodeWrapper?.node;
    return node?.alias || node?.role_id ||
           `Node ${String(index + 1).padStart(2, '0')}`;
  }

  getVideoOutputs(node: any): any[] {
    return deviceOutputs(node, 'video');
  }

  getAudioOutputs(node: any): any[] {
    return deviceOutputs(node, 'audio');
  }

  getMappedName(output: any): string {
    return output.output?.name || 'Sin nombre';
  }

  formatNumber(num: number): string {
    return String(num + 1).padStart(2, '0');
  }

  openRemoveNodeConfirmation(nodeUuid: string) {
    this.isConfirmRemoveNodeOpen = true;
    this.selectedNodeUuidToRemove = nodeUuid;
  }

  openAddNodeConfirmation(nodeUuid: string) {
    this.isConfirmAddNodeOpen = true;
    this.selectedNodeUuidToAdd = nodeUuid;
  }

  closeRemoveNodeConfirmation() {
    this.isConfirmRemoveNodeOpen = false;
    this.selectedNodeUuidToRemove = null;
  }

  closeAddNodeConfirmation() {
    this.isConfirmAddNodeOpen = false;
    this.selectedNodeUuidToAdd = null;
  }

  confirmRemoveNode() {
    console.log('confirmRemoveNode', this.selectedNodeUuidToRemove);
    this.wsService.wsEmit({
      action: 'nodelist_modify',
      modify_action: 'REMOVE',
      value: this.selectedNodeUuidToRemove
    });
    this.isConfirmRemoveNodeOpen = false;
    this.selectedNodeUuidToRemove = null;
  }

  confirmAddNode() {
    console.log('confirmAddNode', this.selectedNodeUuidToAdd);
    this.wsService.wsEmit({
      action: 'nodelist_modify',
      modify_action: 'ADD',
      value: this.selectedNodeUuidToAdd
    });
    this.isConfirmAddNodeOpen = false;
    this.selectedNodeUuidToAdd = null;
  }
}
