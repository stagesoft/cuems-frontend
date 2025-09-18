import { Component, DestroyRef, inject, signal, ViewChild, ElementRef, Input, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { UploadService, FileUploadItem } from '../../../../../services/media/upload.service';
import { IconComponent } from '../../../../ui/icon/icon.component';

@Component({
  selector: 'app-upload-form',
  standalone: true,
  imports: [CommonModule, IconComponent, TranslateModule],
  templateUrl: './upload-form.component.html',
  styleUrls: ['./upload-form.component.css'],
  host: {
    '[class.collapsible]': 'collapsible'
  }
})
export class UploadFormComponent implements OnInit {
  private uploadService = inject(UploadService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  @Input() collapsible: boolean = false;
  @Input() defaultExpanded: boolean = false;

  public uploadQueue = this.uploadService.uploadQueue;
  public isUploading = this.uploadService.isUploading;

  public isDragOver = signal(false);
  public isExpanded = signal(true);

  ngOnInit(): void {
    this.isExpanded.set(this.collapsible ? this.defaultExpanded : true);
  }

  toggleExpanded(): void {
    if (this.collapsible) {
      this.isExpanded.set(!this.isExpanded());
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files) {
      this.addFiles(files);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(input.files);
      // Clear the input to allow selecting the same file again
      input.value = '';
    }
  }

  openFileSelector(): void {
    this.fileInput.nativeElement.click();
  }

  private addFiles(files: FileList): void {
    this.uploadService.addFiles(files);
  }

  uploadAll(): void {
    this.uploadService.uploadAll();
  }

  clearList(): void {
    this.uploadService.clearQueue();
  }

  removeFile(fileId: string): void {
    this.uploadService.removeFile(fileId);
  }

  getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toUpperCase() || 'FILE';
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getStatusClass(status: FileUploadItem['status']): string {
    switch (status) {
      case 'completed':
        return 'text-success';
      case 'error':
        return 'text-danger';
      case 'uploading':
        return 'text-success-light';
      default:
        return 'text-gray-300';
    }
  }

  getStatusText(item: FileUploadItem): string {
    switch (item.status) {
      case 'pending':
        return 'Pendiente';
      case 'uploading':
        return `Subiendo... ${item.progress}%`;
      case 'completed':
        return 'Completado';
      case 'error':
        return `Error: ${item.error || 'Desconocido'}`;
      default:
        return 'Desconocido';
    }
  }
}
