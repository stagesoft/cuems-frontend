import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AppPageHeaderComponent } from '../../layout/app-page-header/app-page-header.component';
import { ProjectsService } from '../../../services/projects/projects.service';
import { CreateProjectParams } from '../../../services/projects/handlers/project-create.handler';
import { Subscription } from 'rxjs';
import { ProjectFormComponent } from '../shared/forms/project-form/project-form.component';
import { TranslateModule } from '@ngx-translate/core';
import { IconComponent } from '../../ui/icon/icon.component';

@Component({
  selector: 'app-project-new',
  standalone: true,
  imports: [
    CommonModule, 
    RouterModule,
    AppPageHeaderComponent,
    ProjectFormComponent,
    TranslateModule,
    IconComponent
  ],
  templateUrl: './project-new.component.html'
})
export class ProjectNewComponent implements OnInit, OnDestroy {
  isSubmitting = false;
  
  private projectsService = inject(ProjectsService);
  private subscription = new Subscription();
  
  ngOnInit() {
    this.subscription.add(
      this.projectsService.newProjectCreated.subscribe((projectUuid) => {
        console.log('Project creation response:', projectUuid);
        if (projectUuid) {
          this.isSubmitting = false;
        }
      })
    );
    
    this.subscription.add(
      this.projectsService.errorEvent.subscribe((error) => {
        console.error('Project creation error:', error);
        this.isSubmitting = false;
      })
    );
  }
  
  ngOnDestroy() {
    this.isSubmitting = false;
    this.subscription.unsubscribe();
  }
  
  onFormSubmit(formData: {name: string, description: string}) {
    console.log('Form submitted with data:', formData);
    
    if (!formData.name?.trim()) {
      console.error('Form data incomplete: name is required');
      return;
    }
    
    this.isSubmitting = true;
    
    const projectData: CreateProjectParams = {
      name: formData.name.trim(),
      description: formData.description?.trim() || ''
    };
    
    console.log('Sending project data:', projectData);
    
    this.projectsService.createProject(projectData);
  }
} 