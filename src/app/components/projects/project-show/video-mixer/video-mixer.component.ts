import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../../ui/icon/icon.component';

interface VideoOutputRaw {
  parentId: string;
  id: string;
  name: string;
  index: number;
}

interface VideoNode {
  index: number;
  uuid: string;
  outputs: VideoOutputRaw[];
}

interface VideoOutput {
  parentId: string;
  id: string;
  name: string;
  index: number;
  
  // UI state properties for each output
  scale: number;
  settingsExpanded?: boolean;
  corners?: Corners;
}

interface VideoNodeWithUI {
  nodeUuid: string;        // UUID del nodo master
  nodeIndex: number;       // Índice del nodo
  outputs: VideoOutput[];  // Array de outputs con sus propiedades UI
}

interface Point {
  x: number;
  y: number;
}

interface Corners {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
}

@Component({
  selector: 'app-project-show-video-mixer',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './video-mixer.component.html',
  styleUrls: ['./video-mixer.component.css']
})
export class ProjectShowVideoMixerComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  
  projectUuid: string | null = null;
  Math = Math;
  
  public project: any;
  public videoNodes: VideoNode[] = [];
  
  videoNodesWithUI = signal<VideoNodeWithUI[]>([]);
  
  draggedCorner = signal<string | null>(null);
  activeLayerId = signal<string | null>(null);
  
  ngOnInit() {
    this.route.parent?.params.subscribe(params => {
      this.projectUuid = params['uuid'];

      this.loadVideoNodesWithRetry();
    });
    
    window.addEventListener('mousemove', this.handleGlobalMouseMove.bind(this));
    window.addEventListener('mouseup', this.handleGlobalMouseUp.bind(this));
  }
  
  ngOnDestroy() {
    window.removeEventListener('mousemove', this.handleGlobalMouseMove.bind(this));
    window.removeEventListener('mouseup', this.handleGlobalMouseUp.bind(this));
  }
  
  /**
   * Get video nodes from localStorage and extract video outputs
   */
  private getVideoNodesFromLocalStorage(): VideoNode[] {
    const mappingsData = localStorage.getItem('initial_mappings');
    if (!mappingsData) return [];
    
    try {
      const data = JSON.parse(mappingsData);
      const mappings = data.value;
      
      if (!mappings || !mappings.nodes || !Array.isArray(mappings.nodes)) {
        console.error('Invalid mappings structure');
        return [];
      }
      
      return mappings.nodes
        .filter((nodeWrapper: any) => nodeWrapper?.node?.video !== null)
        .map((nodeWrapper: any, nodeIndex: number) => {
          const node = nodeWrapper.node;
          const outputs: VideoOutputRaw[] = [];
          
          node.video.forEach((videoSection: any) => {
            if (videoSection.outputs) {
              videoSection.outputs.forEach((outputWrapper: any, outputIndex: number) => {
                outputs.push({
                  parentId: node.uuid,
                  id: `${node.uuid}_${outputWrapper.output.name}`,
                  name: outputWrapper.output.name,
                  index: outputIndex
                });
              });
            }
          });
          
          return {
            index: nodeIndex,
            uuid: node.uuid,
            outputs: outputs
          };
        });
        
    } catch (error) {
      console.error('Error parsing mappings JSON:', error);
      return [];
    }
  }
  
  /**
   * Load video nodes with retry mechanism
   */
  private loadVideoNodesWithRetry(): void {
    this.tryLoadVideoNodes();
  }
  
  private tryLoadVideoNodes(attempt: number = 1, maxAttempts: number = 5): void {
    this.videoNodes = this.getVideoNodesFromLocalStorage();
    
    if (this.videoNodes.length > 0) {
      console.log('Video nodes loaded successfully:', this.videoNodes);
      this.initializeVideoLayers();
    } else if (attempt < maxAttempts) {
      console.log(`Attempt ${attempt} failed, retrying in ${attempt * 500}ms...`);
      setTimeout(() => this.tryLoadVideoNodes(attempt + 1, maxAttempts), attempt * 500);
    } else {
      console.warn('Failed to load video nodes after', maxAttempts, 'attempts');
    }
  }
  
  /**
   * Initialize video nodes with UI properties from the loaded video outputs
   */
  private initializeVideoLayers(): void {
    const nodesWithUI: VideoNodeWithUI[] = [];
    
    this.videoNodes.forEach(node => {
      const outputsWithUI: VideoOutput[] = node.outputs.map(output => ({
        parentId: output.parentId,
        id: output.id,
        name: output.name,
        index: output.index,
        scale: 1,
        settingsExpanded: false,
        corners: {
          topLeft: { x: 0, y: 0 },
          topRight: { x: 100, y: 0 },
          bottomLeft: { x: 0, y: 100 },
          bottomRight: { x: 100, y: 100 }
        }
      }));
      
      nodesWithUI.push({
        nodeUuid: node.uuid,
        nodeIndex: node.index,
        outputs: outputsWithUI
      });
    });
    
    this.videoNodesWithUI.set(nodesWithUI);
    console.log('Video nodes with UI initialized:', nodesWithUI);
  }
  
  /**
   * Get the display name of an output (remove the UUID prefix)
   */
  getOutputDisplayName(outputName: string): string {
    const parts = outputName.split('_');
    if (parts.length > 1) {
      return parts.slice(1).join('_');
    }
    return outputName;
  }
  
  
  toggleSettings(outputId: string) {
    this.videoNodesWithUI.update(nodes => 
      nodes.map(node => ({
        ...node,
        outputs: node.outputs.map(output =>
          output.id === outputId
            ? { ...output, settingsExpanded: !output.settingsExpanded }
            : output
        )
      }))
    );
    console.log(`Toggle settings for layer ${outputId}`);
  }
  
  getLayerCorners(outputId: string): Corners {
    for (const node of this.videoNodesWithUI()) {
      const output = node.outputs.find(o => o.id === outputId);
      if (output?.corners) return output.corners;
    }
    return {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 100, y: 0 },
      bottomLeft: { x: 0, y: 100 },
      bottomRight: { x: 100, y: 100 }
    };
  }
  
  updateScale(outputId: string, event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.videoNodesWithUI.update(nodes => 
      nodes.map(node => ({
        ...node,
        outputs: node.outputs.map(output =>
          output.id === outputId
            ? { ...output, scale: value }
            : output
        )
      }))
    );
    console.log(`Output ${outputId} scale updated to ${value}`);
  }
  
  startDrag(layerId: string, corner: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.draggedCorner.set(corner);
    this.activeLayerId.set(layerId);
    console.log(`Starting drag on corner: ${corner} for layer: ${layerId}`);
  }
  
  handleGlobalMouseMove(event: MouseEvent) {
    if (!this.draggedCorner() || !this.activeLayerId()) return;
    
    const layerId = this.activeLayerId()!;
    const escapedLayerId = CSS.escape(layerId);
    const container = document.querySelector(`#layer-${escapedLayerId}-transform .video-preview-area`);
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    
    const xPercent = Math.max(0, Math.min(100, 
      ((event.clientX - rect.left) / rect.width) * 100
    ));
    const yPercent = Math.max(0, Math.min(100, 
      ((event.clientY - rect.top) / rect.height) * 100
    ));
    
    const corner = this.draggedCorner() as keyof Corners;
    
    // Update the specific output's corners
    this.videoNodesWithUI.update(nodes => 
      nodes.map(node => ({
        ...node,
        outputs: node.outputs.map(output =>
          output.id === layerId && output.corners
            ? {
                ...output,
                corners: {
                  ...output.corners,
                  [corner]: { x: xPercent, y: yPercent }
                }
              }
            : output
        )
      }))
    );
    
    this.updateCornerInputs(layerId, corner, xPercent, yPercent);
    
    console.log(`Dragging ${corner} for layer ${layerId}: x=${xPercent.toFixed(1)}%, y=${yPercent.toFixed(1)}%`);
  }
  
  handleGlobalMouseUp() {
    if (this.draggedCorner()) {
      console.log(`Stopped dragging ${this.draggedCorner()} for layer ${this.activeLayerId()}`);
      this.draggedCorner.set(null);
      this.activeLayerId.set(null);
    }
  }
  
  updateCornerInputs(layerId: string, corner: string, x: number, y: number) {
    // Convert to format 000.000
    const xFormatted = x.toFixed(3).padStart(7, '0');
    const yFormatted = y.toFixed(3).padStart(7, '0');
    
    const position = 
      corner === 'topLeft' ? 'top-left' : 
      corner === 'topRight' ? 'top-right' : 
      corner === 'bottomLeft' ? 'bottom-left' : 
      'bottom-right';
    
    // Escape the layerId for use in querySelector (in case it contains special characters)
    const escapedLayerId = CSS.escape(layerId);
    const transformArea = document.querySelector(`#layer-${escapedLayerId}-transform`);
    if (!transformArea) return;
    
    const xInput = transformArea.querySelector(`.${position}-inputs .x-input`) as HTMLInputElement;
    const yInput = transformArea.querySelector(`.${position}-inputs .y-input`) as HTMLInputElement;
    
    if (xInput) xInput.value = xFormatted;
    if (yInput) yInput.value = yFormatted;
  }
  
  startDragForLayer(outputId: string, corner: string, event: MouseEvent) {
    // First ensure the output's settings are expanded
    let outputFound = false;
    for (const node of this.videoNodesWithUI()) {
      const output = node.outputs.find(o => o.id === outputId);
      if (output?.settingsExpanded) {
        outputFound = true;
        break;
      }
    }
    
    if (!outputFound) return;
    
    this.startDrag(outputId, corner, event);
  }
}