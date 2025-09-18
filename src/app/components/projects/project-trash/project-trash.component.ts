import { Component, inject, DestroyRef, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AppPageHeaderComponent } from '../../layout/app-page-header/app-page-header.component';
import { ProjectsService } from '../../../services/projects/projects.service';
import { ConfirmationDialogComponent } from '../../ui/confirmation-dialog/confirmation-dialog.component';
import { Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-project-trash',
  standalone: true,
  imports: [CommonModule, RouterModule, AppPageHeaderComponent, ConfirmationDialogComponent, TranslateModule],
  templateUrl: './project-trash.component.html'
})
export class ProjectTrashComponent implements OnInit, OnDestroy {
  public projectsService = inject(ProjectsService);
  private subscription = new Subscription();

  protected isLoading = true;
  projectToRestoreUuid: string | null = null;
  projectToDeleteUuid: string | null = null;
  isConfirmRestoreOpen = false;
  isConfirmDeleteOpen = false;
  isConfirmBulkRestoreOpen = false;
  isConfirmBulkDeleteOpen = false;

  selectedProjects: string[] = [];
  isRestoring = false;
  isDeleting = false;
  
  private restoringProjects = new Map<string, boolean>();
  private deletingProjects = new Map<string, boolean>();

  constructor() {
    this.refreshProjects();

    effect(() => {
      const trashProjects = this.projectsService.projectsInTrash();
      this.isLoading = false;
      
      this.cleanupProjectMaps(trashProjects);
    });
  }

  ngOnInit() {
    this.loadProjects();
    
    this.subscription.add(
      this.projectsService.errorEvent.subscribe(error => {
        console.log('Error event received:', error);
        
        if (error.action === 'project_restore') {
          if (this.projectToRestoreUuid) {
            this.restoringProjects.delete(this.projectToRestoreUuid);
            this.projectToRestoreUuid = null;
          }
          this.isRestoring = false;
        }
        
        if (error.action === 'project_trash_delete') {
          if (this.projectToDeleteUuid) {
            this.deletingProjects.delete(this.projectToDeleteUuid);
            this.projectToDeleteUuid = null;
          }
          this.isDeleting = false;
        }
      })
    );
    
    this.subscription.add(
      this.projectsService.projectRestored.subscribe(uuid => {
        this.handleProjectRestore(uuid);
      })
    );
    
    this.subscription.add(
      this.projectsService.projectPermanentlyDeleted.subscribe(uuid => {
        this.handleProjectPermanentDelete(uuid);
      })
    );
  }
  
  private handleProjectRestore(uuid: string): void {

    if (!uuid) {
      return;
    }

    this.restoringProjects.delete(uuid);
    this.selectedProjects = this.selectedProjects.filter(id => id !== uuid);
    
    if (this.restoringProjects.size === 0) {
      this.isRestoring = false;
    }
  }
  
  private handleProjectPermanentDelete(uuid: string): void {
    if (!uuid) return;
    
    this.deletingProjects.delete(uuid);
    this.selectedProjects = this.selectedProjects.filter(id => id !== uuid);
    
    if (this.deletingProjects.size === 0) {
      this.isDeleting = false;
    }
  }
  
  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  cleanupProjectMaps(projects: any[]) {
    const existingUuids = projects.map(p => p.uuid);
    
    if (this.selectedProjects.length > 0) {
      this.selectedProjects = this.selectedProjects.filter(uuid => existingUuids.includes(uuid));
    }
    
    if (this.restoringProjects.size > 0) {
      let removed = 0;
      this.restoringProjects.forEach((value, uuid) => {
        if (!existingUuids.includes(uuid)) {
          this.restoringProjects.delete(uuid);
          removed++;
        }
      });
      
      if (this.restoringProjects.size === 0) {
        this.isRestoring = false;
      }
    }
    
    if (this.deletingProjects.size > 0) {
      let removed = 0;
      this.deletingProjects.forEach((value, uuid) => {
        if (!existingUuids.includes(uuid)) {
          this.deletingProjects.delete(uuid);
          removed++;
        }
      });
      
      if (this.deletingProjects.size === 0) {
        this.isDeleting = false;
      }
    }
  }

  isProjectBeingRestored(uuid: string): boolean {
    return this.restoringProjects.has(uuid);
  }
  
  isProjectBeingDeleted(uuid: string): boolean {
    return this.deletingProjects.has(uuid);
  }

  loadProjects() {
    this.projectsService.getProjectTrashList();
  }

  selectAllProjects(): void {
    if (this.selectedProjects.length === this.getSelectableProjects().length) {
      this.selectedProjects = [];
    } else {
      this.selectedProjects = this.getSelectableProjects();
    }
  }
  
  getSelectableProjects(): string[] {
    return this.projectsService.projectsInTrash()
      .filter(project => !this.isProjectBeingRestored(project.uuid) && !this.isProjectBeingDeleted(project.uuid))
      .map(project => project.uuid);
  }

  deselectAllProjects(): void {
    this.selectedProjects = [];
  }

  selectProject(uuid: string): void {
    if (this.isProjectBeingRestored(uuid) || this.isProjectBeingDeleted(uuid)) {
      return;
    }
    
    const index = this.selectedProjects.indexOf(uuid);
    if (index === -1) {
      this.selectedProjects.push(uuid);
    } else {
      this.selectedProjects.splice(index, 1);
    }
  }

  openBulkRestoreConfirmation(): void {
    if (this.selectedProjects.length === 0) return;
    
    const validSelectedProjects = this.selectedProjects.filter(uuid => 
      !this.isProjectBeingRestored(uuid) && 
      !this.isProjectBeingDeleted(uuid) && 
      this.projectsService.projectsInTrash().some(p => p.uuid === uuid)
    );
    
    this.selectedProjects = validSelectedProjects;
    
    if (this.selectedProjects.length === 0) return;
    
    this.isConfirmBulkRestoreOpen = true;
  }

  closeBulkRestoreConfirmation(): void {
    this.isConfirmBulkRestoreOpen = false;
  }

  confirmBulkRestore(): void {
    const validSelectedProjects = this.selectedProjects.filter(uuid => 
      !this.isProjectBeingRestored(uuid) && 
      !this.isProjectBeingDeleted(uuid) && 
      this.projectsService.projectsInTrash().some(p => p.uuid === uuid)
    );
    
    this.executeSelectedProjectsRestore(validSelectedProjects);
    this.closeBulkRestoreConfirmation();
  }

  openBulkDeleteConfirmation(): void {
    if (this.selectedProjects.length === 0) return;
    
    const validSelectedProjects = this.selectedProjects.filter(uuid => 
      !this.isProjectBeingRestored(uuid) && 
      !this.isProjectBeingDeleted(uuid) && 
      this.projectsService.projectsInTrash().some(p => p.uuid === uuid)
    );
    
    this.selectedProjects = validSelectedProjects;
    
    if (this.selectedProjects.length === 0) return;
    
    this.isConfirmBulkDeleteOpen = true;
  }

  closeBulkDeleteConfirmation(): void {
    this.isConfirmBulkDeleteOpen = false;
  }

  confirmBulkDelete(): void {
    const validSelectedProjects = this.selectedProjects.filter(uuid => 
      !this.isProjectBeingRestored(uuid) && 
      !this.isProjectBeingDeleted(uuid) && 
      this.projectsService.projectsInTrash().some(p => p.uuid === uuid)
    );
    
    this.executeSelectedProjectsDelete(validSelectedProjects);
    this.closeBulkDeleteConfirmation();
  }

  executeSelectedProjectsRestore(uuids: string[]): void {
    
    if (uuids.length === 0) {
      return;
    }
    
    this.isRestoring = true;
    
    uuids.forEach(uuid => {
      this.restoringProjects.set(uuid, true);
      
      setTimeout(() => {
        if (this.restoringProjects.has(uuid)) {
          this.restoringProjects.delete(uuid);
          
          if (this.restoringProjects.size === 0) {
            this.isRestoring = false;
            
            this.refreshProjects();
          }
        }
      }, 3000);
    });
    
    uuids.forEach(uuid => {
      this.projectsService.restoreProject(uuid);
    });
    
    this.selectedProjects = this.selectedProjects.filter(uuid => !uuids.includes(uuid));
  }

  executeSelectedProjectsDelete(uuids: string[]): void {
    if (uuids.length === 0) return;
    
    this.isDeleting = true;
    
    uuids.forEach(uuid => {
      this.deletingProjects.set(uuid, true);
      
      setTimeout(() => {
        if (this.deletingProjects.has(uuid)) {
          this.deletingProjects.delete(uuid);
          
          if (this.deletingProjects.size === 0) {
            this.isDeleting = false;
          }
        }
      }, 3000);
    });
    
    uuids.forEach(uuid => {
      this.projectsService.permanentDeleteProject(uuid);
    });
    
    this.selectedProjects = this.selectedProjects.filter(uuid => !uuids.includes(uuid));
  }

  refreshProjects(): void {
    this.isLoading = true;
    this.projectsService.getProjectList();
    this.projectsService.getProjectTrashList();
  }

  refreshProjectsInTrash(): void {
    this.isLoading = true;
    this.projectsService.getProjectTrashList();
  }

  openRestoreConfirmation(uuid: string) {
    if (this.isProjectBeingRestored(uuid) || this.isProjectBeingDeleted(uuid)) {
      return;
    }
    
    this.projectToRestoreUuid = uuid;
    this.isConfirmRestoreOpen = true;
  }

  closeRestoreConfirmation() {
    this.isConfirmRestoreOpen = false;
    this.projectToRestoreUuid = null;
  }

  confirmRestore() {
    if (this.projectToRestoreUuid) {
      const uuid = this.projectToRestoreUuid;
      
      this.restoringProjects.set(uuid, true);
      
      if (this.selectedProjects.includes(uuid)) {
        this.selectedProjects = this.selectedProjects.filter(id => id !== uuid);
      }
      
      this.executeProjectRestore(uuid);
      this.closeRestoreConfirmation();
      
      setTimeout(() => {
        if (this.restoringProjects.has(uuid)) {
          this.restoringProjects.delete(uuid);
          
          if (this.restoringProjects.size === 0) {
            this.isRestoring = false;
          }
          
          this.refreshProjects();
        }
      }, 3000);
    }
  }

  executeProjectRestore(uuid: string) {
    this.projectsService.restoreProject(uuid);
  }

  restoreProject(uuid: string) {
    this.openRestoreConfirmation(uuid);
  }

  openDeleteConfirmation(uuid: string) {
    if (this.isProjectBeingRestored(uuid) || this.isProjectBeingDeleted(uuid)) {
      return;
    }
    
    this.projectToDeleteUuid = uuid;
    this.isConfirmDeleteOpen = true;
  }

  closeDeleteConfirmation() {
    this.isConfirmDeleteOpen = false;
    this.projectToDeleteUuid = null;
  }

  confirmDelete() {
    if (this.projectToDeleteUuid) {
      this.deletingProjects.set(this.projectToDeleteUuid, true);
      
      if (this.selectedProjects.includes(this.projectToDeleteUuid)) {
        this.selectedProjects = this.selectedProjects.filter(uuid => uuid !== this.projectToDeleteUuid);
      }
      
      this.executeProjectPermanentDeletion(this.projectToDeleteUuid);
      this.closeDeleteConfirmation();
      
      const uuidToCleanup = this.projectToDeleteUuid;
      setTimeout(() => {
        if (this.deletingProjects.has(uuidToCleanup)) {
          this.deletingProjects.delete(uuidToCleanup);
        }
      }, 3000);
    }
  }

  executeProjectPermanentDeletion(uuid: string) {
    this.projectsService.permanentDeleteProject(uuid);
  }

  deleteProject(uuid: string) {
    this.openDeleteConfirmation(uuid);
  }
} 