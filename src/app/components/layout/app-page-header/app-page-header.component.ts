import { Component, Input } from '@angular/core';
import { IconComponent } from '../../ui/icon/icon.component';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [IconComponent, TranslateModule],
  templateUrl: './app-page-header.component.html',
})
export class AppPageHeaderComponent {
  @Input() title: string = '';
  @Input() icon: string = '';
  @Input() iconClass: string = 'w-8 h-8';
}
