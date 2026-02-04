import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';

interface Node {
  uuid: string;
  nodeId: string;
  url: SafeResourceUrl;
}

@Component({
  selector: 'app-dmx-mixer',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dmx-mixer.component.html'
})
export class ProjectEditDmxMixerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  private http = inject(HttpClient);
  private uuid: string = '';

  projectUuid: string | null = null;
  dmxMixerUrl: SafeResourceUrl | null = null;

  nodeIds: Node[] = [];

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
        this.http
      .get<any>(`/api/projects/${projectUuid}/mappings/initial_mappings`)
      .subscribe({
        next: (response) => {
          const nodes = response?.value?.nodes ?? [];

          this.nodeIds = nodes
            .map((n: any) => {
              const uuid: string = n?.node?.uuid;
              const lastPart = uuid.split('-').pop() ?? '';
              if (/^\d{12}$/.test(lastPart)) {
                const url = `http://${lastPart}.local:9090`;
                return {
                  uuid,
                  nodeId: lastPart,
                  url: this.sanitizer.bypassSecurityTrustResourceUrl(url)
                };
              }
              return null;
            })
            .filter((n: Node | null): n is Node => !!n);
        },
        error: (err) => console.error('Error loading DMX mappings', err)
      });
  }

}




