import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-dmx-mixer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dmx-mixer.component.html'
})
export class ProjectEditDmxMixerComponent implements OnInit {
  private route = inject(ActivatedRoute);

  projectUuid: string | null = null;

  ngOnInit() {
    this.route.parent?.params.subscribe(params => {
      this.projectUuid = params['uuid'];
    });
  }

}

//función para extraer el id del nodo
function extractNodeId(mappingValue: string | null): string | null {
  if (!mappingValue) return null;

  const parts = mappingValue.split('-');
  const lastPart = parts[parts.length - 1];

  // Aseguramos que sean 12 dígitos
  if (/^\d{12}$/.test(lastPart)) {
    return lastPart;
  }

  return null;
}

//construir la url para ola
function buildOlaUrl(nodeId: string): string {
  return `http://${nodeId}.local:9090`;
}
