import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface VideoLayer {
  id: number;
  name: string;
  opacity: number;
  disabled: boolean;
  time: string;
  color: string;
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
  selector: 'app-video-mixer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './video-mixer.component.html',
  styleUrls: ['./video-mixer.component.css']
})
export class ProjectEditVideoMixerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  
  projectUuid: string | null = null;
  Math = Math;
  
  videoLayers = signal<VideoLayer[]>([
    { id: 1, name: 'Video layer 01', opacity: 50, disabled: false, time: '00:00:00', color: 'bg-red-200' },
    { id: 2, name: 'Video layer 02', opacity: 50, disabled: false, time: '00:00:00', color: 'bg-blue-200' },
    { id: 3, name: 'Video layer 03', opacity: 50, disabled: false, time: '00:00:00', color: 'bg-yellow-200' }
  ]);
  
  corners = signal<Corners>({
    topLeft: { x: 0, y: 0 },
    topRight: { x: 100, y: 0 },
    bottomLeft: { x: 0, y: 100 },
    bottomRight: { x: 100, y: 100 }
  });
  
  draggedCorner = signal<string | null>(null);
  
  get topLeftX() { return this.corners().topLeft.x; }
  get topLeftY() { return this.corners().topLeft.y; }
  get topRightX() { return this.corners().topRight.x; }
  get topRightY() { return this.corners().topRight.y; }
  get bottomLeftX() { return this.corners().bottomLeft.x; }
  get bottomLeftY() { return this.corners().bottomLeft.y; }
  get bottomRightX() { return this.corners().bottomRight.x; }
  get bottomRightY() { return this.corners().bottomRight.y; }
  
  ngOnInit() {
    this.route.parent?.params.subscribe(params => {
      this.projectUuid = params['uuid'];
  
    });
    
    window.addEventListener('mousemove', this.handleGlobalMouseMove.bind(this));
    window.addEventListener('mouseup', this.handleGlobalMouseUp.bind(this));
  }
  
  ngOnDestroy() {
    window.removeEventListener('mousemove', this.handleGlobalMouseMove.bind(this));
    window.removeEventListener('mouseup', this.handleGlobalMouseUp.bind(this));
  }
  
  toggleLayer(layerId: number) {
    this.videoLayers.update(layers => 
      layers.map(layer => 
        layer.id === layerId 
          ? { ...layer, disabled: !layer.disabled } 
          : layer
      )
    );
    console.log(`Toggle layer ${layerId}, disabled: ${this.videoLayers().find(l => l.id === layerId)?.disabled}`);
  }
  
  duplicateLayer(layerId: number) {
    const layerToDuplicate = this.videoLayers().find(l => l.id === layerId);
    if (!layerToDuplicate) return;
    
    const maxId = Math.max(...this.videoLayers().map(l => l.id));
    const newId = maxId + 1;
    
    const newLayer: VideoLayer = {
      ...layerToDuplicate,
      id: newId,
      name: `${layerToDuplicate.name} (copy)`
    };
    
    this.videoLayers.update(layers => [...layers, newLayer]);
    
    console.log(`Duplicated layer ${layerId} to new layer ${newId}`);
  }
  
  updateOpacity(layerId: number, event: Event) {
    const value = +(event.target as HTMLInputElement).value;
    this.videoLayers.update(layers => 
      layers.map(layer => 
        layer.id === layerId 
          ? { ...layer, opacity: value } 
          : layer
      )
    );
    console.log(`Layer ${layerId} opacity updated to ${value}%`);
  }
  
  startDrag(corner: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.draggedCorner.set(corner);
    console.log(`Starting drag on corner: ${corner}`);
  }
  
  handleGlobalMouseMove(event: MouseEvent) {
    if (!this.draggedCorner()) return;
    
    const container = document.querySelector('.video-preview-area');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    
    const xPercent = Math.max(0, Math.min(100, 
      ((event.clientX - rect.left) / rect.width) * 100
    ));
    const yPercent = Math.max(0, Math.min(100, 
      ((event.clientY - rect.top) / rect.height) * 100
    ));
    
    const corner = this.draggedCorner() as keyof Corners;
    this.corners.update(corners => ({
      ...corners,
      [corner]: { x: xPercent, y: yPercent }
    }));
    
    this.updateCornerInputs(corner, xPercent, yPercent);
    
    console.log(`Dragging ${corner}: x=${xPercent.toFixed(1)}%, y=${yPercent.toFixed(1)}%`);
  }
  
  handleGlobalMouseUp() {
    if (this.draggedCorner()) {
      console.log(`Stopped dragging ${this.draggedCorner()}`);
      this.draggedCorner.set(null);
    }
  }
  
  updateCornerInputs(corner: string, x: number, y: number) {
    // Convert to format 000.000
    const xFormatted = x.toFixed(3).padStart(7, '0');
    const yFormatted = y.toFixed(3).padStart(7, '0');
    
    const position = 
      corner === 'topLeft' ? 'top-left' : 
      corner === 'topRight' ? 'top-right' : 
      corner === 'bottomLeft' ? 'bottom-left' : 
      'bottom-right';
    
    const xInput = document.querySelector(`.${position}-inputs .x-input`) as HTMLInputElement;
    const yInput = document.querySelector(`.${position}-inputs .y-input`) as HTMLInputElement;
    
    if (xInput) xInput.value = xFormatted;
    if (yInput) yInput.value = yFormatted;
  }
}