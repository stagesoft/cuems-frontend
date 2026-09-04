import { Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppPageHeaderComponent } from '../layout/app-page-header/app-page-header.component';
import { ConfirmationDialogComponent  } from '../ui/confirmation-dialog/confirmation-dialog.component';
import { IconComponent } from '../ui/icon/icon.component';
import { ProjectsService, InitialMappingsResponse } from '../../services/projects/projects.service';
import { TranslateModule } from '@ngx-translate/core';
import { WebsocketService } from '../../services/websocket.service';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NotificationService } from '../../services/ui/notification.service';

@Component({
  selector: 'app-settings',
  imports: [CommonModule, AppPageHeaderComponent, IconComponent, TranslateModule, ConfirmationDialogComponent],
  templateUrl: './settings.component.html'
})
export class SettingsComponent implements OnInit, OnDestroy {
  private projectsService = inject(ProjectsService);
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
   * The editor pushes a fresh `initial_mappings` after every adopt/un-adopt and
   * whenever cuems-nodeconf rewrites network_map.xml (a node powered on, a node
   * gone). Copying the arrays once in ngOnInit meant none of that reached the
   * screen: the node stayed in the wrong column until the component was
   * remounted, so a working adoption still looked broken.
   */
  public mappings = computed(() => this.projectsService.initialMappings());
  public activeNodes = computed(() => this.mappings()?.value?.nodes ?? []);
  public newNodes = computed(() => this.mappings()?.value?.new_nodes ?? []);
  /** False when cuems-nodeconf is not running: adoption cannot work at all. */
  public nodeconfAvailable = computed(
    () => this.mappings()?.value?.nodeconf_available !== false);

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
  private liveness = signal<{ alive: string[]; age_s: number } | null>(null);
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
  }

  ngOnInit(): void {
    this.requestNodeStatus();
    this.pollHandle = setInterval(
      () => this.requestNodeStatus(), SettingsComponent.POLL_MS);
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

  /** nodeconf's discovery view. A different question from isAlive(). */
  isSeenByDiscovery(nodeWrapper: any): boolean {
    return nodeWrapper?.node?.online === true;
  }

  /** The controller cannot be un-adopted — nodeconf refuses it. */
  canUnadopt(nodeWrapper: any): boolean {
    return this.nodeconfAvailable()
      && nodeWrapper?.node?.node_type !== 'NodeType.master';
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
    if (!node.video || !Array.isArray(node.video)) return [];
    
    const outputs: any[] = [];
    node.video.forEach((videoGroup: any) => {
      if (videoGroup.outputs && Array.isArray(videoGroup.outputs)) {
        outputs.push(...videoGroup.outputs);
      }
    });
    return outputs;
  }

  getAudioOutputs(node: any): any[] {
    if (!node.audio || !Array.isArray(node.audio)) return [];
    
    const outputs: any[] = [];
    node.audio.forEach((audioGroup: any) => {
      if (audioGroup.outputs && Array.isArray(audioGroup.outputs)) {
        outputs.push(...audioGroup.outputs);
      }
    });
    return outputs;
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
