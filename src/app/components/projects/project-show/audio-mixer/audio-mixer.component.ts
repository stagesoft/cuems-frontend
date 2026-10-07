import { Component, OnInit, OnDestroy, inject, effect, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IconComponent } from '../../../ui/icon/icon.component';
import { ProjectsService } from '../../../../services/projects/projects.service';
import { OscService } from '../../../../services/osc.service';
import { Subscription } from 'rxjs';
import { AudioMixerStateService } from '../../../../services/mixers/audio-mixer-state.service';
import { deviceOutputs, hasDeviceClass } from '../../../../core/mapping-wire';

@Component({
  selector: 'app-project-show-audio-mixer',
  templateUrl: './audio-mixer.component.html',
  standalone: true,
  imports: [CommonModule, IconComponent, FormsModule]
})
export class ProjectShowAudioMixerComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private projectsService = inject(ProjectsService);
  private oscService = inject(OscService);
  private audioMixerStateService = inject(AudioMixerStateService);
  private cdr = inject(ChangeDetectorRef);
  public project: any;
  public projectUuid: string | null = null;
  public audioCues: any[] = [];
  private projectLoadedSubscription?: Subscription;
  public audioMappingOptions: { value: string, label: string }[] = [];
  public audioNodes: any[] = [];
  private audioNodesReady = signal(false);

  constructor() {
    // Hydrate faders from the engine's mixer-status broadcast.
    // MUST live in the constructor, not ngOnInit: registering an effect()
    // outside an injection context throws NG0203.
    // NOTE: output.index is the forEach offset in the audio outputs array,
    // not a stable channel ID. If initial_mappings reorders outputs across
    // reloads, hydrated values land on the wrong fader. Pre-existing
    // limitation (same as the write path); not fixed here.
    effect(() => {
      const status = this.oscService.mixerStatus();
      if (!this.audioNodesReady()) return;
      if (Object.keys(status).length === 0) return;

      //console.log('[hydrate] running, status keys:', Object.keys(status));

      for (const node of this.audioNodes) {
        const masterVol = this.oscService.getMasterVolume(node.uuid);
        if (masterVol !== undefined) {
          node.volume = Math.round(masterVol * 100);
          this.audioMixerStateService.setNodeVolume(node.uuid, node.volume);
        }
        for (const output of node.outputs) {
          const chanVol = this.oscService.getChannelVolume(node.uuid, output.index);
          if (chanVol !== undefined) {
            output.volume = Math.round(chanVol * 100);
            this.audioMixerStateService.setOutputVolume(output.id, output.volume);
          }
        }
      }
      this.cdr.markForCheck();
    });
  }

  ngOnInit(): void {
    this.route.parent?.params.subscribe(params => {
      this.projectUuid = params['uuid'];
      console.log('Audio Mixer - Project UUID:', this.projectUuid);

      if (this.projectsService.projects().length === 0) {
        this.projectsService.getProjectList();
      }

      this.projectsService.loadProject(this.projectUuid);
      this.loadAudioNodesWithRetry();
    });

    this.projectLoadedSubscription = this.projectsService.projectLoaded.subscribe(projectData => {
      if (projectData) {
        const basicProjectData = this.projectsService.projects().find(p => p.uuid === this.projectUuid);
        if (basicProjectData) {
          if (!projectData.uuid) projectData.uuid = basicProjectData.uuid;
          if (!projectData.name) projectData.name = basicProjectData.name;
          if (!projectData.unix_name) projectData.unix_name = basicProjectData.unix_name;
          if (!projectData.created) projectData.created = basicProjectData.created;
          if (!projectData.modified) projectData.modified = basicProjectData.modified;
        }
        
        this.project = projectData;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.projectLoadedSubscription) {
      this.projectLoadedSubscription.unsubscribe();
    }
  }


  /**
   * Audio nodes from the mapping document, read through ProjectsService
   * (T094) so the version gate's eviction cannot be bypassed by a screen
   * reading storage on its own. Outputs come from `devices[].device` of class
   * audio (site 4 of 5); any other class is ignored.
   */
  private getAudioNodesFromMappings(): any[] {
    const nodes = this.projectsService.initialMappings()?.value?.nodes;
    if (!Array.isArray(nodes)) return [];
    return nodes
      .filter((nodeWrapper: any) => hasDeviceClass(nodeWrapper?.node, 'audio'))
      .map((nodeWrapper: any, nodeIndex: number) => {
        const node = nodeWrapper.node;
        const outputs = deviceOutputs(node, 'audio').map((outputWrapper: any) => {
          const outputId = outputWrapper.output.id;
          return {
            parentId: node.uuid,
            id: `${node.uuid}_${outputId}`,
            name: outputWrapper.output.name,
            volume: this.audioMixerStateService.getOutputVolume(`${node.uuid}_${outputId}`),
            index: outputId
          };
        });
        return {
          index: nodeIndex,
          uuid: node.uuid,
          volume: this.audioMixerStateService.getNodeVolume(node.uuid),
          outputs: outputs
        };
      });
  }
  
  private loadAudioNodesWithRetry(): void {
    this.tryLoad();
  }
  
  private tryLoad(attempt: number = 1, maxAttempts: number = 5): void {
    this.audioNodes = this.getAudioNodesFromMappings();
    
    if (this.audioNodes.length > 0) {
      console.log('Mappings loaded successfully:', this.audioNodes);
      this.audioNodesReady.set(true);
    } else if (attempt < maxAttempts) {
      console.log(`Attempt ${attempt} failed, retrying in ${attempt * 500}ms...`);
      setTimeout(() => this.tryLoad(attempt + 1, maxAttempts), attempt * 500);
    } else {
      console.warn('Failed to load mappings after', maxAttempts, 'attempts');
    }
  }

  /**
   * Get the short name of an output (remove the UUID from the beginning)
   */
  getOutputDisplayName(outputName: string): string {
    const parts = outputName.split('_');
    if (parts.length > 1) {
      return parts.slice(1).join('_');
    }
    return outputName;
  }

  public sliderToFloat(sliderValue: number): number {
    return sliderValue / 100;
  }

  public floatToSlider(floatValue: number): number {
    return Math.round(floatValue * 100);
  }

  // Echo-loop safety: the slider MUST stay one-way bound ([value] + (input)).
  // The engine broadcasts a status for every fader write, including ours;
  // mixerStatus updates from that echo, but the (input) binding does not
  // re-fire from a [value] change, so no loop. Switching to [(ngModel)]
  // activates the loop — do not.
  public onMasterVolumeChange(node: any, sliderValue: number): void {
    node.volume = sliderValue;
    this.audioMixerStateService.setNodeVolume(node.uuid, sliderValue);
    const floatVolume = this.sliderToFloat(sliderValue);
    this.oscService.sendMasterVolumeUpdate(node.uuid, floatVolume);
  }
  
  public onNodeVolumeChange(node: any, output: any, sliderValue: number): void {
    output.volume = sliderValue;
    this.audioMixerStateService.setOutputVolume(output.id, sliderValue);
    const floatVolume = this.sliderToFloat(sliderValue);
    const channelIndex = output.index;
    this.oscService.sendNodeVolumeUpdate(node.uuid, channelIndex, floatVolume);
  }  
}
