import { Component, inject, DestroyRef, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AppPageHeaderComponent } from '../../layout/app-page-header/app-page-header.component';
import { MediaService } from '../../../services/media/media.service';
import { ConfirmationDialogComponent } from '../../ui/confirmation-dialog/confirmation-dialog.component';
import { UploadFormComponent } from '../shared/forms/upload-form/upload-form.component';
import { FileIconPreviewComponent } from '../shared/ui/file-icon-preview/file-icon-preview.component';
import { UploadService } from '../../../services/media/upload.service';
import { Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-media-list',
  standalone: true,
  imports: [CommonModule, RouterModule, AppPageHeaderComponent, ConfirmationDialogComponent, UploadFormComponent, FileIconPreviewComponent, TranslateModule],
  templateUrl: './media-list.component.html'
})
export class MediaListComponent implements OnInit, OnDestroy {
  public mediaService = inject(MediaService);
  private uploadService = inject(UploadService);
  private subscription = new Subscription();

  selectedFiles: string[] = [];

  protected isLoading = true;
  fileToDeleteUuid: string | null = null;
  isConfirmDeleteOpen = false;
  isConfirmBulkDeleteOpen = false;
  isBulkDeleting = false;
  
  private deletingFiles = new Map<string, boolean>();
  
  constructor() {
    this.refreshFiles();

    effect(() => {
      const files = this.mediaService.fileList();
      this.isLoading = false;
      
      this.cleanupFileMaps(files);
    });
  }

  ngOnInit() {
    this.subscription.add(
      this.mediaService.errorEvent.subscribe(error => {
        if (error.action === 'file_delete') {
          if (this.fileToDeleteUuid) {
            this.deletingFiles.delete(this.fileToDeleteUuid);
            this.fileToDeleteUuid = null;
          }
          
          this.isBulkDeleting = false;
        }
      })
    );

    this.subscription.add(
      this.mediaService.operationSuccess.subscribe(operation => {        
        if (operation === 'file_delete') {
          this.deletingFiles.clear();
          this.isBulkDeleting = false;
          this.fileToDeleteUuid = null;
        }
      })
    );

    this.subscription.add(
      this.uploadService.mediaListRefreshNeeded.subscribe(() => {
        this.refreshFiles();
      })
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  cleanupFileMaps(files: any[]) {
    const existingUuids = files.map((f: any) => this.getFileUuid(f));
    
    if (this.selectedFiles.length > 0) {
      this.selectedFiles = this.selectedFiles.filter(uuid => existingUuids.includes(uuid));
    }
    
    if (this.deletingFiles.size > 0) {
      let removed = 0;
      this.deletingFiles.forEach((value, uuid) => {
        if (!existingUuids.includes(uuid)) {
          this.deletingFiles.delete(uuid);
          removed++;
        }
      });
      
      if (this.deletingFiles.size === 0) {
        this.isBulkDeleting = false;
      }
    }
  }

  isFileBeingDeleted(uuid: string): boolean {
    return this.deletingFiles.has(uuid);
  }

  refreshFiles(): void {
    this.isLoading = true;
    this.mediaService.getFileList();
    this.mediaService.getFileTrashList();
  }

  openDeleteConfirmation(uuid: string) {
    this.fileToDeleteUuid = uuid;
    this.isConfirmDeleteOpen = true;
  }

  closeDeleteConfirmation() {
    this.isConfirmDeleteOpen = false;
    this.fileToDeleteUuid = null;
  }

  confirmDelete() {
    if (this.fileToDeleteUuid) {
      this.deletingFiles.set(this.fileToDeleteUuid, true);

      if (this.selectedFiles.includes(this.fileToDeleteUuid)) {
        this.selectedFiles = this.selectedFiles.filter(uuid => uuid !== this.fileToDeleteUuid);
      }

      this.executeFileDeletion(this.fileToDeleteUuid);
      this.closeDeleteConfirmation();
    }
  }

  executeFileDeletion(uuid: string) {
    this.mediaService.deleteFile(uuid);
  }

  deleteFile(uuid: string) {
    if (this.isFileBeingDeleted(uuid)) {
      return;
    }
    
    this.openDeleteConfirmation(uuid);
  }

  selectFile(uuid: string): void {
    if (this.isFileBeingDeleted(uuid)) {
      return;
    }
    
    if (this.selectedFiles.includes(uuid)) {
      this.selectedFiles = this.selectedFiles.filter(id => id !== uuid);
    } else {
      this.selectedFiles.push(uuid);
    }
  }

  selectAllFiles(): void {
    if (this.selectedFiles.length === this.getSelectableFiles().length) {
      this.selectedFiles = [];
    } else {
      this.selectedFiles = this.getSelectableFiles();
    }
  }

  getSelectableFiles(): string[] {
    return this.mediaService.fileList().map((f: any) => this.getFileUuid(f)).filter(uuid => !this.isFileBeingDeleted(uuid));
  }

  deselectAllFiles(): void {
    this.selectedFiles = [];
  }

  deleteSelectedFiles(): void {
    if (this.selectedFiles.length === 0) return;
    
    this.isConfirmBulkDeleteOpen = true;
  }

  closeBulkDeleteConfirmation(): void {
    this.isConfirmBulkDeleteOpen = false;
  }

  confirmBulkDelete(): void {
    this.selectedFiles.forEach(uuid => {
      this.deletingFiles.set(uuid, true);
    });
    
    this.isBulkDeleting = true;
    this.executeDeleteFiles(this.selectedFiles);
    this.selectedFiles = [];
    this.closeBulkDeleteConfirmation();
  }

  executeDeleteFiles(uuids: string[]): void {
    uuids.forEach(uuid => {
      this.mediaService.deleteFile(uuid);
    });
  }

  getFileUuid(fileObj: any): string {
    const keys = Object.keys(fileObj);
    return keys.length > 0 ? keys[0] : '';
  }

  getFileData(fileObj: any): any {
    const uuid = this.getFileUuid(fileObj);
    return uuid ? fileObj[uuid] : null;
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getFileExtension(filename: string): string {
    if (!filename || typeof filename !== 'string') {
      return '';
    }
    
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()?.toUpperCase() || '' : '';
  }

  getProjectNames(projectsList: any[]): string[] {
    if (!projectsList || !Array.isArray(projectsList)) {
      return [];
    }
    
    return projectsList.map((project: any) => project.name || 'Unknown Project');
  }
} 