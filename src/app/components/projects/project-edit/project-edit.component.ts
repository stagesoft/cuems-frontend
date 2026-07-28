import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { AppPageHeaderComponent } from '../../layout/app-page-header/app-page-header.component';
import { ProjectsService } from '../../../services/projects/projects.service';
import { ProjectEditStateService } from '../../../services/projects/project-edit-state.service';
import { IconComponent } from '../../ui/icon/icon.component';
import { DrawerService } from '../../../services/ui/drawer.service';
import { v4 as uuidv4 } from 'uuid';
import { ProjectWorkspaceService } from '../../../services/project-workspace.service';

@Component({
  selector: 'app-project-edit',
  standalone: true,
  imports: [CommonModule, RouterModule, AppPageHeaderComponent, TranslateModule, IconComponent],
  templateUrl: './project-edit.component.html'
})
export class ProjectEditComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private projectsService = inject(ProjectsService);
  private editStateService = inject(ProjectEditStateService);
  private drawerService = inject(DrawerService);
  private workspace = inject(ProjectWorkspaceService);
  
  public project: any;
  public projectUuid: string | null = null;
  public hasUnsavedChanges: boolean = false;
  private changesSubscription?: Subscription;
  private projectLoadedSubscription?: Subscription;
  private projectSavedSubscription?: Subscription;

  isEditingTitle = signal(false);
  tempName = signal('');
  tempDescription = signal('');

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.projectUuid = params['uuid'];
      
      if (this.projectUuid) {
        if (this.projectsService.projects().length === 0) {
          this.projectsService.getProjectList();
        }
        
        this.projectsService.loadProject(this.projectUuid);
        this.workspace.openInEdit(this.projectUuid, this.projectUuid); // register immediately, name updated later
      }
    });

    this.projectLoadedSubscription = this.projectsService.projectLoaded.subscribe(projectData => {
      if (projectData) {
        const basicProjectData = this.projectsService.projects().find(p => p.uuid === this.projectUuid);
        if (basicProjectData) {
          if (!projectData.uuid) projectData.uuid = basicProjectData.uuid;
          if (!projectData.name) projectData.name = basicProjectData.name;
          if (!projectData.unix_name) projectData.unix_name = basicProjectData.unix_name;
          if (!projectData.created) projectData.created = basicProjectData.created;
          if (!projectData.modified) projectData.modified = basicProjectData.modified;
        } else {
          if (!projectData.uuid && this.projectUuid) {
            projectData.uuid = this.projectUuid;
          }
        }

        if (!projectData.description && projectData.CuemsScript?.description) {
          projectData.description = projectData.CuemsScript.description;
        }        
        
        this.project = projectData;

        // Workaround: server returns stale CuemsScript.id and CuemsScript.name on duplicated projects.
        // Patch both fields with root metadata to prevent save conflicts.
        if (this.projectUuid && this.project.CuemsScript) {
          this.project.CuemsScript.id = this.projectUuid;
          if (this.project.name) {
            this.project.CuemsScript.name = this.project.name;
          }
        }       

        if (this.projectUuid && this.project.name) {
          this.workspace.updateName(this.projectUuid, this.project.name);
        }
      }
    });

    this.changesSubscription = this.editStateService.changes$.subscribe(() => {
      if (this.projectUuid) {
        this.hasUnsavedChanges = this.editStateService.hasProjectChanges(this.projectUuid);
        this.hasUnsavedChanges
          ? this.workspace.markDirty(this.projectUuid)
          : this.workspace.markSaved(this.projectUuid);
      }
    });

    this.projectSavedSubscription = this.projectsService.projectSaved.subscribe(
      savedProjectUuid => {
        if (this.projectUuid && savedProjectUuid === this.projectUuid) {
          this.editStateService.markProjectAsSaved(this.projectUuid);
          
          this.projectsService.loadProject(this.projectUuid);
        }
      }
    );
  }

  ngOnDestroy(): void {
    this.changesSubscription?.unsubscribe();
    this.projectLoadedSubscription?.unsubscribe();
    this.projectSavedSubscription?.unsubscribe();
    
    if (this.projectUuid) {
      this.editStateService.clearTemporaryCues(this.projectUuid);
    }
  }

  /**
   * Save all changes of the project
   * This method coordinates the saving from all child components
   */
  async saveAllChanges(): Promise<void> {
    if (!this.projectUuid) {
      console.error('Cannot save: missing projectUuid');
      return;
    }

    if (!this.project) {
      console.error('Cannot save: project data not loaded yet. Attempting to reload...');
      this.projectsService.loadProject(this.projectUuid);
      return;
    }

    try {
      const updatedProject = JSON.parse(JSON.stringify(this.project));
      const modifiedData = this.editStateService.getProjectModifiedData(this.projectUuid);
      if (!modifiedData || Object.keys(modifiedData).length === 0) {
        return;
      }
    
      if (modifiedData.sequence) {
        if (!updatedProject.CuemsScript) {
          updatedProject.CuemsScript = {};
        }
        if (!updatedProject.CuemsScript.CueList) {
          const template = this.projectsService.projectTemplate();
          if (template?.['CuemsScript']?.['CueList']) {
            updatedProject.CuemsScript.CueList = JSON.parse(JSON.stringify(template['CuemsScript']['CueList']));
            updatedProject.CuemsScript.CueList.id = this.generateUUID();
            updatedProject.CuemsScript.CueList.contents = [];
          } else {
            updatedProject.CuemsScript.CueList = {
              autoload: false,
              description: null,
              enabled: true,
              id: this.generateUUID(),
              loop: 0,
              name: "empty",
              offset: { CTimecode: "00:00:00.000" },
              post_go: "pause",
              postwait: { CTimecode: "00:00:00.000" },
              prewait: { CTimecode: "00:00:00.000" },
              target: null,
              timecode: false,
              ui_properties: null,
              contents: []
            };
          }
        }
    
        if (modifiedData.sequence.contents === null) {
          updatedProject.CuemsScript.CueList.contents = null;
        } else if (Array.isArray(modifiedData.sequence.contents) && modifiedData.sequence.contents.length === 0) {
          updatedProject.CuemsScript.CueList.contents = null;
        } else {
          updatedProject.CuemsScript.CueList.contents = modifiedData.sequence.contents;
        }
      }
    
      if (modifiedData.metadata) {
        if (modifiedData.metadata.name !== undefined) {
          updatedProject.name = modifiedData.metadata.name;
          if (updatedProject.CuemsScript) {
            updatedProject.CuemsScript.name = modifiedData.metadata.name;
          }
        }
        if (modifiedData.metadata.description !== undefined) {
          updatedProject.description = modifiedData.metadata.description;
          if (updatedProject.CuemsScript) {
            updatedProject.CuemsScript.description = modifiedData.metadata.description;
          }
        }
      }
    
      if (!updatedProject.uuid && this.projectUuid) {
        updatedProject.uuid = this.projectUuid;
      }
    
      this.projectsService.updateProject(updatedProject);
    } catch (error) {
      console.error('Error saving complete project:', error);
    }
  }

  toggleActivityDrawer(): void {
    this.drawerService.toggleActivityDrawer();
  }

  private generateUUID(): string {
    return uuidv4();
  }

  closeWorkspaceProject(): void {
    if (this.projectUuid) {
      this.workspace.requestClose(this.projectUuid);
    }
  }
  
  startEditTitle(): void {
    this.tempName.set(this.project?.name ?? '');
    this.tempDescription.set(
      this.project?.description ?? this.project?.CuemsScript?.description ?? ''
    );
    this.isEditingTitle.set(true);
  }

  cancelEditTitle(): void {
    this.isEditingTitle.set(false);
  }

  applyEditTitle(): void {
    if (!this.projectUuid || !this.project) return;

    const newName = this.tempName().trim();
    const newDescription = this.tempDescription();

    const nameChanged = newName !== (this.project.name ?? '');
    const descriptionChanged = newDescription !== (this.project.description ?? '');

    if (nameChanged || descriptionChanged) {
      this.editStateService.markComponentAsChanged('metadata', this.projectUuid, {
        name: newName,
        description: newDescription
      });

      this.project = { ...this.project, name: newName, description: newDescription };

      if (nameChanged) {
        this.workspace.updateName(this.projectUuid, newName);
      }
    }

    this.isEditingTitle.set(false);
  }  
} 