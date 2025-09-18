import { Component, inject, DestroyRef, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AppPageHeaderComponent } from '../../layout/app-page-header/app-page-header.component';
import { ProjectsService, ProjectList } from '../../../services/projects/projects.service';
import { ConfirmationDialogComponent } from '../../ui/confirmation-dialog/confirmation-dialog.component';
import { Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [CommonModule, RouterModule, AppPageHeaderComponent, ConfirmationDialogComponent, TranslateModule],
  templateUrl: './project-list.component.html'
})
export class ProjectListComponent implements OnInit, OnDestroy {
  public projectsService = inject(ProjectsService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);
  private subscription = new Subscription();

  selectedProjects: string[] = [];

  protected isLoading = true;
  projectToDeleteUuid: string | null = null;
  isConfirmDeleteOpen = false;
  isConfirmBulkDeleteOpen = false;
  isBulkDeleting = false;
  
  private deletingProjects = new Map<string, boolean>();
  
  constructor() {
    this.refreshProjects();

    effect(() => {
      const projects = this.projectsService.projects();
      this.isLoading = false;
      
      this.cleanupProjectMaps(projects);
    });
  }

  ngOnInit() {
    this.subscription.add(
      this.projectsService.errorEvent.subscribe(error => {
        console.log('Error event received:', error);
        
        if (error.action === 'project_delete') {
          if (this.projectToDeleteUuid) {
            this.deletingProjects.delete(this.projectToDeleteUuid);
            this.projectToDeleteUuid = null;
          }
          
          this.isBulkDeleting = false;
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  cleanupProjectMaps(projects: ProjectList[]) {
    const existingUuids = projects.map(p => p.uuid);
    
    if (this.selectedProjects.length > 0) {
      const previousLength = this.selectedProjects.length;
      this.selectedProjects = this.selectedProjects.filter(uuid => existingUuids.includes(uuid));
      
      if (previousLength !== this.selectedProjects.length) {
        console.log(`Removed ${previousLength - this.selectedProjects.length} non-existent projects from selection`);
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
        this.isBulkDeleting = false;
      }
    }
  }

  isProjectBeingDeleted(uuid: string): boolean {
    return this.deletingProjects.has(uuid);
  }

  refreshProjects(): void {
    this.isLoading = true;
    this.projectsService.getProjectList();
    this.projectsService.getProjectTrashList();
  }

  createNewProject(): void {
    this.router.navigate(['/projects/new']);
  }

  openDeleteConfirmation(uuid: string) {
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

      this.executeProjectDeletion(this.projectToDeleteUuid);
      this.closeDeleteConfirmation();
      
      const uuidToCleanup = this.projectToDeleteUuid;
      setTimeout(() => {
        if (this.deletingProjects.has(uuidToCleanup)) {
          console.log(`Timeout cleanup for project ${uuidToCleanup}`);
          this.deletingProjects.delete(uuidToCleanup);
        }
      }, 3000);
    }
  }

  executeProjectDeletion(uuid: string) {
    this.projectsService.deleteProject(uuid);
  }

  deleteProject(uuid: string) {
    if (this.isProjectBeingDeleted(uuid)) {
      return;
    }
    
    this.openDeleteConfirmation(uuid);
  }

  editProject(uuid: string): void {
    console.log(`Editing project ${uuid} - functionality to be implemented`);
  }

  selectProject(uuid: string): void {
    if (this.isProjectBeingDeleted(uuid)) {
      return;
    }
    
    if (this.selectedProjects.includes(uuid)) {
      this.selectedProjects = this.selectedProjects.filter(id => id !== uuid);
    } else {
      this.selectedProjects.push(uuid);
    }
  }

  selectAllProjects(): void {
    if (this.selectedProjects.length === this.getSelectableProjects().length) {
      this.selectedProjects = [];
    } else {
      this.selectedProjects = this.getSelectableProjects();
    }
  }
  
  getSelectableProjects(): string[] {
    return this.projectsService.projects()
      .filter(project => !this.isProjectBeingDeleted(project.uuid))
      .map(project => project.uuid);
  }

  deselectAllProjects(): void {
    this.selectedProjects = [];
  }

  deleteSelectedProjects(): void {
    if (this.selectedProjects.length === 0) return;
    
    const validSelectedProjects = this.selectedProjects.filter(uuid => 
      !this.isProjectBeingDeleted(uuid) && 
      this.projectsService.projects().some(p => p.uuid === uuid)
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
      !this.isProjectBeingDeleted(uuid) && 
      this.projectsService.projects().some(p => p.uuid === uuid)
    );
    
    if (validSelectedProjects.length > 0) {
      this.executeDeleteProjects([...validSelectedProjects]);
    }
    
    this.closeBulkDeleteConfirmation();
  }

  executeDeleteProjects(uuids: string[]): void {
    if (uuids.length === 0) return;
    
    this.isBulkDeleting = true;
    
    uuids.forEach(uuid => {
      this.deletingProjects.set(uuid, true);
    });
    
    uuids.forEach(uuid => 
      this.projectsService.deleteProject(uuid)
    );
    
    this.selectedProjects = [];
    
    setTimeout(() => {
      uuids.forEach(uuid => {
        this.deletingProjects.delete(uuid);
      });
      
      this.isBulkDeleting = false;
    }, 5000);
  }
}
