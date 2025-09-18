import { Component, EventEmitter, Output, Input, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  templateUrl: './project-form.component.html',
  styleUrls: ['./project-form.component.css']
})
export class ProjectFormComponent implements OnChanges, OnDestroy {
  @Output() formSubmit = new EventEmitter<{name: string, description: string}>();
  @Input() isSubmitting = false;

  projectForm!: FormGroup;
  formSubmitted = false;

  constructor(private fb: FormBuilder) {
    this.projectForm = this.fb.group({
      name: ['', [Validators.required]],
      description: ['']
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.projectForm && changes['isSubmitting']) {
      const isSubmitting = changes['isSubmitting'].currentValue;
      
      if (isSubmitting) {
        this.projectForm.disable();
      } else {
        this.projectForm.enable();
        if (this.formSubmitted) {
          this.formSubmitted = false;
        }
      }
    }
  }

  ngOnDestroy() {
    this.formSubmitted = false;
    this.projectForm.reset();
  }

  get f() {
    return this.projectForm.controls;
  }

  onSubmit(): void {
    this.formSubmitted = true;

    if (this.projectForm.valid) {
      const formValues = {
        name: this.projectForm.get('name')?.value?.trim() || '',
        description: this.projectForm.get('description')?.value?.trim() || ''
      };
      
      this.formSubmit.emit(formValues);
    } else {
      this.formSubmitted = false;
    }
  }
}
