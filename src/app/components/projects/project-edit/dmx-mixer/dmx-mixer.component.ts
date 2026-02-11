import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ProjectsService } from '../../../../services/projects';

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
  private projectService = inject(ProjectsService);
  private uuid: string = '';

  projectUuid: string | null = null;
  dmxMixerUrl: SafeResourceUrl | null = null;

  nodeIds: Node[] = [];

  ngOnInit() {
    console.log('[DMX Mixer] Iniciando componente');
    this.route.parent?.params.subscribe(params => {
      this.projectUuid = params['uuid'];
      console.log('[DMX Mixer] projectUuid obtenido:', this.projectUuid);
      if (!this.projectUuid) {
        console.warn('[DMX Mixer] No se encontró projectUuid');
        return;
      }

      this.uuid = this.projectUuid;
      this.loadDmxMapping(this.uuid);
    });
  }

  //cargar los mappings iniciales
  private loadDmxMapping(projectUuid: string): void {
    console.log(`[DMX Mixer] Cargando mappings para proyecto: ${projectUuid}`);

    // Obtener mappings del service (ya están en memoria)
    const mappings = this.projectService.initialMappings();
    
    if (!mappings?.value) {
      console.warn('[DMX Mixer] No hay mappings disponibles');
      return;
    }

    console.log('[DMX Mixer] Mappings obtenidos del service:', mappings);
    const mappingValue = mappings.value;
    
    const nodes = mappingValue.nodes ?? [];
    const defaultDmxOutput = mappingValue.default_dmx_output ?? null;

    console.log('[DMX Mixer] default_dmx_output:', defaultDmxOutput);
    console.log('[DMX Mixer] nodes array:', nodes);

    const collectedNodes: Node[] = [];

    // Procesar default_dmx_output si existe
    if (defaultDmxOutput) {
      console.log('[DMX Mixer] Procesando default_dmx_output:', defaultDmxOutput);
      const node = this.createNodeFromUuid(defaultDmxOutput);
      if (node) {
        console.log('[DMX Mixer] Node creado desde default_dmx_output:', node);
        collectedNodes.push(node);
      } else {
        console.warn('[DMX Mixer] No se pudo crear node desde default_dmx_output');
      }
    }

    // Procesar nodes del array
    const nodesFromArray = nodes
      .map((n: any) => {
        const uuid: string = n?.node?.uuid;
        console.log('[DMX Mixer] Procesando node UUID:', uuid);
        return this.createNodeFromUuid(uuid);
      })
      .filter((n: Node | null): n is Node => !!n);

    this.nodeIds = [...collectedNodes, ...nodesFromArray];
    console.log('[DMX Mixer] nodeIds finales:', this.nodeIds);
  }

  private createNodeFromUuid(uuid: string): Node | null {
    if (!uuid) {
      console.warn('[DMX Mixer] UUID vacío o nulo');
      return null;
    }
    
    const lastPart = uuid.split('-').pop() ?? '';
    console.log(`[DMX Mixer] Extrayendo lastPart de UUID "${uuid}":`, lastPart);
    
    // Validar que la última parte sea 12 dígitos
    if (/^\d{12}$/.test(lastPart)) {
      const url = `http://${lastPart}.local:9090`;
      console.log(`[DMX Mixer] URL construida:`, url);
      return {
        uuid,
        nodeId: lastPart,
        url: this.sanitizer.bypassSecurityTrustResourceUrl(url)
      };
    } else {
      console.warn(`[DMX Mixer] lastPart no coincide con patrón de 12 dígitos: "${lastPart}"`);
    }
    return null;
  }

}




