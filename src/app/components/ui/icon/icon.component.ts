// icon.component.ts
import { Component, Input, OnChanges, SimpleChanges, ElementRef, Renderer2, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconService } from '../../../services/icon-service/icons.service';
import { SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [CommonModule],
  template: `<span [innerHTML]="svgIcon"></span>`,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    :host ::ng-deep svg {
      width: 100%;
      height: 100%;
    }
  `]
})
export class IconComponent implements OnChanges {
  @Input() icon!: string;

  @Input() @HostBinding('class') className = 'w-6 h-6';

  svgIcon: SafeHtml | null = null;

  constructor(
    private iconService: IconService,
    private el: ElementRef,
    private renderer: Renderer2
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['icon']) {
      this.svgIcon = this.iconService.getIcon(this.icon);
    }
  }
}
