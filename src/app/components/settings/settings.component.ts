import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppPageHeaderComponent } from '../layout/app-page-header/app-page-header.component';
import { IconComponent } from '../ui/icon/icon.component';
import { ProjectsService, InitialMappingsResponse } from '../../services/projects/projects.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-settings',
  imports: [CommonModule, AppPageHeaderComponent, IconComponent, TranslateModule],
  templateUrl: './settings.component.html'
})
export class SettingsComponent implements OnInit {
  private projectsService = inject(ProjectsService);
  
  public mappings: InitialMappingsResponse | null = null;

  ngOnInit(): void {
    this.mappings = this.projectsService.initialMappings();
  }

  getNodeName(index: number): string {
    return `Node ${String(index + 1).padStart(2, '0')}`;
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
    if (output.output && output.output.mappings && output.output.mappings.length > 0) {
      return output.output.mappings[0].mapped_to;
    }
    return output.output?.name || 'Sin nombre';
  }

  formatNumber(num: number): string {
    return String(num + 1).padStart(2, '0');
  }
}
