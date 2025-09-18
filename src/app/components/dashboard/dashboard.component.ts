import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AppPageHeaderComponent } from '../layout/app-page-header/app-page-header.component';
import { ProjectFormComponent } from '../projects/shared/forms/project-form/project-form.component';
import { UploadFormComponent } from '../media/shared/forms/upload-form/upload-form.component';
import { ProjectsService, ProjectList } from '../../services/projects/projects.service';
import { WebsocketService } from '../../services/websocket.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    AppPageHeaderComponent,
    ProjectFormComponent,
    UploadFormComponent,
    TranslateModule
  ],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit, OnDestroy {
  private projectsService = inject(ProjectsService);

  private subscription = new Subscription();

  latestProjects = this.projectsService.projects;
  creatingProject = false;

  ngOnInit() {
    this.projectsService.getProjectList();
    
    this.subscription.add(
      this.projectsService.newProjectCreated.subscribe((projectUuid) => {
        if (projectUuid) {
          this.creatingProject = false;
        }
      })
    );

    this.subscription.add(
      this.projectsService.errorEvent.subscribe((error) => {
        this.creatingProject = false;
      })
    );
  }
  
  ngOnDestroy() {
    this.creatingProject = false;
    this.subscription.unsubscribe();
  }

  onCreateProject(projectData: { name: string, description: string }): void {
    if (!projectData.name?.trim()) {
      return;
    }

    this.creatingProject = true;
    
    this.projectsService.createProject({
      name: projectData.name.trim(),
      description: projectData.description?.trim() || ''
    });
  }
}
