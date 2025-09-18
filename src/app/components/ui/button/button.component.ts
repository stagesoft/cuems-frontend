import { Component, Input, Output, EventEmitter, OnInit} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterModule } from '@angular/router';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterModule],
  templateUrl: './button.component.html'
})
export class ButtonComponent implements OnInit {
  @Input() variant: 'primary' | 'secondary' | 'tertiary' | 'muted' = 'primary';
  @Input() size: 'small' | 'normal' | 'large' = 'normal';

  @Input() href?: string;
  @Input() target?: string;
  @Input() rel?: string;

  @Input() routerLink?: string | any[];

  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled: boolean = false;

  renderType: 'button' | 'link' | 'router-link' = 'button';

  @Output() click = new EventEmitter<MouseEvent>();

  ngOnInit() {
    if (this.routerLink !== undefined) {
      this.renderType = 'router-link';
    } else if (this.href !== undefined) {
      this.renderType = 'link';
    } else {
      this.renderType = 'button';
    }

    console.log('Button init:', {
      routerLink: this.routerLink,
      href: this.href,
      renderType: this.renderType
    });
  }

  onClick(event: MouseEvent) {
    if (this.disabled) {
      event.preventDefault();
      return;
    }
    this.click.emit(event);
  }

  getButtonClasses(): string {
    const baseClasses = 'btn';

    let variantClasses = '';
    switch (this.variant) {
      case 'primary':
        variantClasses = 'btn-primary';
        break;
      case 'secondary':
        variantClasses = 'btn-secondary';
        break;
      case 'tertiary':
        variantClasses = 'btn-tertiary';
        break;
      case 'muted':
        variantClasses = 'btn-muted';
        break;
    }

    let sizeClasses = '';
    switch (this.size) {
      case 'small':
        sizeClasses = 'btn-small';
        break;
      case 'normal':
        sizeClasses = 'btn-normal';
        break;
      case 'large':
        sizeClasses = 'btn-large';
        break;
    }

    const stateClasses = this.disabled ? 'opacity-50 cursor-not-allowed' : '';

    return `${baseClasses} ${variantClasses} ${sizeClasses} ${stateClasses}`;
  }
}
