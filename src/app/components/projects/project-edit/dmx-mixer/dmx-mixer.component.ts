import { Component, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router, NavigationEnd } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ProjectsService } from '../../../../services/projects';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, filter } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface Node {
  uuid: string;
  nodeId: string;
  url: SafeResourceUrl;
}

@Component({
  selector: 'app-dmx-mixer',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule],
  templateUrl: './dmx-mixer.component.html'
})
export class ProjectEditDmxMixerComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private projectService = inject(ProjectsService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();
  private uuid: string = '';

  projectUuid: string | null = null;
  selectedNodeId: string | null = null;
  selectedNodeUrl: SafeResourceUrl | null = null;

  nodeIds: Node[] = [];
  isViewingNode: boolean = false;

  ngOnInit() {
    // Obtener projectUuid del parámetro parent
    this.route.parent?.params
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.projectUuid = params['uuid'];
        //console.log('[DMX Mixer] projectUuid obtenido:', this.projectUuid);
        if (!this.projectUuid) {
          //console.warn('[DMX Mixer] No se encontró projectUuid');
          return;
        }

        this.uuid = this.projectUuid;
        this.loadDmxMapping(this.uuid);
      });

    //Escuchar route.firstChild (la ruta hijo con nodeId)
    if (this.route.firstChild) {
      //console.log('[DMX Mixer] firstChild existe, escuchando sus parámetros');
      this.route.firstChild.params
        .pipe(takeUntil(this.destroy$))
        .subscribe(params => {
          const newNodeId = params['nodeId'] || null;
          //console.log('[DMX Mixer] Cambio en route.firstChild.params:', newNodeId);
          
          if (newNodeId !== this.selectedNodeId) {
            this.selectedNodeId = newNodeId;
            this.updateSelectedNode();
            this.cdr.markForCheck();
          }
        });
    }

    //Monitorear router.url directamente como fallback
    // Esto captura cambios de ruta de forma más agresiva
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: any) => {
        //console.log('[DMX Mixer] NavigationEnd - URL:', event.url);
        
        //parsear la URL para extraer el nodeId
        //buscar /dmx-mixer/nodeId
        const match = event.url.match(/dmx-mixer\/([^\/]+)$/);
        const newNodeId = match ? match[1] : null;
        
        //console.log('[DMX Mixer] nodeId extraído de URL:', newNodeId);
        //console.log('[DMX Mixer] selectedNodeId actual:', this.selectedNodeId);
        
        // Actualizar si hay cambio en nodeId
        if (newNodeId !== this.selectedNodeId) {
          //console.log('[DMX Mixer] Actualizando nodeId a:', newNodeId);
          this.selectedNodeId = newNodeId;
          
          // Pequeño delay para permitir que firstChild se actualice
          setTimeout(() => {
            this.updateSelectedNode();
            this.cdr.markForCheck();
          }, 50);
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Cargar los mappings iniciales
  private loadDmxMapping(projectUuid: string): void {
    //console.log(`[DMX Mixer] cargando mappings dmx para proyecto: ${projectUuid}`);

    // Obtener mappings del service (ya están en memoria)
    const mappings = this.projectService.initialMappings();
    
    if (!mappings?.value) {
      //console.warn('[DMX Mixer] No hay mappings disponibles');
      return;
    }

    //console.log('[DMX Mixer] Mappings obtenidos del service');
    const mappingValue = mappings.value;
    
    const nodes = mappingValue.nodes ?? [];
    //console.log('[DMX Mixer] Nodes array count:', nodes.length);

    const nodeMap = new Map<string, Node>();

    //Procesar cada nodo y extraer solo los que tienen información DMX
    nodes.forEach((nodeWrapper: any, index: number) => {
      const nodeData = nodeWrapper?.node;
      if (!nodeData) {
        //console.warn(`[DMX Mixer] Node ${index} sin información válida`);
        return;
      }

      const nodeUuid = nodeData.uuid;
      const dmxOutputs = nodeData.dmx ?? [];

      //console.log(`[DMX Mixer] Nodo ${index} - UUID: ${nodeUuid}`);
      //console.log(`[DMX Mixer] DMX outputs en nodo ${index}:`, dmxOutputs.length);

      // Si el nodo tiene salidas DMX, es un nodo DMX válido
      if (dmxOutputs.length > 0) {
        const node = this.createNodeFromUuid(nodeUuid);
        if (node) {
          //console.log(`[DMX Mixer] Nodo DMX agregado - NodeId: ${node.nodeId}`);
          nodeMap.set(node.nodeId, node);
        }
      }
    });

    this.nodeIds = Array.from(nodeMap.values());
    //console.log('[DMX Mixer] TOTAL nodeIds DMX cargados:', this.nodeIds.length);
    this.nodeIds.forEach(n => console.log(`  - ${n.nodeId}`));
    
    this.cdr.markForCheck();
    
    // Actualizar vista si ya hay un nodeId seleccionado
    if (this.selectedNodeId) {
      //console.log('[DMX Mixer] Actualizando nodo seleccionado después de cargar mappings');
      this.updateSelectedNode();
    }
  }

  private createNodeFromUuid(uuid: string): Node | null {
    if (!uuid) {
      //console.warn('[DMX Mixer] UUID vacío o nulo');
      return null;
    }
    
    const lastPart = uuid.split('-').pop() ?? '';
    
    // Validar que la última parte sea 12 dígitos
    if (/^\d{12}$/.test(lastPart)) {
      const url = `http://${lastPart}.local:9090`;
      //console.log(`[DMX Mixer] Node válido creado - NodeId: ${lastPart}, URL: ${url}`);
      return {
        uuid,
        nodeId: lastPart,
        url: this.sanitizer.bypassSecurityTrustResourceUrl(url)
      };
    } else {
      //console.warn(`[DMX Mixer] UUID inválido (lastPart no es 12 dígitos): "${lastPart}"`);
    }
    return null;
  }

  // Actualizar el nodo seleccionado basado en la URL
  private updateSelectedNode(): void {
    //console.log('[DMX Mixer] ACTUALIZANDO NODO SELECCIONADO');
    //console.log('[DMX Mixer] selectedNodeId:', this.selectedNodeId);
    //console.log('[DMX Mixer] nodeIds disponibles:', this.nodeIds.map(n => n.nodeId));
    
    if (this.selectedNodeId) {
      const node = this.nodeIds.find(n => n.nodeId === this.selectedNodeId);
      //console.log('[DMX Mixer] Búsqueda resultado:', node ? 'ENCONTRADO' : 'NO ENCONTRADO');
      
      if (node) {
        this.selectedNodeUrl = node.url;
        this.isViewingNode = true;
        //console.log('[DMX Mixer] Nodo seleccionado correctamente:', node.nodeId);
      } else {
        //console.warn('[DMX Mixer] Nodo no encontrado para nodeId:', this.selectedNodeId);
        this.isViewingNode = false;
      }
    } else {
      //console.log('[DMX Mixer] No hay nodeId seleccionado');
      this.selectedNodeUrl = null;
      this.isViewingNode = false;
    }
  }

  // Navegar a un nodo específico
  navigateToNode(nodeId: string): void {
    //console.log('[DMX Mixer] NAVEGANDO A NODO:', nodeId);
    //console.log('[DMX Mixer] projectUuid:', this.projectUuid);
    
    if (!this.projectUuid) {
      //console.error('[DMX Mixer] No hay projectUuid, no se puede navegar');
      return;
    }

    // Usar ruta absoluta en lugar de relativa para evitar problemas de routing
    const newPath = `/projects/${this.projectUuid}/edit/dmx-mixer/${nodeId}`;
    //console.log('[DMX Mixer] Navegando a:', newPath);
    
    this.router.navigateByUrl(newPath)
      .then(success => {
        console.log('[DMX Mixer] Navegación exitosa:', success);
      })
      .catch(err => {
        console.error('[DMX Mixer] Error en navegación:', err);
      });
  }

  // Volver a la lista de nodos
  backToList(): void {
    //console.log('[DMX Mixer] VOLVIENDO A LISTA DE NODOS');
    
    if (!this.projectUuid) {
      //console.error('[DMX Mixer] No hay projectUuid');
      return;
    }

    const newPath = `/projects/${this.projectUuid}/edit/dmx-mixer`;
    //console.log('[DMX Mixer] Volviendo a:', newPath);
    
    this.router.navigateByUrl(newPath)
      .then(success => {
        console.log('[DMX Mixer] Retorno exitoso:', success);
      })
      .catch(err => {
        console.error('[DMX Mixer] Error al volver:', err);
      });
  }
}
