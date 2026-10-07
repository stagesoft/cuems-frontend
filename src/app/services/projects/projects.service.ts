import { Injectable, DestroyRef, EventEmitter, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WebsocketService, WebSocketError } from '../websocket.service';
import { NotificationService } from '../ui/notification.service';
import { Router } from '@angular/router';
import { generateSlug } from '../../core/utils';
import { PayloadCache } from '../../core/payload-cache';
import { PayloadVersionService } from '../../core/payload-version.service';

import {
  createProject,
  CreateProjectParams
} from './handlers/project-create.handler';
import { SchemaDescriptorService } from './handlers/schema-descriptor.handler';
import { LoadReportService } from './load-report.service';
import { defaultPort, deviceOutputs } from '../../core/mapping-wire';
import {
  handleProjectListResponse,
  requestProjectList,
  transformProjectsResponse
} from './handlers/project-list.handler';

export interface ProjectList {
  uuid: string;
  name: string;
  unix_name: string;
  created: string;
  modified: string;
}

export interface InitialMapping {
  /**
   * What gets written into a cue's `output_name`.
   *
   * Audio and video use `<node uuid>_<output id>`. DMX uses the **bare node
   * uuid, with no suffix** — that is the engine's documented contract
   * (`ControllerEngine._collect_project_nodes`), and a DMX cue has no output
   * index to carry anyway: the universe travels inside the cue, in
   * `DmxScene.DmxUniverse.universe_num`.
   */
  uuid: string;
  name: string;
  type: 'audio' | 'video' | 'dmx';
}

/**
 * `initial_mappings` — the output mapping document alone, since payload
 * version 1 (no node status, no nodeconf flag: those ride node_list). Shape
 * in core/mapping-wire.ts: `defaults[]` by class and direction, a node's
 * outputs under `devices[].device`, open class vocabulary.
 */
export interface InitialMappingsResponse {
  type: string;
  value: {
    number_of_nodes: number;
    defaults?: Array<{ default: { '&'?: string; class: string; direction: 'input' | 'output' } }>;
    nodes: Array<{ node: { uuid: string; mac?: string; devices?: Array<{ device: any }> } }>;
    new_nodes: Array<{ node: { uuid: string; mac?: string; devices?: Array<{ device: any }> } }>;
  };
}

/**
 * A node as `node_list` carries it: network-map identity and status, plus the
 * mapping node's keys (`devices`) when it has one. A `new_nodes` entry has no
 * `devices`. `adopted` / `online` are JSON booleans from cuems-utils 014 and
 * "True" / "False" before it, at the same payload version (findings F6):
 * read both. `online` is discovery (~30 s), NOT liveness.
 */
export interface NodeListNode {
  uuid: string;
  mac?: string;
  name?: string;
  ip?: string;
  node_role?: string;
  adopted?: boolean | 'True' | 'False';
  online?: boolean | 'True' | 'False';
  role_id?: string;
  alias?: string;
  hostname?: string;
  devices?: Array<{ device: { class: string; outputs?: any[][]; inputs?: any[][] } }>;
}

/** `node_list` — on connect, after nodelist_modify, on every map change, and the reply to nodelist_get. */
export interface NodeList {
  nodes: Array<{ node: NodeListNode }>;
  new_nodes: Array<{ node: NodeListNode }>;
  /**
   * An envelope fact sampled when the frame is built: on no node, in no
   * document. Absent is a fault, not "available" (FR-056).
   */
  nodeconf_available?: boolean;
}

/** `network_map_error` — standing while network_map.xml names one identity twice; null clears it. */
export interface NetworkMapError {
  kind: 'duplicate_identity' | string;
  identity: string;
  file: string;
}

export interface WebSocketResponse {
  type: string;
  value: any;
  action?: string;
}


@Injectable({
  providedIn: 'root'
})
export class ProjectsService {
  private destroyRef = inject(DestroyRef);
  // First, so the gate is subscribed to the socket before this service is:
  // it sees each connection's first frame, and evicts the cache, before any
  // payload below is handled or cached.
  private payloadVersion = inject(PayloadVersionService);
  private wsService = inject(WebsocketService);
  // Registers the script descriptor as the gate's second prerequisite.
  private schemaDescriptors = inject(SchemaDescriptorService);
  // The repair gate: load reports, acknowledgement, refused saves (US4).
  private loadReports = inject(LoadReportService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  public errorEvent = new EventEmitter<WebSocketError>();
  public newProjectCreated = new EventEmitter<string>();

  public projectRestored = new EventEmitter<string>();
  public projectPermanentlyDeleted = new EventEmitter<string>();
  
  public projectSaved = new EventEmitter<string>();

  public projects = signal<ProjectList[]>([]);
  public projectsInTrash = signal<ProjectList[]>([]);
  public initialMappings = signal<InitialMappingsResponse | null>(null);
  public mappingOptions = signal<InitialMapping[]>([]);
  /** The node arrays and the nodeconf flag — `node_list`, not the mapping document. */
  public nodeList = signal<NodeList | null>(null);
  public networkMapError = signal<NetworkMapError | null>(null);

  public projectLoaded = new EventEmitter<any>();

  public runningProjectUuid = signal<string | null>(null);

  /**
   * UUID of the project the engine currently holds, playing or not.
   *
   * `runningProjectUuid` only covers the playing case; a stopped project used
   * to be indistinguishable from no project at all, because the engine
   * collapsed both into `status: 'none'`. It now answers `'loaded'` too.
   *
   * ⚠️ Fresh on connect, and it can go stale: `project_status` is queried once
   * per WebSocket connection (on PayloadVersionService.sessionStarted, so a
   * reconnect re-queries it), so a load performed elsewhere (another tab, the
   * power-bridge's boot auto-load) is not reflected here until this client
   * reconnects. Anything that must be live reads `oscService.loadedProject()`
   * instead, which the engine broadcasts on every change — that is why this
   * signal is an addition and not a replacement for the existing unix_name
   * matching. It stays `null` against an engine that predates the `'loaded'`
   * state.
   */
  public loadedProjectUuid = signal<string | null>(null);

  /**
   * A node UUID as the operator knows it.
   *
   * Names are resolved here, in the browser, and deliberately never sent by
   * the engine: `alias`/`role_id`/`hostname` are mutable projections of the
   * UUID (the node-identity contract), and a second source of truth for them
   * is what that contract forbids. Same fallback chain as the settings panel,
   * ending in a short UUID so even an unknown node prints as something a
   * person can match against the map.
   */
  public nodeLabel(uuid: string): string {
    // Identity rides node_list since payload version 1; the mapping document
    // carries none.
    const value = this.nodeList();
    const all = [...(value?.nodes ?? []), ...(value?.new_nodes ?? [])];
    const node = all.find(entry => entry?.node?.uuid === uuid)?.node;
    return node?.alias || node?.role_id || node?.hostname ||
           `${uuid.slice(0, 8)}…`;
  }

  constructor() {
    // The mapping cache is read only once this connection's payload version is
    // known and the cache evicted for it (FR-075) — never in the constructor,
    // which runs before the version is known. A live frame always wins.
    this.payloadVersion.sessionStarted
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.restoreCachedMappings();
        // Once per connection, reconnects included: this is what closes the
        // staleness window documented on loadedProjectUuid.
        this.wsService.wsEmit({ action: 'project_status' });
      });

    this.wsService.messages
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response: any) => {
          this.handleWebsocketResponse(response);
        },
        error: (err) => {
          console.error('ProjectsService - websocket error:', err);
          this.errorEvent.emit({ 
            action: 'websocket_error', 
            message: 'Error de conexión',
            raw: err 
          });
        }
      });

    this.wsService.errors
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (error: WebSocketError) => {
          const projectActions = [
            'project_new', 'project_save', 'project_delete', 'project_restore', 
            'project_trash_delete', 'project_list', 'project_trash_list', 
            'project_load', 'initial_mappings'
          ];
          
          if (error.action && projectActions.includes(error.action)) {
            this.errorEvent.emit(error);
            
            if (error.action === 'project_new') {
              this.notificationService.showError(error.message || 'Error al crear el proyecto');
              this.newProjectCreated.emit('');
            } else if (error.action === 'project_save') {
              this.notificationService.showError(error.message || 'Error al guardar el proyecto');
            } else {
              this.notificationService.showError(error.message || 'Error en la operación de proyecto');
            }
          }
        }
      });
    
  }

  public handleWebsocketResponse(response: any): void {
    if (response && response.type === 'initial_mappings' && (response.value || response)) {
      try {
        const mappingsData = response.value || response;
        
        const completeResponse: InitialMappingsResponse = {
          type: 'initial_mappings',
          value: mappingsData
        };
        
        this.initialMappings.set(completeResponse);
        
        // Extract mapping options for the multiselect
        this.extractMappingOptions(mappingsData);
        
        PayloadCache.write('initial_mappings', completeResponse);
      } catch (e) {
        console.error('Error processing initial mappings:', e);
      }
    }   

    if (response && response.type === 'node_list' && response.value) {
      this.nodeList.set({
        nodes: Array.isArray(response.value.nodes) ? response.value.nodes : [],
        new_nodes: Array.isArray(response.value.new_nodes) ? response.value.new_nodes : [],
        nodeconf_available: response.value.nodeconf_available,
      });
      // Option labels use node identity, which rides node_list.
      const mappings = this.initialMappings()?.value;
      if (mappings) this.extractMappingOptions(mappings);
    }

    if (response && response.type === 'network_map_error') {
      this.networkMapError.set(response.value ?? null);
    }

    if (response && response.type === 'project_list' && Array.isArray(response.value)) {
      handleProjectListResponse(response.value, projects => this.projects.set(projects));
    }

    if (response && response.type === 'project_trash_list' && Array.isArray(response.value)) {
      const trashProjects = transformProjectsResponse(response.value);
      this.projectsInTrash.set(trashProjects);
    }

    if (response && response.type === 'project_new' && response.value) {
      const projectUuid = response.value;
      
      this.notificationService.showSuccess('Proyecto creado exitosamente');
      
      this.newProjectCreated.emit(projectUuid);
      
      this.router.navigate(['/projects', projectUuid, 'edit']).then(() => {
      }).catch(err => {

      });
      
      this.getProjectList();
    }

    if (response && response.type === 'project_duplicate' && response.value) {
      const projectUuid = response.value.new_uuid;

      this.notificationService.showSuccess('Proyecto duplicado exitosamente');

      this.getProjectList();
      
      this.router.navigate(['/projects', projectUuid, 'edit']).then(() => {
      }).catch(err => {

      });
    }

    if (response && response.type === 'project_save' && response.value) {
      const projectUuid = response.value;
      
      this.notificationService.showSuccess('Proyecto actualizado exitosamente');
      
      this.projectSaved.emit(projectUuid);
      
      this.getProjectList();
    }

    if (response && response.type === 'project_delete' && response.value) {
      const projectUuid = response.value;
      
      this.notificationService.showSuccess('Proyecto movido a la papelera');
      
      this.getProjectList();
      this.getProjectTrashList();
    }

    if (response && response.type === 'project_recover' && response.value) {
      const projectUuid = response.value;
      
      this.notificationService.showSuccess('Proyecto restaurado exitosamente');
      
      this.projectRestored.emit(projectUuid);
      
      this.getProjectList();
      this.getProjectTrashList();
    }

    if (response && response.type === 'project_trash_delete' && response.value) {
      const projectUuid = response.value;
      
      this.notificationService.showSuccess('Proyecto eliminado permanentemente');
      
      this.projectPermanentlyDeleted.emit(projectUuid);
      
      this.getProjectTrashList();
    }

    if (response && response.type === 'project' && response.value) {
      this.projectLoaded.emit(response.value);
    }

    if (response && response.type === 'project_status') {
      const status = response.value?.status;
      const projectUuid = response.value?.project_uuid;
      if (status === 'running' && projectUuid) {
        this.runningProjectUuid.set(projectUuid);
        this.loadedProjectUuid.set(projectUuid);
        if (this.projects().length === 0) {
          this.getProjectList();
        }
      } else if (status === 'loaded' && projectUuid) {
        // Loaded but stopped. An engine without this state never sends it,
        // so loadedProjectUuid simply stays null there.
        this.runningProjectUuid.set(null);
        this.loadedProjectUuid.set(projectUuid);
        if (this.projects().length === 0) {
          this.getProjectList();
        }
      } else {
        this.runningProjectUuid.set(null);
        this.loadedProjectUuid.set(null);
      }
    }

    if (response && response.type === 'project_unload' && response.value === 'OK') {
      // Both, or the uuid outlives the project it names: project_status is
      // only queried on connect, so nothing else would clear it in this tab.
      this.runningProjectUuid.set(null);
      this.loadedProjectUuid.set(null);
    }

    if (response && response.type === 'error') {
      const error: WebSocketError = {
        action: response.action || 'unknown',
        message: response.value || 'Error desconocido',
        raw: response
      };
      
      this.errorEvent.emit(error);
      
      if (error.action === 'project_new') {
        this.notificationService.showError(error.message || 'Error al crear el proyecto');
        this.newProjectCreated.emit('');
      } else if (error.action === 'project_delete') {
        this.notificationService.showError(error.message || 'Error al mover el proyecto a la papelera');
      } else if (error.action === 'project_restore') {
        this.notificationService.showError(error.message || 'Error al restaurar el proyecto');
      } else if (error.action === 'project_trash_delete') {
        this.notificationService.showError(error.message || 'Error al eliminar permanentemente el proyecto');
      } else {
        this.notificationService.showError(error.message || 'Error en la operación');
      }
    }
  }

  /** Hydrate from the namespaced cache, unless a live frame already arrived. */
  private restoreCachedMappings(): void {
    if (this.initialMappings()) return;
    const cached = PayloadCache.read<any>('initial_mappings');
    if (!cached) return;
    try {
      const mappingsToSet: InitialMappingsResponse = cached.type === 'initial_mappings'
        ? cached
        : { type: 'initial_mappings', value: cached };
      this.initialMappings.set(mappingsToSet);
      this.extractMappingOptions(mappingsToSet.value);
    } catch (e) {
      console.error('ProjectsService - error restoring cached mappings:', e);
    }
  }

  /** Targeted refresh of the node list; the reply is an ordinary node_list. */
  requestNodeList(): void {
    this.wsService.wsEmit({ action: 'nodelist_get' });
  }

  getProjectList(): void {
    requestProjectList(message => this.wsService.ws.next(message));
  }

  getProjectTrashList(): void {
    this.wsService.ws.next({
      action: 'project_trash_list'
    });
  }

  createProject(projectData: CreateProjectParams): void {    
    const descriptor = this.schemaDescriptors.script();
    if (!descriptor) {
      // The session gate keeps the project domain closed without it, so this
      // is reached only from outside that domain.
      this.notificationService.showError('Error: No hay descriptor de esquema disponible');
      this.errorEvent.emit({ 
        action: 'project_new', 
        message: 'No hay descriptor de esquema disponible',
        raw: null 
      });
      this.newProjectCreated.emit('');
      return;
    }

    if (!this.initialMappings() || !this.mappingOptions() || this.mappingOptions().length === 0) {
      this.notificationService.showError('Error: No hay mappings disponibles');
      this.errorEvent.emit({ 
        action: 'project_new', 
        message: 'No hay mappings disponibles',
        raw: null 
      });
      this.newProjectCreated.emit('');
      return;
    }

    const unix_name = generateSlug(projectData.name);
    createProject(
      projectData,
      descriptor,
      this.mappingOptions(),
      (message: any) => {
        const messageWithUnixName = {
          ...message,
          unix_name
        };
        this.wsService.ws.next(messageWithUnixName);
      }
    );
  }

  deleteProject(uuid: string) {
    this.wsService.ws.next({
      action: 'project_delete',
      value: uuid
    });
  }

  duplicateProject(uuid: string) {
    this.wsService.ws.next({
      action: 'project_duplicate',
      value: uuid
    });
  }

  restoreProject(uuid: string) {
    this.wsService.ws.next({
      action: 'project_restore',
      value: uuid
    });
  }

  permanentDeleteProject(uuid: string) {
    this.wsService.ws.next({
      action: 'project_trash_delete',
      value: uuid
    });
  }

  updateProjects(projects: ProjectList[]) {
    this.projects.set(projects);
  }

  loadProject(uuid: string | null) {
    if (uuid) {
      this.wsService.ws.next({
        action: 'project_load',
        value: uuid
      });
    } else {
      console.error('ProjectsService.loadProject() called with null/undefined UUID');
    }
  }

  updateProject(projectData: any): void {    
    this.loadReports.noteSave(projectData);
    this.wsService.ws.next({
      action: 'project_save',
      value: projectData
    });
  }

  getInitialMappings(): InitialMapping[] {
    const mappings = this.mappingOptions();

    return mappings;
  }


  getMappingByUuid(uuid: string): InitialMapping | undefined {
    return this.mappingOptions().find(mapping => mapping.uuid === uuid);
  }

  /**
   * Extract mapping options for the multiselect
   */
  private extractMappingOptions(mappingsData: any): void {
    const mappingOptions: InitialMapping[] = [];
    
    if (mappingsData.nodes && Array.isArray(mappingsData.nodes)) {
      mappingsData.nodes.forEach((nodeData: any, index: number) => {
        const nodeUuid = nodeData.node.uuid;
        const nodeLabel = this.getNodeLabel(nodeData.node, index);

        // devices[].device by class (site 1 of 5): a class this UI does not
        // map — lighting, say — is skipped, and so is a device with no outputs.
        for (const cls of ['audio', 'video'] as const) {
          deviceOutputs(nodeData.node, cls).forEach((outputData: any) => {
            mappingOptions.push({
              uuid: `${nodeUuid}_${outputData.output.id}`,
              name: this.getOutputDisplayName(outputData, nodeLabel),
              type: cls
            });
          });
        }

        // DMX. Note the uuid has no `_id` suffix, unlike audio and video —
        // see InitialMapping. A node with no DMX device simply contributes
        // nothing here.
        deviceOutputs(nodeData.node, 'dmx').forEach((outputData: any) => {
          // One entry per node: every DMX output of a node resolves to
          // the same bare uuid, so more than one would be a duplicate
          // the operator cannot tell apart.
          if (!mappingOptions.some(m => m.type === 'dmx' && m.uuid === nodeUuid)) {
            mappingOptions.push({
              uuid: nodeUuid,
              name: this.getOutputDisplayName(outputData, nodeLabel),
              type: 'dmx'
            });
          }
        });
      });
    }
    
    this.mappingOptions.set(mappingOptions);
  }

  /**
   * The mapping document's default port for a class and direction (T087),
   * from `defaults[]`. Null when there is none — an empty default carries no
   * port, and none is invented.
   */
  public defaultOutput(cls: 'audio' | 'video' | 'dmx'): string | null {
    return defaultPort(this.initialMappings()?.value?.defaults, cls, 'output');
  }

  /**
   * Human-readable node label: the operator-facing identity from
   * network_map.xml (alias, then role_id), falling back to the positional
   * number. Mirrors NodeAdoptionComponent.getNodeName so both screens name a
   * node the same way -- the number alone is misleading, since it counts
   * positions in the mappings array and the controller, being first, reads as
   * 'node1'. The identity comes from node_list, matched by uuid.
   */
  private getNodeLabel(node: any, index: number): string {
    // Identity rides node_list since payload version 1; the mapping node has none.
    const listed = [...(this.nodeList()?.nodes ?? []), ...(this.nodeList()?.new_nodes ?? [])]
      .find(entry => entry?.node?.uuid === node?.uuid)?.node;
    return listed?.alias || listed?.role_id || `node${index + 1}`;
  }

  private getOutputDisplayName(outputData: any, nodeLabel: string): string {
    return `${nodeLabel}:${outputData.output?.name || 'unknown'}`;
  }

  /**
   * Extract UUID and name from an output string f.e. "89ddc6fa-e1e6-4c5b-80a8-ae87d3e87a26_system:playback_1"
   */
  public parseOutputString(outputString: string): { uuid: string; name: string } | null {
    if (!outputString || typeof outputString !== 'string') {
      return null;
    }
    
    // Search for the pattern: 36 characters (uuidv4) + "_" + rest
    const uuidPattern = /^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})_(.+)$/;
    const match = outputString.match(uuidPattern);
    
    if (match) {
      return {
        uuid: match[1],
        name: match[2]
      };
    }
    
    console.warn('Could not parse output string:', outputString);
    return null;
  }

  /**
   * Get the node number (1, 2, 3...) based on the node UUID
   */
  public getNodeNumberByUuid(nodeUuid: string): number | null {
    const mappingsResponse = this.initialMappings();
    if (!mappingsResponse?.value?.nodes) {
      return null;
    }
    
    const nodeIndex = mappingsResponse.value.nodes.findIndex((nodeData: any) => nodeData.node.uuid === nodeUuid);
    return nodeIndex !== -1 ? nodeIndex + 1 : null; // +1 to start from node1
  }

  /**
   * Convert a complete output_name to a readable format (Controller:output_name)
   */
  public formatOutputNameForDisplay(outputString: string): string {
    const parsedOutput = this.parseOutputString(outputString);
    if (!parsedOutput) {
      return outputString; // Fallback to the original string
    }
    
    const nodes = this.initialMappings()?.value?.nodes;
    const nodeIndex = nodes?.findIndex((nodeData: any) => nodeData.node.uuid === parsedOutput.uuid) ?? -1;
    if (nodes && nodeIndex !== -1) {
      return `${this.getNodeLabel(nodes[nodeIndex].node, nodeIndex)}:${parsedOutput.name}`;
    }
    
    return outputString; // Fallback to the original string
  }

  /**
   * Find a specific output in the mappings by UUID and name
   */
  public findOutputInMappings(uuid: string, name: string): any | null {
    const mappingsResponse = this.initialMappings();
    if (!mappingsResponse?.value?.nodes) {
      return null;
    }
    
    const node = mappingsResponse.value.nodes.find((nodeData: any) => nodeData.node.uuid === uuid);
    if (!node) {
      console.warn('Node not found for UUID:', uuid);
      return null;
    }
    
    // devices[].device by class (site 2 of 5); audio first, as before.
    for (const cls of ['audio', 'video'] as const) {
      const output = deviceOutputs(node.node, cls).find((outputData: any) =>
        outputData.output.name === name || String(outputData.output.id) === name);
      if (output) {
        return { type: cls, output, node: node.node };
      }
    }
    
    console.warn('Output not found for UUID:', uuid, 'and name:', name);
    return null;
  }
}
