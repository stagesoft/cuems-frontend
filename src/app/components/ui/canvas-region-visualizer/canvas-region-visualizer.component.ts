import { Component, input, computed } from '@angular/core';

@Component({
  selector: 'app-canvas-region-visualizer',
  standalone: true,
  imports: [],
  templateUrl: './canvas-region-visualizer.component.html'
})
export class CanvasRegionVisualizerComponent {
  readonly VW = 160;
  readonly VH = 90;

  x = input<number>(0);
  y = input<number>(0);
  width = input<number>(1);
  height = input<number>(1);

  svgRect = computed(() => {
    const x = this.x() * this.VW;
    const y = this.y() * this.VH;
    const w = this.width() * this.VW;
    const h = this.height() * this.VH;
    return {
      x: +x.toFixed(2),
      y: +y.toFixed(2),
      width: +w.toFixed(2),
      height: +h.toFixed(2),
      cx: +(x + w / 2).toFixed(2),
      cy: +(y + h / 2).toFixed(2),
      valid: this.x() >= 0 && this.y() >= 0 && this.width() > 0 && this.height() > 0
          && parseFloat((this.x() + this.width()).toFixed(10)) <= 1
          && parseFloat((this.y() + this.height()).toFixed(10)) <= 1
    };
  });
}