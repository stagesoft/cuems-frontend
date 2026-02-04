import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';

interface DmxNode {
  nodeId: string;
  url: SafeResourceUrl;
}

@Component({
  selector: 'app-dmx-mixer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dmx-mixer.component.html'
})
export class ProjectEditDmxMixerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  private http = inject(HttpClient);
  private uuid: string = '';

  projectUuid: string | null = null;
  dmxNodes: DmxNode[] = [];
  dmxMixerUrl: SafeResourceUrl | null = null;

  ngOnInit() {
    this.route.parent?.params.subscribe(params => {
      this.projectUuid = params['uuid'];
      if (!this.projectUuid) return;

      this.uuid = this.projectUuid;
      this.loadDmxMapping(this.uuid);
    });
  }

  //cargar los mappings iniciales
  private loadDmxMapping(projectUuid: string): void {
    this.http.get<any>(`/api/projects/${projectUuid}/mappings/initial_mappings`).subscribe({
      next: (response) => {
        const mappingValue = response?.value?.default_dmx_output ?? null;
        const nodeId = this.extractNodeId(mappingValue);

        if (nodeId) {
          const url = `http://${nodeId}.local:9090`;
          this.dmxMixerUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);

          } else {
            console.warn('No DMX node found in mappings');
          }
        },
      error: (err) => {
        console.error('Error loading initial mappings', err);
      }
    });
  }

  // Extrae los últimos 12 dígitos del UUID del nodo
  private extractNodeId(mappingValue: string | null): string | null {
    if (!mappingValue) return null;

    const parts = mappingValue.split('-');
    const lastPart = parts[parts.length - 1];

    return /^\d{12}$/.test(lastPart) ? lastPart : null;
  }

}




