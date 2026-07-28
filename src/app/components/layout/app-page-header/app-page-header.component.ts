import { Component, Input, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../../ui/icon/icon.component';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule, IconComponent, TranslateModule],
  templateUrl: './app-page-header.component.html',
})
export class AppPageHeaderComponent {
  @Input() title: string = '';
  @Input() icon: string = '';
  @Input() iconClass: string = 'w-8 h-8';
  @Input() titleTemplate: TemplateRef<any> | null = null;
}