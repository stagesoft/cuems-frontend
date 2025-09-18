import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-file-icon-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-icon-preview.component.html'
})
export class FileIconPreviewComponent {
  @Input() fileType: string = '';
  @Input() fileName: string = '';
  @Input() uuid: string = '';
  @Input() showExtension: boolean = true;

  get backgroundColor(): string {
    switch (this.fileType) {
      case 'AUDIO': return '#B2BEF0';
      case 'IMAGE': return '#EAAA9C';
      case 'MOVIE': return '#F7DD6F';
      default: return '#B2BEF0';
    }
  }

  get icon(): string {
    switch (this.fileType) {
      case 'AUDIO': return 'audio';
      case 'IMAGE': return 'image';
      case 'MOVIE': return 'movie';
      default: return 'audio';
    }
  }

  get extension(): string {
    if (!this.fileName) return '';
    const parts = this.fileName.split('.');
    return parts.length > 1 ? parts.pop()?.toUpperCase() || '' : '';
  }

  get shouldShowThumbnail(): boolean {
    return false;
  }

  get shouldShowWaveform(): boolean {
    return false;
  }
} 