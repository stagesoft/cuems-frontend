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

export type ProjectTemplate = Record<string, any>;

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

export interface InitialMappingsResponse {
  type: string;
  value: {
    number_of_nodes: number;
    default_audio_input: string;
    default_audio_output: string;
    default_video_input: string | null;
    default_video_output: string;
    default_dmx_input: string | null;
    default_dmx_output: string | null;
    nodes: Array<{
      node: {
        uuid: string;
        mac: string;
        /**
         * Identity and state, all optional: a partially migrated
         * network_map.xml legitimately omits role_id/alias/hostname, and the
         * frontend must degrade to the "Node NN" label rather than break.
         * See cuems-common/docs/node-identity-contract.md — uuid is the only
         * stable key; the rest are mutable projections.
         */
        name?: string;
        ip?: string;
        node_type?: string;
        adopted?: boolean;
        /** cuems-nodeconf's discovery view, refreshed within ~30 s. NOT
         *  runtime liveness — that is the engine's ping/pong. */
        online?: boolean;
        role_id?: string;
        alias?: string;
        hostname?: string;
        audio: Array<{
          outputs: Array<{
            output: {
              id: number;
              name: string;
              mappings: Array<{
                mapped_to: string;
              }>;
            };
          }>;
          inputs: Array<{
            input: {
              id: number;
              name: string;
              mappings: Array<{
                mapped_to: string;
              }>;
            };
          }>;
        }>;
        video: Array<{
          outputs: Array<{
            output: {
              id: number;
              name: string;
              mappings: Array<{
                mapped_to: string;
              }>;
            };
          }>;
        }>;
        dmx: any;
      };
    }>;
    new_nodes: Array<{
      node: {
        uuid: string;
        mac: string;
        /** Same identity fields as an adopted node — see `nodes` above. */
        name?: string;
        ip?: string;
        node_type?: string;
        adopted?: boolean;
        online?: boolean;
        role_id?: string;
        alias?: string;
        hostname?: string;
        audio: Array<{
          outputs: Array<{
            output: {
              id: number;
              name: string;
              mappings: Array<{
                mapped_to: string;
              }>;
            };
          }>;
          inputs: Array<{
            input: {
              id: number;
              name: string;
              mappings: Array<{
                mapped_to: string;
              }>;
            };
          }>;
        }>;
        video: Array<{
          outputs: Array<{
            output: {
              id: number;
              name: string;
              mappings: Array<{
                mapped_to: string;
              }>;
            };
          }>;
        }>;
        dmx: any;
      };
    }>;
    schemaLocation: string;
    /**
     * False when cuems-nodeconf is not reachable on the controller, i.e. every
     * adopt/un-adopt would fail. Absent on an editor that predates the flag —
     * treat only an explicit false as unavailable.
     */
    nodeconf_available?: boolean;
  };
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
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  public errorEvent = new EventEmitter<WebSocketError>();
  public newProjectCreated = new EventEmitter<string>();

  public projectRestored = new EventEmitter<string>();
  public projectPermanentlyDeleted = new EventEmitter<string>();
  
  public projectSaved = new EventEmitter<string>();

  public projects = signal<ProjectList[]>([]);
  public projectsInTrash = signal<ProjectList[]>([]);
  public projectTemplate = signal<ProjectTemplate | null>(null);
  public initialMappings = signal<InitialMappingsResponse | null>(null);
  public mappingOptions = signal<InitialMapping[]>([]);

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
    const value = this.initialMappings()?.value;
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
            'project_load', 'initial_template', 'initial_mappings'
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
    if (response && response.type === 'initial_template' && response.value) {
      this.projectTemplate.set(response.value);
    }

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

  getProjectList(): void {
    requestProjectList(message => this.wsService.ws.next(message));
  }

  getProjectTrashList(): void {
    this.wsService.ws.next({
      action: 'project_trash_list'
    });
  }

  createProject(projectData: CreateProjectParams): void {    
    if (!this.projectTemplate()) {
      this.notificationService.showError('Error: No hay template disponible');
      this.errorEvent.emit({ 
        action: 'project_new', 
        message: 'No hay template disponible',
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
      this.projectTemplate(),
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

        if (nodeData.node.audio && Array.isArray(nodeData.node.audio)) {
          nodeData.node.audio.forEach((audioGroup: any) => {
            if (audioGroup.outputs && Array.isArray(audioGroup.outputs)) {
              audioGroup.outputs.forEach((outputData: any) => {
                const displayName = this.getOutputDisplayName(outputData, nodeLabel);
                const mapping: InitialMapping = {
                  uuid: `${nodeUuid}_${outputData.output.id}`,
                  name: displayName,
                  type: 'audio'
                };
                mappingOptions.push(mapping);
              });
            }
          });
        }
        
        if (nodeData.node.video && Array.isArray(nodeData.node.video)) {
          nodeData.node.video.forEach((videoGroup: any) => {
            if (videoGroup.outputs && Array.isArray(videoGroup.outputs)) {
              videoGroup.outputs.forEach((outputData: any) => {
                const displayName = this.getOutputDisplayName(outputData, nodeLabel);
                const mapping: InitialMapping = {
                  uuid: `${nodeUuid}_${outputData.output.id}`,
                  name: displayName,
                  type: 'video'
                };
                mappingOptions.push(mapping);
              });
            }
          });
        }

        // DMX. Note the uuid has no `_id` suffix, unlike audio and video —
        // see InitialMapping. A node with no DMX hardware declares an empty
        // <dmx> section and simply contributes nothing here.
        if (nodeData.node.dmx && Array.isArray(nodeData.node.dmx)) {
          nodeData.node.dmx.forEach((dmxGroup: any) => {
            if (dmxGroup.outputs && Array.isArray(dmxGroup.outputs)) {
              dmxGroup.outputs.forEach((outputData: any) => {
                const displayName = this.getOutputDisplayName(outputData, nodeLabel);
                const mapping: InitialMapping = {
                  uuid: nodeUuid,
                  name: displayName,
                  type: 'dmx'
                };
                // One entry per node: every DMX output of a node resolves to
                // the same bare uuid, so more than one would be a duplicate
                // the operator cannot tell apart.
                if (!mappingOptions.some(m => m.type === 'dmx' && m.uuid === nodeUuid)) {
                  mappingOptions.push(mapping);
                }
              });
            }
          });
        }
      });
    }
    
    this.mappingOptions.set(mappingOptions);
  }

  /**
   * Human-readable node label: the operator-facing identity from
   * network_map.xml (alias, then role_id), falling back to the positional
   * number. Mirrors SettingsComponent.getNodeName so both screens name a node
   * the same way -- the number alone is misleading, since it counts positions
   * in the mappings array and the controller, being first, reads as 'node1'.
   * cuems-editor merges those identity fields into the mappings it serves
   * (CuemsWsServer.merge_node_data), so they are available here.
   */
  private getNodeLabel(node: any, index: number): string {
    return node?.alias || node?.role_id || `node${index + 1}`;
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
    
    if (node.node.audio && Array.isArray(node.node.audio)) {
      for (const audioGroup of node.node.audio) {
        if (audioGroup.outputs && Array.isArray(audioGroup.outputs)) {
          const output = audioGroup.outputs.find((outputData: any) =>
            outputData.output.name === name || String(outputData.output.id) === name);
          if (output) {
            return { type: 'audio', output, node: node.node };
          }
        }
      }
    }
    
    if (node.node.video && Array.isArray(node.node.video)) {
      for (const videoGroup of node.node.video) {
        if (videoGroup.outputs && Array.isArray(videoGroup.outputs)) {
          const output = videoGroup.outputs.find((outputData: any) =>
            outputData.output.name === name || String(outputData.output.id) === name);
          if (output) {
            return { type: 'video', output, node: node.node };
          }
        }
      }
    }
    
    console.warn('Output not found for UUID:', uuid, 'and name:', name);
    return null;
  }
}
