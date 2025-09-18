import { Component, inject, DestroyRef, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AppPageHeaderComponent } from '../../layout/app-page-header/app-page-header.component';
import { MediaService } from '../../../services/media/media.service';
import { ConfirmationDialogComponent } from '../../ui/confirmation-dialog/confirmation-dialog.component';
import { FileIconPreviewComponent } from '../shared/ui/file-icon-preview/file-icon-preview.component';
import { Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-media-trash',
  standalone: true,
  imports: [CommonModule, RouterModule, AppPageHeaderComponent, ConfirmationDialogComponent, FileIconPreviewComponent, TranslateModule],
  templateUrl: './media-trash.component.html'
})
export class MediaTrashComponent implements OnInit, OnDestroy {
  public mediaService = inject(MediaService);
  private subscription = new Subscription();

  selectedFiles: string[] = [];

  protected isLoading = true;
  fileToDeleteUuid: string | null = null;
  fileToRestoreUuid: string | null = null;
  isConfirmDeleteOpen = false;
  isConfirmRestoreOpen = false;
  isConfirmBulkDeleteOpen = false;
  isConfirmBulkRestoreOpen = false;
  isBulkDeleting = false;
  isBulkRestoring = false;
  
  private deletingFiles = new Map<string, boolean>();
  private restoringFiles = new Map<string, boolean>();
  
  constructor() {
    this.refreshFiles();

    effect(() => {
      const files = this.mediaService.fileTrashList();
      this.isLoading = false;
      
      this.cleanupFileMaps(files);
    });
  }

  ngOnInit() {
    this.subscription.add(
      this.mediaService.errorEvent.subscribe(error => {
        
        if (error.action === 'file_trash_delete' || error.action === 'file_recover') {
          if (this.fileToDeleteUuid) {
            this.deletingFiles.delete(this.fileToDeleteUuid);
            this.fileToDeleteUuid = null;
          }
          
          if (this.fileToRestoreUuid) {
            this.restoringFiles.delete(this.fileToRestoreUuid);
            this.fileToRestoreUuid = null;
          }
          
          this.isBulkDeleting = false;
          this.isBulkRestoring = false;
        }
      })
    );

    this.subscription.add(
      this.mediaService.operationSuccess.subscribe(operation => {
        
        if (operation === 'file_recover') {
          this.restoringFiles.clear();
          this.isBulkRestoring = false;
          this.fileToRestoreUuid = null;
        }
        
        if (operation === 'file_trash_delete') {
          this.deletingFiles.clear();
          this.isBulkDeleting = false;
          this.fileToDeleteUuid = null;
        }
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

    if (this.restoringFiles.size > 0) {
      let removed = 0;
      this.restoringFiles.forEach((value, uuid) => {
        if (!existingUuids.includes(uuid)) {
          this.restoringFiles.delete(uuid);
          removed++;
        }
      });
      
      if (this.restoringFiles.size === 0) {
        this.isBulkRestoring = false;
      }
    }
  }

  isFileBeingDeleted(uuid: string): boolean {
    return this.deletingFiles.has(uuid);
  }

  isFileBeingRestored(uuid: string): boolean {
    return this.restoringFiles.has(uuid);
  }

  isFileBeingProcessed(uuid: string): boolean {
    return this.isFileBeingDeleted(uuid) || this.isFileBeingRestored(uuid);
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

      this.executeFilePermanentDeletion(this.fileToDeleteUuid);
      this.closeDeleteConfirmation();
    }
  }

  executeFilePermanentDeletion(uuid: string) {
    this.mediaService.permanentDeleteFile(uuid);
  }

  permanentDeleteFile(uuid: string) {
    if (this.isFileBeingProcessed(uuid)) {
      return;
    }
    
    this.openDeleteConfirmation(uuid);
  }

  openRestoreConfirmation(uuid: string) {
    this.fileToRestoreUuid = uuid;
    this.isConfirmRestoreOpen = true;
  }

  closeRestoreConfirmation() {
    this.isConfirmRestoreOpen = false;
    this.fileToRestoreUuid = null;
  }

  confirmRestore() {
    if (this.fileToRestoreUuid) {
      this.restoringFiles.set(this.fileToRestoreUuid, true);

      if (this.selectedFiles.includes(this.fileToRestoreUuid)) {
        this.selectedFiles = this.selectedFiles.filter(uuid => uuid !== this.fileToRestoreUuid);
      }

      this.executeFileRestore(this.fileToRestoreUuid);
      this.closeRestoreConfirmation();
    }
  }

  executeFileRestore(uuid: string) {
    this.mediaService.restoreFile(uuid);
  }

  restoreFile(uuid: string) {
    if (this.isFileBeingProcessed(uuid)) {
      return;
    }
    
    this.openRestoreConfirmation(uuid);
  }

  selectFile(uuid: string): void {
    if (this.isFileBeingProcessed(uuid)) {
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
    return this.mediaService.fileTrashList().map((f: any) => this.getFileUuid(f)).filter(uuid => !this.isFileBeingProcessed(uuid));
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
    this.executePermanentDeleteFiles(this.selectedFiles);
    this.selectedFiles = [];
    this.closeBulkDeleteConfirmation();
  }

  executePermanentDeleteFiles(uuids: string[]): void {
    uuids.forEach(uuid => {
      this.mediaService.permanentDeleteFile(uuid);
    });
  }

  restoreSelectedFiles(): void {
    if (this.selectedFiles.length === 0) return;
    
    this.isConfirmBulkRestoreOpen = true;
  }

  closeBulkRestoreConfirmation(): void {
    this.isConfirmBulkRestoreOpen = false;
  }

  confirmBulkRestore(): void {
    this.selectedFiles.forEach(uuid => {
      this.restoringFiles.set(uuid, true);
    });
    
    this.isBulkRestoring = true;
    this.executeRestoreFiles(this.selectedFiles);
    this.selectedFiles = [];
    this.closeBulkRestoreConfirmation();
  }

  executeRestoreFiles(uuids: string[]): void {
    uuids.forEach(uuid => {
      this.mediaService.restoreFile(uuid);
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