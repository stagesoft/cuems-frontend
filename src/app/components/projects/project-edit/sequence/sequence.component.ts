import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ProjectsService } from '../../../../services/projects/projects.service';
import { ProjectEditStateService } from '../../../../services/projects/project-edit-state.service';
import { MediaService } from '../../../../services/media/media.service';
import { IconComponent } from '../../../ui/icon/icon.component';
import { MultiselectComponent } from '../../../ui/multiselect/multiselect.component';
import { ActivityDrawerComponent } from '../../../ui/activity-drawer/activity-drawer.component';
import { TimecodeInputComponent } from '../../../ui/timecode-input/timecode-input.component';
import { DrawerService } from '../../../../services/ui/drawer.service';
import { Subscription } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { filter } from 'rxjs/operators';
import { ProjectWorkspaceService } from '../../../../services/project-workspace.service';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ConfirmationDialogComponent } from '../../../ui/confirmation-dialog/confirmation-dialog.component';
import { CanvasRegionVisualizerComponent } from '../../../ui/canvas-region-visualizer/canvas-region-visualizer.component';
import { NotificationService } from '../../../../services/ui/notification.service';
import { findInvalidFadeCuesInContents, isValidFadeDurationTc, normalizeFadeDurationTc, normalizeFadeCurveType, FadeCurveType } from '../../../../core/utils';
import { cueClassOf, cueDataOf, cueKeyOf, cueKindOf, cueOutputsOf, timecodeText, wrapCueOutput, wrapHardwareCue } from '../../../../core/cue-wire';
import { DescriptorGapError, SCRIPT_TYPES, SchemaDescriptorService, descriptorDefault, toWireShape } from '../../../../services/projects/handlers/schema-descriptor.handler';
import { newCueListFromDescriptor } from '../../../../services/projects/handlers/project-create.handler';

interface CueData {
  id: string | number;
  order: number;
  name: string;
  /**
   * Internal vocabulary, not wire keys. 'other' is a hardware cue whose class
   * this UI has no editor for: listed, identified by `cue_class`, and written
   * back exactly as it arrived (`originalData`).
   */
  type: 'action' | 'audio' | 'video' | 'dmx' | 'fade' | 'other';
  /** The wire `class` of a hardware cue (audio, video, dmx, or any other). */
  cue_class?: string;
  time: string;
  prewait: string;
  postwait: string;
  actionType: 'noContinue' | 'autoContinue' | 'autoFollow';
  post_go: string;
  loop: 'inf' | 'loop';
  loop_times: number; // -1 for infinite, positive number for specific times
  notes: string;
  expanded: boolean;
  enabled: boolean;
  activeTab: 'notes' | 'edit' | 'media';
  selectedMediaFile?: {uuid: string, file: any};
  selectedAudioOutput?: string;
  selectedVideoOutput?: string;
  selectedOutputs?: string[];
  dmx_channels?: Array<{channel: number, value: number}>;
  universe_num?: number;
  fade_in_time?: number;
  master_vol?: number;
  originalData?: any;
  action_target?: string | null;
  action_type?: string;
  // Engine-native curve names only (see FADE_CURVE_TYPES). 'exponential' and
  // 'logarithmic' used to be offered here, but gradient-motiond implements
  // neither, so choosing one made the fade silently do nothing.
  fade_curve_type?: FadeCurveType;
  fade_duration?: string;
  fade_target_value?: number;
  is_custom_output?: boolean;
  canvas_region?: { x: number; y: number; width: number; height: number };
}

@Component({
  selector: 'app-sequence',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    IconComponent,
    TranslateModule,
    MultiselectComponent,
    ActivityDrawerComponent,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
    ConfirmationDialogComponent,
    TimecodeInputComponent,
    CanvasRegionVisualizerComponent
  ],
  templateUrl: './sequence.component.html',
  styleUrl: './sequence.component.css'
})
export class ProjectEditSequenceComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private projectsService = inject(ProjectsService);
  private editStateService = inject(ProjectEditStateService);
  private mediaService = inject(MediaService);
  private translateService = inject(TranslateService);
  private notificationService = inject(NotificationService);
  private schemaDescriptors = inject(SchemaDescriptorService);
  public drawerService = inject(DrawerService);
  private subscription = new Subscription();
  workspace = inject(ProjectWorkspaceService);
  isConfirmDeleteOpen = false;
  cueToDeleteIndex: number | null = null;
  readonly DRAWER_WIDTH = 500; // px

  projectUuid: string | null = null;
  projectData: any = null;
  originalCues: CueData[] = [];
  hasUnsavedChanges = false;
  fileList: any[] = [];

  cues: CueData[] = [];

  hasProjectChanges = false;

  // Inline dropdown of action type
  openActionDropdown: number | null = null;

  readonly actionTypeOptions = [
    { value: 'pause', label: 'Auto pause', icon: 'post_go_pause' },
    { value: 'go', label: 'Auto continue', icon: 'post_go_go' },
    { value: 'go_at_end', label: 'Auto follow', icon: 'post_go_go_at_end' }
  ];

  ngOnInit() {
    this.route.parent?.params.subscribe(params => {
      this.projectUuid = params['uuid'];
      this.projectsService.loadProject(this.projectUuid);
    });

    this.subscription.add(
      this.projectsService.projectLoaded.subscribe(projectData => {
        this.projectData = projectData;
        this.loadProjectCues(projectData);
      })
    );

    this.subscription.add(
      this.editStateService.changes$.subscribe(hasChanges => {
        if (this.projectUuid) {
          this.hasProjectChanges = this.editStateService.hasProjectChanges(this.projectUuid);
          
          if (!this.hasProjectChanges && this.hasUnsavedChanges) {
            this.hasUnsavedChanges = false;
            this.originalCues = JSON.parse(JSON.stringify(this.cues));
          }
        }
      })
    );

    this.subscription.add(
      this.projectsService.projectSaved.subscribe(savedProjectUuid => {
        if (this.projectUuid && savedProjectUuid === this.projectUuid) {
          this.hasUnsavedChanges = false;
          this.originalCues = JSON.parse(JSON.stringify(this.cues));
          
          this.editStateService.clearTemporaryCues(this.projectUuid);
        }
      })
    );

    this.mediaService.getFileList();

    this.subscription.add(
      this.mediaService.fileListLoaded.subscribe(() => {
        this.rematchMediaFiles();
      })
    );

    this.loadInitialMappings();

    this.subscription.add(
      this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe((event: NavigationEnd) => {
        if (this.hasUnsavedChanges && this.cues.length > 0) {
          this.saveTemporaryCues();
        }
      })
    );
  }

  ngOnDestroy() {
    if (this.projectUuid && this.cues.length > 0) {
      this.editStateService.saveTemporaryCues(this.projectUuid, this.cues, this.hasUnsavedChanges);

    }
    this.subscription.unsubscribe();
  }

  public saveTemporaryCues(): void {
    if (this.projectUuid && this.cues.length > 0) {
      this.editStateService.saveTemporaryCues(this.projectUuid, this.cues, this.hasUnsavedChanges);
    }
  }

  private loadProjectCues(projectData: any) {
    try {
      const expandedStates = this.saveExpandedStates();
      
      let shouldUseTemporaryCues = false;
      let temporaryCuesData = null;
      
      if (this.projectUuid) {
        temporaryCuesData = this.editStateService.getTemporaryCues(this.projectUuid);
        shouldUseTemporaryCues = temporaryCuesData !== null && temporaryCuesData.cues.length > 0;
      }
      
      if (shouldUseTemporaryCues && temporaryCuesData) {
        this.cues = JSON.parse(JSON.stringify(temporaryCuesData.cues));
        this.hasUnsavedChanges = temporaryCuesData.hasUnsavedChanges;
        
        this.restoreExpandedStates(expandedStates);
        
        this.originalCues = JSON.parse(JSON.stringify(this.cues));
      } else {
        if (projectData.CuemsScript?.['CueList']?.['contents']) {
          
          this.cues = this.transformCuesFromProject(projectData.CuemsScript['CueList']['contents']);

          this.restoreExpandedStates(expandedStates);
          
          this.originalCues = JSON.parse(JSON.stringify(this.cues)); 
        } else {
          this.cues = [];
          this.originalCues = [];
          this.hasUnsavedChanges = false;
        }
      }
    } catch (error) {
      this.cues = [];
      this.originalCues = [];
      this.hasUnsavedChanges = false;
    }

    this.loadInitialMappings();
  }

  private rematchMediaFiles(): void {
    const fileList = this.mediaService.fileList();
    if (!fileList || fileList.length === 0) return;

    let changed = false;
    for (const cue of this.cues) {
      if (cue.selectedMediaFile) continue;

      const cueData = this.getCueData(cue.originalData);
      if (!cueData?.Media?.file_name) continue;

      for (const fileObj of fileList) {
        const fileKeys = Object.keys(fileObj);
        if (fileKeys.length > 0) {
          const uuid = fileKeys[0];
          const file = fileObj[uuid];
          if (file && file.unix_name === cueData.Media.file_name) {
            cue.selectedMediaFile = { uuid, file };
            changed = true;
            break;
          }
        }
      }
    }

    if (changed) {
      this.originalCues = JSON.parse(JSON.stringify(this.cues));
    }
  }

  /**
   * Save the current expanded state of the cues
   */
  private saveExpandedStates(): Map<string, { expanded: boolean, activeTab: 'notes' | 'edit' | 'media' }> {
    const states = new Map<string, { expanded: boolean, activeTab: 'notes' | 'edit' | 'media' }>();
    
    this.cues.forEach(cue => {
      if (cue.expanded) {
        const stableKey = `${cue.order}_${cue.name}_${cue.type}`;
        states.set(stableKey, {
          expanded: cue.expanded,
          activeTab: cue.activeTab
        });
      }
    });
    
    return states;
  }

  private restoreExpandedStates(states: Map<string, { expanded: boolean, activeTab: 'notes' | 'edit' | 'media' }>) {
    this.cues.forEach(cue => {
      const stableKey = `${cue.order}_${cue.name}_${cue.type}`;
      const savedState = states.get(stableKey);
      
      if (savedState) {
        cue.expanded = savedState.expanded;
        cue.activeTab = savedState.activeTab;
      }
    });
  }

  /**
   * Transform the cues structure 
   */
  private transformCuesFromProject(projectCues: any[]): CueData[] {
    return projectCues.map((cueItem, index) => {
      // `Cue` + class for hardware cues, ActionCue / FadeCue by key (delta (c)).
      // A nested CueList, or a key this UI does not know, is not listed.
      const kind = cueKindOf(cueItem);
      if (!kind || kind === 'cuelist') {
        return null;
      }
      const cueData: any = cueDataOf(cueItem);
      const cueType: CueData['type'] = kind;

      // Extract media file information if it exists
      let selectedMediaFile: {uuid: string, file: any} | undefined;
      if (cueData.Media && cueData.Media.file_name) {
        // Search the file in the current list of files
        const fileList = this.mediaService.fileList();
        for (const fileObj of fileList) {
          const fileKeys = Object.keys(fileObj);
          if (fileKeys.length > 0) {
            const uuid = fileKeys[0];
            const file = fileObj[uuid];
            if (file && file.unix_name === cueData.Media.file_name) {
              selectedMediaFile = { uuid, file };
              break;
            }
          }
        }
      }

      let selectedAudioOutput: string | undefined = undefined;
      let selectedVideoOutput: string | undefined = undefined;
      let selectedOutputs: string[] = [];                        
      let hasCanvasRegion = false;
      let canvasRegion = { x: 0, y: 0, width: 1, height: 1 };

      
      if (cueType === 'dmx') {
        // A dmx CueOutput carries only output_name — the bare node uuid — so
        // parseOutputString() (which demands a `uuid_name` shape) would
        // return null here. Match against the dmx options directly instead,
        // and keep an unknown value rather than silently dropping it: that
        // is what makes a project mapped to a node this cluster does not
        // have visible to the operator instead of disappearing.
        const dmxOutputs: string[] = cueOutputsOf(cueData, 'dmx')
          .map(output => output.output_name)
          .filter((name: unknown): name is string => !!name);

        if (dmxOutputs.length > 0) {
          selectedOutputs = dmxOutputs;
        } else if (this.dmxMappingOptions.length > 0) {
          selectedOutputs = [this.dmxMappingOptions[0].value];
        }
      }

      if (cueType === 'audio') {         
        const audioOutputs: string[] = cueOutputsOf(cueData, 'audio')
          .map(output => output.output_name)
          .filter((name: unknown): name is string => !!name);
        
        if (audioOutputs.length > 0) {
          const validOutputs: string[] = [];
          
          for (const audioOutput of audioOutputs) {
            const parsedOutput = this.projectsService.parseOutputString(audioOutput);
            if (parsedOutput) {
              const foundInCurrentMappings = this.projectsService.findOutputInMappings(parsedOutput.uuid, parsedOutput.name);
              if (foundInCurrentMappings) {
                validOutputs.push(audioOutput);
              }
            }
          }
          
          if (validOutputs.length > 0) {
            selectedOutputs = validOutputs;
            selectedAudioOutput = validOutputs[0];

          } else {
            const defaultOutput = this.projectsService.defaultOutput('audio');
            if (defaultOutput && this.audioMappingOptions.length > 0) {
              selectedAudioOutput = this.audioMappingOptions[0].value;
              selectedOutputs = [this.audioMappingOptions[0].value];
            } else {
              selectedOutputs = audioOutputs;
              selectedAudioOutput = audioOutputs[0];
            }
          }
        }
      } 
      
      if (cueType === 'video') {       
        const videoOutputs: string[] = cueOutputsOf(cueData, 'video')
          .map(output => output.output_name)
          .filter((name: unknown): name is string => !!name);
        
        if (videoOutputs.length > 0) {
          const validOutputs: string[] = [];
        
          // Separate custom from alias
          const aliasOutputs = videoOutputs.filter(o => !o.includes('_custom_'));
          const customOutputs = videoOutputs.filter(o => o.includes('_custom_'));
        
          if (customOutputs.length > 0) {
            // Detect canvas_region of the first custom
            const customCueOutput = cueOutputsOf(cueData, 'video')
              .find(output => output.output_name?.includes('_custom_'));
            if (customCueOutput?.canvas_region != null) {
              hasCanvasRegion = true;
              canvasRegion = customCueOutput.canvas_region;
            }
            // Use saved alias if there are any
            if (aliasOutputs.length > 0) {
              selectedOutputs = [...aliasOutputs];
              selectedVideoOutput = aliasOutputs[0];
            } else if (this.videoMappingOptions.length > 0) {
              selectedOutputs = [this.videoMappingOptions[0].value];
              selectedVideoOutput = this.videoMappingOptions[0].value;
            }
          } else {
            // Only alias — validate against mappings as before
            for (const videoOutput of aliasOutputs) {
              const parsedOutput = this.projectsService.parseOutputString(videoOutput);
              if (parsedOutput) {
                const found = this.projectsService.findOutputInMappings(parsedOutput.uuid, parsedOutput.name);
                if (found) validOutputs.push(videoOutput);
              }
            }
        
            if (validOutputs.length > 0) {
              selectedOutputs = validOutputs;
              selectedVideoOutput = validOutputs[0];
            } else {
              const defaultOutput = this.projectsService.defaultOutput('video');
              if (defaultOutput && this.videoMappingOptions.length > 0) {
                selectedVideoOutput = this.videoMappingOptions[0].value;
                selectedOutputs = [this.videoMappingOptions[0].value];
              } else {
                selectedOutputs = videoOutputs;
                selectedVideoOutput = videoOutputs[0];
              }
            }
          }
        }
      }

      let universe_num = 0;
      if (cueType === 'dmx' && cueData.DmxScene?.DmxUniverse?.universe_num) {
        universe_num = cueData.DmxScene.DmxUniverse.universe_num;
      }

      let dmx_channels: Array<{channel: number, value: number}> = [];
      if (cueType === 'dmx' && cueData.DmxScene?.DmxUniverse?.dmx_channels) {
        dmx_channels = cueData.DmxScene.DmxUniverse.dmx_channels.map((channelWrapper: any) => {
          const channelData = channelWrapper.DmxChannel || channelWrapper;
          const rawChannel = channelData.channel ?? 0;
          return {
            channel: rawChannel + 1,
            value: channelData.value || 0
          };
        });
      }

      return {
        id: cueData.id || index + 1,
        order: index + 1,
        name: cueData.name || `Cue ${index + 1}`,
        type: cueType,
        time: this.formatTimecode(cueData.offset?.CTimecode || '00:00:00.000'),
        prewait: this.formatTimecode(cueData.prewait?.CTimecode || '00:00:00.000'),
        postwait: this.formatTimecode(cueData.postwait?.CTimecode || '00:00:00.000'),
        actionType: this.determineActionType(cueData.post_go),
        post_go: cueData.post_go || 'pause',
        loop: this.determineLoopType(cueData.loop),
        loop_times: this.determineLoopTimes(cueData.loop),
        notes: cueData.description || '',
        enabled: cueData.enabled === true || cueData.enabled === 'True',
        expanded: false,
        activeTab: 'notes' as 'notes' | 'edit' | 'media',
        selectedMediaFile,
        selectedAudioOutput,
        selectedVideoOutput,
        selectedOutputs,
        dmx_channels,
        universe_num,
        fade_in_time: cueType === 'dmx' ? (() => { const ms = cueData.fadein_time ?? cueData.fade_in_time; return ms != null ? Number(ms) / 1000 : 0; })() : undefined,
        // `??`, not `||`: a cue saved at 0 is muted on purpose, and must not
        // come back at the default (100) — owner's decision, findings F20.
        master_vol: cueData.master_vol ?? this.defaultMasterVolume(),
        action_target: (cueType === 'action' || cueType === 'fade') ? (cueData.action_target || null) : undefined,
        action_type: cueType === 'action' ? (cueData.action_type || 'play') : cueType === 'fade' ? 'fade_action' : undefined,
        // Normalize on load: projects authored before this fix may carry
        // 'exponential'/'logarithmic', which the engine rejects outright. They
        // map to the engine curve of the same shape and are healed on next save.
        fade_curve_type: cueType === 'fade' ? normalizeFadeCurveType(cueData.curve_type) : undefined,
        // Normalize on load: legacy-but-valid shapes ('0:0:3:0' frames, short
        // ms) become canonical so they are never flagged invalid; unparseable
        // values are kept as-is (flagged red, never silently replaced).
        fade_duration: cueType === 'fade' ? (() => {
          const tc = this.formatTimecode(cueData.duration?.CTimecode || '00:00:01.000');
          return normalizeFadeDurationTc(tc) ?? tc;
        })() : undefined,
        fade_target_value: cueType === 'fade' ? (cueData.target_value ?? 0) : undefined,
        is_custom_output: hasCanvasRegion,
        canvas_region: canvasRegion,
        cue_class: cueClassOf(cueItem) ?? undefined,
        originalData: cueItem // Keep original data
      };
    }).filter(cue => cue !== null) as CueData[];
  }

  /**
   * Format a timecode keeping the full format "00:00:00.000"
   */
  private formatTimecode(timecode: string): string {
    if (!timecode) return '00:00:00.000';
    // If it already has milliseconds, return it as is
    if (timecode.includes('.')) {
      return timecode;
    }
    // If it doesn't have milliseconds, add ".000"
    return `${timecode}.000`;
  }

  /**
   * Ensure that a timecode has milliseconds format
   */
  private ensureMilliseconds(timecode: string): string {
    if (!timecode) return '00:00:00.000';
    // If it already has milliseconds, return it as is
    if (timecode.includes('.')) {
      return timecode;
    }
    // If it doesn't have milliseconds, add ".000"
    return `${timecode}.000`;
  }

  /**
   * Determine the action type based on post_go
   */
  private determineActionType(postGo: string): 'noContinue' | 'autoContinue' | 'autoFollow' {
    switch (postGo) {
      case 'continue':
        return 'autoContinue';
      case 'follow':
        return 'autoFollow';
      default:
        return 'noContinue';
    }
  }

  /**
   * Determine the loop type based on the server value
   */
  private determineLoopType(loopValue: any): 'inf' | 'loop' {
    if (loopValue === -1 || loopValue === 0) {
      return 'inf';
    }
    return 'loop';
  }

  /**
   * Determine the number of times the loop
   */
  private determineLoopTimes(loopValue: any): number {
    if (loopValue === -1 || loopValue === 0) {
      return -1; // Infinite
    }
    return typeof loopValue === 'number' && loopValue > 0 ? loopValue : 1;
  }

  public onCueChange(): void {
    this.checkForChanges();
  }

  public clearUnsavedChangesState(): void {
    this.hasUnsavedChanges = false;
    this.originalCues = JSON.parse(JSON.stringify(this.cues));
    
    if (this.projectUuid) {
      this.editStateService.clearTemporaryCues(this.projectUuid);
    }
  }

  public checkForChanges(): void {
    const cuesForComparison = this.cues.map(({ expanded, activeTab, ...rest }) => rest);
    const originalsForComparison = this.originalCues.map(({ expanded, activeTab, ...rest }) => rest);

    this.hasUnsavedChanges = JSON.stringify(cuesForComparison) !== JSON.stringify(originalsForComparison);

    if (this.projectUuid) {
      this.editStateService.saveTemporaryCues(this.projectUuid, this.cues, this.hasUnsavedChanges);
    }
  
    if (this.projectUuid) {
      if (this.hasUnsavedChanges) {
        const cueListData = this.prepareCueListForSaving();
        this.editStateService.markComponentAsChanged('sequence', this.projectUuid, cueListData);
      } else {
        this.editStateService.markComponentAsSaved('sequence', this.projectUuid);
      }
    }
  }

  private prepareCueListForSaving(): any {
    const serverCues: any[] = [];

    for (let i = 0; i < this.cues.length; i++) {
      const cue = this.cues[i];
      const transformed = this.transformCueToServerFormat(cue);

      if (transformed !== null) {
        serverCues.push(transformed);
      }
    }

    return {
      contents: serverCues.length === 0 ? null : serverCues
    };
  }

  toggleTab(index: number, tab: 'notes' | 'edit' | 'media') {
    const cue = this.cues[index];
    if (cue.expanded && cue.activeTab === tab) {
      cue.expanded = false;
    } else {
      cue.expanded = true;
      cue.activeTab = tab;
    }
  }

  setActiveTab(index: number, tab: 'notes' | 'edit' | 'media') {
    this.cues[index].activeTab = tab;
  }

  collapseRow(index: number) {
    this.cues[index].expanded = false;
  }

  addCue(type: 'action' | 'audio' | 'video' | 'dmx' | 'fade') {
    const defaultNames = {
      action: this.translateService.instant('new.action'),
      audio: this.translateService.instant('new.audio'),
      video: this.translateService.instant('new.video'),
      dmx: this.translateService.instant('new.dmx'),
      fade: this.translateService.instant('new.fade')
    };

    const newCue: CueData = {
      id: this.generateUUID(),
      order: this.cues.length + 1, // Added at the end
      name: defaultNames[type],
      type: type,
      time: '00:00:00.000',
      prewait: '00:00:00.000',
      postwait: '00:00:00.000',
      actionType: 'noContinue',
      post_go: 'pause',
      loop: 'loop',
      loop_times: 1,
      notes: '',
      enabled: true,
      expanded: true,
      activeTab: 'edit' as 'notes' | 'edit' | 'media',
      selectedMediaFile: undefined,
    };

    newCue.selectedOutputs = [];
    
    if (this.audioMappingOptions.length === 0 || this.videoMappingOptions.length === 0) {
      this.loadInitialMappings();
    }
    
    // defaults[] by class and direction (T088); none when the document has none.
    const defaultAudioOutput = this.projectsService.defaultOutput('audio') ?? '';
    const defaultVideoOutput = this.projectsService.defaultOutput('video') ?? '';
    
    if (type === 'audio') {
      newCue.master_vol = this.defaultMasterVolume();
      if (this.audioMappingOptions.length > 0) {
        newCue.selectedAudioOutput = this.audioMappingOptions[0].value;
        newCue.selectedOutputs = [this.audioMappingOptions[0].value];
      } else if (defaultAudioOutput) {
        newCue.selectedAudioOutput = defaultAudioOutput;
        newCue.selectedOutputs = [defaultAudioOutput];
      } else {
        newCue.selectedOutputs = [];
      }
    }
    
    if (type === 'video') {
      newCue.is_custom_output = false;
      newCue.canvas_region = { x: 0, y: 0, width: 1, height: 1 };

      if (this.videoMappingOptions.length > 0) {
        newCue.selectedVideoOutput = this.videoMappingOptions[0].value;
        newCue.selectedOutputs = [this.videoMappingOptions[0].value];
      } else if (defaultVideoOutput) {
        newCue.selectedVideoOutput = defaultVideoOutput;
        newCue.selectedOutputs = [defaultVideoOutput];
      } else {
        newCue.selectedOutputs = [];
      }
    }
    
    if (type === 'dmx') {
      // A UI-level starting value, deliberately differing from the descriptor:
      // DmxUniverseType.dmx_channels has no default (null). One channel at 1,
      // value 0, gives the operator a row to edit — it is not the schema's answer.
      newCue.dmx_channels = [{ channel: 1, value: 0 }];
      newCue.fade_in_time = 0;

      // Same courtesy audio and video already get: start on a real target
      // instead of on nothing. Without this a new dmx cue saves with no
      // output_name and never arms on any node.
      const defaultDmxOutput = this.projectsService.defaultOutput('dmx');
      if (defaultDmxOutput && this.dmxMappingOptions.some(o => o.value === defaultDmxOutput)) {
        newCue.selectedOutputs = [defaultDmxOutput];
      } else if (this.dmxMappingOptions.length > 0) {
        newCue.selectedOutputs = [this.dmxMappingOptions[0].value];
      } else {
        newCue.selectedOutputs = [];
      }
    }

    if (type === 'action') {
      newCue.action_target = null;
      newCue.action_type = 'play';
    }

    if (type === 'fade') {
      newCue.action_target = null;
      newCue.action_type = 'fade_action';
      newCue.fade_curve_type = 'linear';
      newCue.fade_duration = '00:00:01.000';
      newCue.fade_target_value = 0;
    }    
    
    if (type !== 'audio' && type !== 'video' && type !== 'dmx') {
      newCue.selectedOutputs = [];
    }
    
    const newCueIndex = this.cues.length;

    this.cues.push(newCue);

    this.cues.forEach((cue, i) => {
      cue.order = i + 1;
    });

    this.checkForChanges();

    setTimeout(() => {
      this.scrollToNewCue(newCueIndex);
    }, 100);
  }

  duplicateCue(index: number): void {
    const original = this.cues[index];
    
    const duplicate: CueData = {
      ...JSON.parse(JSON.stringify(original)),
      id: this.generateUUID(),
      name: this.getCopyName(original.name),
      expanded: false,
    };
    // Field order matters less than identity: an 'other' cue is written back
    // from originalData, which must carry the copy's id, not the original's.
    if (duplicate.type === 'other' && duplicate.originalData) {
      cueDataOf(duplicate.originalData).id = duplicate.id;
    }
  
    this.cues.splice(index + 1, 0, duplicate); // insert just below
  
    this.cues.forEach((cue, i) => {
      cue.order = i + 1;
    });
  
    this.checkForChanges();
  
    setTimeout(() => {
      this.scrollToNewCue(index + 1);
    }, 100);
  }

  private getCopyName(originalName: string): string {
    const base = originalName.replace(/\s-\sCopy(\s\(\d+\))?$/, '');
    const copies = this.cues.map(c => c.name).filter(n =>
      n === `${base} - Copy` || n.match(new RegExp(`^${base} - Copy \\((\\d+)\\)$`))
    );
    if (copies.length === 0) return `${base} - Copy`;
    const max = copies.reduce((acc, n) => {
      const match = n.match(/\((\d+)\)$/);
      return Math.max(acc, match ? parseInt(match[1]) : 1);
    }, 1);
    return `${base} - Copy (${max + 1})`;
  }

  /**
   * Move scroll to the new cue
   */
  private scrollToNewCue(cueIndex: number): void {
    const cueRow = document.querySelector(`[data-cue-index="${cueIndex}"]`) as HTMLElement;
    
    if (cueRow) {
      cueRow.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
      
      cueRow.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
      cueRow.style.transition = 'background-color 0.3s ease';
      
      setTimeout(() => {
        cueRow.style.backgroundColor = '';
      }, 2000);
    }
  }


  saveChanges(): void {
    // Moved saving to the parent component
  }


  saveProject(): void {
    // Gate: zero/invalid FadeCue durations must never reach the editor — a
    // saved zero becomes a silent no-op fade at reveal (engine/gradient drop
    // it). The inline red error marks the offending cue; block with a toast.
    const invalidFades = this.cues.filter(cue => !this.isFadeDurationValid(cue));
    if (invalidFades.length > 0) {
      this.notificationService.showError(
        this.translateService.instant('fade.duration.invalid.save')
      );
      return;
    }
    if (this.projectUuid && this.hasProjectChanges) {
      const modifiedData = this.editStateService.getProjectModifiedData(this.projectUuid);
      
      if (modifiedData && Object.keys(modifiedData).length > 0) {
        const updatedProject = JSON.parse(JSON.stringify(this.projectData));
        
        if (modifiedData.sequence) {
          if (!updatedProject.CuemsScript) {
            updatedProject.CuemsScript = {};
          }
          if (!updatedProject.CuemsScript.CueList) {
            const descriptor = this.schemaDescriptors.script();
            if (!descriptor) {
              this.reportDescriptorGap(new DescriptorGapError(SCRIPT_TYPES.cueList, '(descriptor)'));
              return;
            }
            updatedProject.CuemsScript.CueList = newCueListFromDescriptor(descriptor);
          }
          
          if (modifiedData.sequence.contents === null) {
            updatedProject.CuemsScript.CueList.contents = null;
          } else if (Array.isArray(modifiedData.sequence.contents) && modifiedData.sequence.contents.length === 0) {
            updatedProject.CuemsScript.CueList.contents = null;
          } else {
            updatedProject.CuemsScript.CueList.contents = modifiedData.sequence.contents;
          }
        }

        // Belt and braces: also walk the final server-format payload (covers
        // nested CueLists not represented in the flat UI cue array).
        const offenders = findInvalidFadeCuesInContents(
          updatedProject.CuemsScript?.CueList?.contents
        );
        if (offenders.length > 0) {
          this.notificationService.showError(
            this.translateService.instant('fade.duration.invalid.save') +
            ': ' + offenders.map(o => o.name).join(', ')
          );
          return;
        }

        // The editor ingests `{"CuemsScript": …}` and nothing beside it: the
        // library refuses any other top-level key (a `schemaLocation`, delta
        // (a), or a `uuid` — the project is identified by CuemsScript.id).
        this.projectsService.updateProject({ CuemsScript: updatedProject.CuemsScript });
      }
    }
  }

  private transformCueToServerFormat(cue: CueData): any {
    // A class this UI has no editor for goes back as it arrived: only the
    // common cue fields the row and the Basic tab edit are applied, so an
    // operator's edit is never silently dropped and nothing class-specific
    // is touched (FR-012). Unedited, it round-trips unchanged.
    if (cue.type === 'other') {
      if (!cue.originalData) return null;
      const item = JSON.parse(JSON.stringify(cue.originalData));
      // Only what the operator changed: compared with what intake derived
      // from the same original, so an untouched null stays null.
      const before = this.commonCueFields(this.transformCuesFromProject([cue.originalData])[0]);
      const after = this.commonCueFields(cue);
      for (const [field, value] of Object.entries(after)) {
        if (JSON.stringify(value) !== JSON.stringify(before[field])) cueDataOf(item)[field] = value;
      }
      return item;
    }

    const newCue = this.newCueBody(cue.type);
    if (!newCue) {
      return null;
    }

    Object.assign(newCue, this.commonCueFields(cue));

    if (cue.type === 'audio') {
      newCue.master_vol = cue.master_vol ?? this.defaultMasterVolume();   // 0 stays 0 (F20)
    }

    // For ActionCue, delete Media if it exists in the template
    if (cue.type === 'action' && newCue.Media) {
      delete newCue.Media;
    }

    if (cue.type === 'action') {
      newCue.action_target = cue.action_target || null;
      newCue.action_type = cue.action_type || 'play';
    }
    
    if (cue.type === 'fade') {
      // Belt and braces: the dropdown only offers engine-native names now, but
      // normalize again so nothing unimplemented can reach the engine — an
      // unknown curve is discarded wholesale and the cue snaps, silently.
      newCue.curve_type = normalizeFadeCurveType(cue.fade_curve_type);
      // Serialize the canonical form; never an invalid/empty duration
      // (ensureMilliseconds('') would yield 00:00:00.000). The save gate
      // blocks invalid ones anyway — the 1s fallback is belt and braces.
      newCue.duration = {
        CTimecode: isValidFadeDurationTc(cue.fade_duration)
          ? normalizeFadeDurationTc(cue.fade_duration)!
          : '00:00:01.000'
      };
      newCue.target_value = cue.fade_target_value ?? 0;
      newCue.action_target = cue.action_target || null;
      newCue.action_type = 'fade_action';
      if (newCue.Media) delete newCue.Media;
    }    

    if (cue.type === 'audio' || cue.type === 'video') {
      if (newCue.Media) {
        if (cue.selectedMediaFile && cue.selectedMediaFile.file.unix_name) {
          newCue.Media = {
            file_name: cue.selectedMediaFile.file.unix_name,
            id: cue.selectedMediaFile.uuid,
            // Send the real media duration from the file_list metadata. The `||`
            // fallback covers legacy media rows with a NULL duration and older
            // editors whose file_list payload doesn't yet carry the field; in
            // those cases the backend safety net (_fix_media_durations) still
            // corrects it from the DB on save.
            duration: cue.selectedMediaFile.file.duration || '00:00:00.000',
            regions: [
              {
                Region: {
                  id: 0,
                  loop: 1,
                  in_time: { CTimecode: "00:00:00.000" },
                  out_time: { CTimecode: "00:00:00.000" }
                }
              }
            ]
          };
        } else {
          delete newCue.Media;
        }
      }

      if (cue.type === 'audio') {
        let selectedOutputs: string[] = [];
        
        if (cue.selectedOutputs && Array.isArray(cue.selectedOutputs) && cue.selectedOutputs.length > 0) {
          selectedOutputs = cue.selectedOutputs;
        } else if (cue.selectedAudioOutput) {
          selectedOutputs = [cue.selectedAudioOutput];
        }

        this.assignMultipleAudioOutputs(newCue, selectedOutputs);
      } else if (cue.type === 'video') {
          if (cue.is_custom_output && cue.canvas_region) {
            const templateVideoOutput = this.getTemplateOutputStructure('video');
            if (templateVideoOutput) {
              const parsed = this.projectsService.parseOutputString(cue.selectedOutputs?.[0] || '');
              const nodeUuid = parsed?.uuid || '';
              newCue.outputs = [];
              if (cue.selectedOutputs && cue.selectedOutputs.length > 0) {
                cue.selectedOutputs.forEach(selectedOutput => {
                  const clonedAlias = JSON.parse(JSON.stringify(templateVideoOutput));
                  clonedAlias.output_name = selectedOutput;
                  newCue.outputs.push(wrapCueOutput('video', clonedAlias));
                });
              }
              const clonedCustom = JSON.parse(JSON.stringify(templateVideoOutput));
              clonedCustom.output_name = `${nodeUuid}_custom_0`;
              clonedCustom.canvas_region = { ...cue.canvas_region };
              newCue.outputs.push(wrapCueOutput('video', clonedCustom));
            }
        } else {
          let selectedOutputs: string[] = [];
          if (cue.selectedOutputs && Array.isArray(cue.selectedOutputs) && cue.selectedOutputs.length > 0) {
            selectedOutputs = cue.selectedOutputs;
          } else if (cue.selectedVideoOutput) {
            selectedOutputs = [cue.selectedVideoOutput];
          }
          this.assignMultipleVideoOutputs(newCue, selectedOutputs);
        }
      }
    }

    // Handle DMX channels - only for dmx cues
    if (cue.type === 'dmx') {
      if (cue.dmx_channels && cue.dmx_channels.length > 0) {
        if (!newCue.DmxScene) {
          newCue.DmxScene = {
            DmxUniverse: {
              dmx_channels: [],
              universe_num: cue.universe_num ?? 0
            },
            id: 0
          };
        }
        if (!newCue.DmxScene.DmxUniverse) {
          newCue.DmxScene.DmxUniverse = {
            dmx_channels: [],
            universe_num: cue.universe_num ?? 0
          };
        }
        
        // Assign the DMX channels: UI is 1-based (1–512), project/engine/dmxplayer use 0-based buffer index (OLA channel 1 = index 0)
        newCue.DmxScene.DmxUniverse.dmx_channels = cue.dmx_channels.map(ch => ({
          DmxChannel: {
            channel: Math.max(0, Number(ch.channel) - 1),
            value: Number(ch.value)
          }
        }));
        
        newCue.DmxScene.DmxUniverse.universe_num = cue.universe_num ?? 0;
      } else {
        if (newCue.DmxScene && newCue.DmxScene.DmxUniverse) {
          newCue.DmxScene.DmxUniverse.dmx_channels = [];
          newCue.DmxScene.DmxUniverse.universe_num = cue.universe_num ?? 0;
        }
      }
      newCue.fadein_time = Math.round((cue.fade_in_time ?? 0) * 1000);

      // DmxCueOutputsType is a single repeatable output_name and nothing
      // else, so the structure is built here rather than from the descriptor
      // the way audio and video outputs are.
      const dmxSelected = (cue.selectedOutputs && Array.isArray(cue.selectedOutputs))
        ? cue.selectedOutputs.filter(value => !!value)
        : [];
      if (dmxSelected.length > 0) {
        newCue.outputs = dmxSelected.map(outputName => wrapCueOutput('dmx', { output_name: outputName }));
      }
    }

    // Hardware cues travel as `Cue` + class, the rest under their own key.
    if (cue.type === 'audio' || cue.type === 'video' || cue.type === 'dmx') {
      return wrapHardwareCue(cue.type, newCue);
    }
    return { [cue.type === 'action' ? 'ActionCue' : 'FadeCue']: newCue };
  }

  /** The fields every cue kind shares, from the row and the Basic tab. */
  private commonCueFields(cue: CueData): Record<string, any> {
    return {
      name: cue.name,
      description: cue.notes,
      id: cue.id && typeof cue.id === 'string' && cue.id.includes('-') ? cue.id : this.generateUUID(),
      post_go: cue.post_go,
      offset: { CTimecode: this.ensureMilliseconds(cue.time) },
      prewait: { CTimecode: this.ensureMilliseconds(cue.prewait) },
      postwait: { CTimecode: this.ensureMilliseconds(cue.postwait) },
      // Native boolean: the only form the library accepts from cuems-utils
      // 014 on ("True" is refused), and accepted before it too.
      enabled: cue.enabled,
      // -1 for infinite, positive number for specific times
      loop: cue.loop === 'inf' ? -1 : cue.loop_times,
    };
  }

  /** The descriptor's default for a new audio cue's master volume (100). */
  private defaultMasterVolume(): number {
    try {
      return Number(descriptorDefault(this.schemaDescriptors.script(), SCRIPT_TYPES.audio, 'master_vol'));
    } catch (error) {
      this.reportDescriptorGap(error);
      return 0;
    }
  }

  /**
   * A new cue's body, wire-shaped from the script descriptor (UR-1
   * transform), without its `class` — the wrapper adds that. A hardware cue
   * starts with no outputs: the descriptor's example output has no class
   * and the library refuses it; outputs are assigned from the selection.
   */
  private newCueBody(type: 'action' | 'audio' | 'video' | 'dmx' | 'fade'): any | null {
    const descriptor = this.schemaDescriptors.script();
    try {
      if (!descriptor) throw new DescriptorGapError(SCRIPT_TYPES[type], '(descriptor)');
      const { class: _class, ...body } = toWireShape(descriptor, SCRIPT_TYPES[type]);
      if (type === 'audio' || type === 'video' || type === 'dmx') body['outputs'] = [];
      return body;
    } catch (error) {
      this.reportDescriptorGap(error);
      return null;
    }
  }

  /**
   * A descriptor that lacks what a call site needs is reported, never
   * absorbed into a silently empty or partial cue (FR-034).
   */
  private reportDescriptorGap(error: unknown): void {
    const detail = error instanceof DescriptorGapError ? `${error.typeKey}.${error.field}` : String(error);
    console.error('schema descriptor gap:', detail);
    this.notificationService.showError(
      `${this.translateService.instant('descriptor.gap')}: ${detail}`);
  }


  private generateUUID(): string {
    return uuidv4();
  }

  /**
   * Reorder cues
   */
  onDrop(event: CdkDragDrop<CueData[]>): void {
    if (event.previousIndex !== event.currentIndex) {
      moveItemInArray(this.cues, event.previousIndex, event.currentIndex);

      this.updateCueOrders();

      this.checkForChanges();
    }
  }

  private updateCueOrders(): void {
    this.cues.forEach((cue, index) => {
      cue.order = index + 1;
    });
  }

  public shouldShowWarningIcon(cue: CueData): boolean {
    // Only for audio/video, no action, no dmx
    if ((cue.type === 'action') || (cue.type === 'dmx') || (cue.type === 'fade') || (cue.type === 'other')) return false;

    // If there is a media file selected, no show warning
    if (cue.selectedMediaFile) return false;

    let warning = null;
    const original = this.getCueData(cue.originalData);
    if (original?.ui_properties?.warning !== undefined) {
      warning = original.ui_properties.warning;
    }

    // Show if it is null or 2
    return warning === null || warning === 2;
  }

  /** The wire key of a cue item: `Cue` for every hardware class, else its own key. */
  public getCueTypeKey(originalData: any): string | null {
    const key = cueKeyOf(originalData);
    return key === 'CueList' ? null : key;
  }

  public getCueData(originalData: any): any {
    return this.getCueTypeKey(originalData) ? cueDataOf(originalData) : null;
  }

  public onLoopTypeChange(cue: CueData): void {
    if (cue.loop === 'inf') {
      cue.loop_times = -1;
    } else {
      // If it changes to 'loop', set a default value if it is -1
      if (cue.loop_times === -1) {
        cue.loop_times = 1;
      }
    }
    this.checkForChanges();
  }

  public getMediaFilesByType(type: 'audio' | 'video'): Array<{uuid: string, file: any}> {
    return this.mediaService.getFilesByType(type);
  }

  public onMasterVolumeChange(cue: CueData, value: number): void {
    cue.master_vol = value;
    this.checkForChanges();
  }

  public onMediaFileSelect(cue: CueData, uuid: string): void {
    const files = this.getMediaFilesByType(cue.type as 'audio' | 'video');
    const selectedFile = files.find(f => f.uuid === uuid);
    
    if (selectedFile) {
      cue.selectedMediaFile = selectedFile;
      this.checkForChanges();
    }
  }

  public onMediaFileSelectFromEvent(cue: CueData, event: Event): void {
    const target = event.target as HTMLSelectElement;
    const uuid = target?.value || '';
    this.onMediaFileSelect(cue, uuid);
  }

  public getSelectedMediaFileName(cue: CueData): string {
    if (cue.selectedMediaFile) {
      return cue.selectedMediaFile.file.name;
    }
    return '';
  }

  public getCueMediaDuration(cue: CueData): string {
    if (cue.type === 'fade') {
      return cue.fade_duration || '-';
    }
    if (cue.type !== 'audio' && cue.type !== 'video') {
      return '-';
    }
    return cue.selectedMediaFile?.file?.duration
      || timecodeText(this.getCueData(cue.originalData)?.Media?.duration)
      || '-';
  }

  public hasMediaFileSelected(cue: CueData): boolean {
    return !!(cue.selectedMediaFile && cue.selectedMediaFile.file.unix_name);
  }

  @HostListener('document:click')
  closeDropdown(): void {
    this.openActionDropdown = null;
  }

  toggleActionDropdown(i: number, event: Event) {
    event.stopPropagation();
    this.openActionDropdown = this.openActionDropdown === i ? null : i;
  }

  selectActionType(i: number, value: string) {
    this.cues[i].post_go = value;
    this.checkForChanges();
    this.openActionDropdown = null;
  }

  onDropdownClick(event: Event) {
    event.stopPropagation();
  }

  getActionTypeLabel(value: string): string {
    const found = this.actionTypeOptions.find(opt => opt.value === value);
    return found ? found.label : '';
  }

  public reloadCuesFromProject(): void {
    if (this.projectData) {
      if (this.projectUuid) {
        this.editStateService.clearTemporaryCues(this.projectUuid);
      }
      
      this.loadProjectCues(this.projectData);
    }
  }

  mappingOptions: { value: string, label: string }[] = [];
  /** DMX targets. One entry per node that declares a <dmx> output; the value
   *  is the bare node uuid (see InitialMapping in projects.service). */
  dmxMappingOptions: { value: string, label: string }[] = [];
  audioMappingOptions: { value: string, label: string }[] = [];
  videoMappingOptions: { value: string, label: string }[] = [];

  getMappingOptionsForCue(cue: CueData): { value: string, label: string }[] {
    let options: { value: string, label: string }[] = [];
    
    if (cue.type === 'audio') {
      options = this.audioMappingOptions;
    }
    
    if (cue.type === 'video') {
      options = this.videoMappingOptions;
    }

    if (cue.type === 'dmx') {
      options = this.dmxMappingOptions;
    }

    return options;
  }

  getSelectedOutputsForCue(cue: CueData): string[] {
    let selectedValues: string[] = [];
    
    if (cue.selectedOutputs && cue.selectedOutputs.length > 0) {
      selectedValues = cue.selectedOutputs;
    } else if (cue.type === 'audio' && cue.selectedAudioOutput) {
      selectedValues = [cue.selectedAudioOutput];
    } else if (cue.type === 'video' && cue.selectedVideoOutput) {
      selectedValues = [cue.selectedVideoOutput];
    }
    
    return selectedValues;
  }

  getPlaceholderForCue(cue: CueData): string {
    if (cue.type === 'audio') {
      return 'Selecciona salidas de audio';
    } else if (cue.type === 'video') {
      return 'Selecciona salidas de video';
    }
    return 'Selecciona opciones';
  }

  onOutputSelectionChange(selectedValues: string[], cue: CueData): void { 
    // Fallback for maintaining one by default
    if (!selectedValues || selectedValues.length === 0) {    
      // Use the first available output as fallback
      if (cue.type === 'audio' && this.audioMappingOptions.length > 0) {
        selectedValues = [this.audioMappingOptions[0].value];
      } else if (cue.type === 'video' && this.videoMappingOptions.length > 0) {
        selectedValues = [this.videoMappingOptions[0].value];
      }
    }
    
    cue.selectedOutputs = selectedValues || [];
    
    if (cue.type === 'audio') {
      cue.selectedAudioOutput = selectedValues && selectedValues.length > 0 ? selectedValues[0] : undefined;
    } else if (cue.type === 'video') {
      cue.selectedVideoOutput = selectedValues && selectedValues.length > 0 ? selectedValues[0] : undefined;
    }
    
    this.checkForChanges();
  }


  getCueOptionsForAction(currentCue: CueData): { value: string, label: string }[] {
    const options = this.cues
      .filter(c => c !== currentCue)
      .map(c => ({
        value: String(c.id),
        label: `${c.order}. ${c.name}`
      }));
    
    return options;
  }
  
  onActionTargetChange(selectedValue: string | string[], cue: CueData): void {
    if (Array.isArray(selectedValue)) {
      cue.action_target = selectedValue.length > 0 ? selectedValue[0] : null;
    } else {
      cue.action_target = selectedValue || null;
    }

    this.checkForChanges();
  } 

  private loadInitialMappings(): void {
    const mappings = this.projectsService.mappingOptions();
    
    if (mappings && mappings.length > 0) {
      this.audioMappingOptions = mappings.filter(mapping => 
        mapping.type === 'audio'
      ).map(mapping => ({
        value: mapping.uuid,
        label: mapping.name
      }));
      
      this.videoMappingOptions = mappings.filter(mapping => 
        mapping.type === 'video'
      ).map(mapping => ({
        value: mapping.uuid,
        label: mapping.name
      }));
      
      this.dmxMappingOptions = mappings.filter(mapping =>
        mapping.type === 'dmx'
      ).map(mapping => ({
        value: mapping.uuid,
        label: mapping.name
      }));

      this.mappingOptions = [...this.audioMappingOptions, ...this.videoMappingOptions];
    }
  }

  private assignMultipleAudioOutputs(audioCue: any, selectedOutputs: string[]): void {
    if (!selectedOutputs || !Array.isArray(selectedOutputs) || selectedOutputs.length === 0) {
      return;
    }

    const templateAudioOutput = this.getTemplateOutputStructure('audio');
    if (!templateAudioOutput) {
      console.warn('No output structure for an audio CueOutput');
      return;
    }

    audioCue.outputs = [];
    
    selectedOutputs.forEach((selectedOutput, index) => {
      let outputToAssign = selectedOutput;
      const parsedOutput = this.projectsService.parseOutputString(selectedOutput);
      let foundOutputInMappings = null;

      if (parsedOutput) {
        foundOutputInMappings = this.projectsService.findOutputInMappings(parsedOutput.uuid, parsedOutput.name);
      }

      if (!foundOutputInMappings) {
        if (this.audioMappingOptions.length > 0) {
          outputToAssign = this.audioMappingOptions[0].value;
        } else {
          return;
        }
      }

      const clonedAudioOutput = JSON.parse(JSON.stringify(templateAudioOutput));
      clonedAudioOutput.output_name = outputToAssign;

      audioCue.outputs.push(wrapCueOutput('audio', clonedAudioOutput));
    });
  }

  private assignMultipleVideoOutputs(videoCue: any, selectedOutputs: string[]): void {
    if (!selectedOutputs || !Array.isArray(selectedOutputs) || selectedOutputs.length === 0) {
      return;
    }

    const templateVideoOutput = this.getTemplateOutputStructure('video');
    if (!templateVideoOutput) {
      console.warn('No output structure for a video CueOutput');
      return;
    }

    videoCue.outputs = [];
    
    selectedOutputs.forEach((selectedOutput, index) => {
      let outputToAssign = selectedOutput;
      const parsedOutput = this.projectsService.parseOutputString(selectedOutput);
      let foundOutputInMappings = null;

      if (parsedOutput) {
        foundOutputInMappings = this.projectsService.findOutputInMappings(parsedOutput.uuid, parsedOutput.name);
      }

      if (!foundOutputInMappings) {
        if (this.videoMappingOptions.length > 0) {
          outputToAssign = this.videoMappingOptions[0].value;
        } else {
          return;
        }
      }

      const clonedVideoOutput = JSON.parse(JSON.stringify(templateVideoOutput));
      clonedVideoOutput.output_name = outputToAssign;

      videoCue.outputs.push(wrapCueOutput('video', clonedVideoOutput));
    });
  }

  /**
   * Add a new DMX channel to a cue
   */
  addDmxChannel(cue: CueData): void {
    if (cue.type !== 'dmx') return;
    
    if (!cue.dmx_channels) {
      cue.dmx_channels = [];
    }
    
    // Find the next available channel number (DMX channels start at 1)
    let nextChannel = 1;
    const existingChannels = cue.dmx_channels.map(ch => ch.channel);
    while (existingChannels.includes(nextChannel)) {
      nextChannel++;
    }
    
    cue.dmx_channels.push({
      channel: nextChannel,
      value: 0
    });
    
    this.checkForChanges();
  }
  
  removeDmxChannel(cue: CueData, index: number): void {
    if (cue.type !== 'dmx' || !cue.dmx_channels) return;
    
    cue.dmx_channels.splice(index, 1);
    this.checkForChanges();
  }
  
  /**
   * A fade cue's duration must normalize to a timecode strictly > 0.
   * Advisory predicate: paints the inline error and feeds the save gate,
   * never mutates the value (the timecode input emits per keystroke, so
   * transient zeros while typing must only show red).
   */
  isFadeDurationValid(cue: CueData): boolean {
    if (cue.type !== 'fade') return true;
    return isValidFadeDurationTc(cue.fade_duration);
  }

  /**
   * Validate that the channel number is not duplicated
   */
  isDmxChannelNumValid(cue: CueData, channel: number, currentIndex: number): boolean {
    if (cue.type !== 'dmx' || !cue.dmx_channels) return true;
    
    return !cue.dmx_channels.some((ch, index) => ch.channel === channel && index !== currentIndex);
  }
  
  /**
   * Handle live input of DMX channel number (update model only if valid)
   */
  onDmxChannelNumChange(cue: CueData, index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.trim();

    if (raw === '') return;

    let newChannel = parseInt(raw, 10);
    if (isNaN(newChannel)) return;

    if (newChannel < 1) newChannel = 1;
    if (newChannel > 512) newChannel = 512;

    if (cue.type !== 'dmx' || !cue.dmx_channels || !cue.dmx_channels[index]) return;

    if (this.isDmxChannelNumValid(cue, newChannel, index)) {
      cue.dmx_channels[index].channel = newChannel;
      this.checkForChanges();
    }
  }

  /**
   * Clamp and restore DMX channel number on blur
   */
  onDmxChannelNumBlur(cue: CueData, index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.trim();

    if (cue.type !== 'dmx' || !cue.dmx_channels || !cue.dmx_channels[index]) return;

    if (raw === '' || isNaN(parseInt(raw, 10))) {
      input.value = cue.dmx_channels[index].channel.toString();
      return;
    }

    let newChannel = parseInt(raw, 10);
    if (newChannel < 1) newChannel = 1;
    if (newChannel > 512) newChannel = 512;

    if (this.isDmxChannelNumValid(cue, newChannel, index)) {
      cue.dmx_channels[index].channel = newChannel;
      input.value = String(newChannel);
      this.checkForChanges();
    } else {
      input.value = cue.dmx_channels[index].channel.toString();
    }
  }
  
  onDmxChannelValueChange(cue: CueData, index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    let newValue = parseInt(input.value, 10);
  
    if (isNaN(newValue)) return;
  
    newValue = Math.min(255, Math.max(0, newValue));
    input.value = String(newValue);
  
    if (cue.type !== 'dmx' || !cue.dmx_channels || !cue.dmx_channels[index]) return;
    cue.dmx_channels[index].value = newValue;
    this.checkForChanges();
  }

  trackByChannelIndex(index: number, channel: any): number {
    return index;
  }

  onUniverseNumChange(cue: CueData, value: any): void {
    // Handle empty string or null/undefined values
    if (value === '' || value === null || value === undefined) {
      cue.universe_num = 0;
      this.checkForChanges();
      return;
    }
    
    const newValue = parseInt(value.toString());
    
    if (cue.type !== 'dmx') return;
    
    // Validate range: 0-999
    if (isNaN(newValue)) {
      cue.universe_num = 0;
    } else if (newValue < 0) {
      cue.universe_num = 0;
    } else if (newValue > 999) {
      cue.universe_num = 999;
    } else {
      cue.universe_num = newValue;
    }
    
    this.checkForChanges();
  }

  onDmxFadeTimeChange(cue: CueData, value: any): void {
    if (cue.type !== 'dmx') return;
    if (value === '' || value === null || value === undefined) {
      cue.fade_in_time = 0;
      this.checkForChanges();
      return;
    }
    const num = parseFloat(value.toString());
    cue.fade_in_time = isNaN(num) || num < 0 ? 0 : num;
    this.checkForChanges();
  }

  /**
   * A new output's body, wire-shaped from the script descriptor (UR-1
   * transform) and without its `class` — wrapCueOutput adds that. Never
   * undefined: a descriptor that cannot provide it is reported (FR-034) and
   * the result is null.
   */
  private getTemplateOutputStructure(cueType: 'audio' | 'video'): any | null {
    const descriptor = this.schemaDescriptors.script();
    const typeKey = cueType === 'audio' ? SCRIPT_TYPES.audioOutput : SCRIPT_TYPES.videoOutput;
    try {
      if (!descriptor) throw new DescriptorGapError(typeKey, '(descriptor)');
      const { class: _class, ...body } = toWireShape(descriptor, typeKey);
      return body;
    } catch (error) {
      this.reportDescriptorGap(error);
      return null;
    }
  }

  openDeleteConfirmation(index: number): void {
    this.isConfirmDeleteOpen = true;
    this.cueToDeleteIndex = index;
  }

  closeDeleteConfirmation(): void {
    this.isConfirmDeleteOpen = false;
    this.cueToDeleteIndex = null;
  }

  confirmDelete(): void {
    if (this.cueToDeleteIndex !== null) {
      this.deleteCue(this.cueToDeleteIndex);
    }
    this.closeDeleteConfirmation();
  }

  private deleteCue(index: number) {
    const deletedCueId = String(this.cues[index].id);

    this.cues.splice(index, 1);

    // Nullify action_target if it pointed to the deleted cue (fade cues
    // carry action_target too — same dangling-ref rule as action cues)
    this.cues.forEach(cue => {
      if ((cue.type === 'action' || cue.type === 'fade') && cue.action_target === deletedCueId) {
        cue.action_target = null;
      }
    });
      
    // Reorder the numbers of order
    this.cues.forEach((cue, i) => {
      cue.order = i + 1;
    });

    this.checkForChanges();
  }
  
  public isCanvasRegionValid(cue: CueData): boolean {
    if (!cue.is_custom_output || !cue.canvas_region) return true;
    const { x, y, width, height } = cue.canvas_region;
    return x >= 0 && y >= 0 && width > 0 && height > 0
        && parseFloat((x + width).toFixed(10)) <= 1
        && parseFloat((y + height).toFixed(10)) <= 1;
  }  
}
