import { Component, Input, Output, EventEmitter, HostListener, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal.component.html',
  styles: [`
    :host {
      display: contents;
    }
  `]
})
export class ModalComponent implements OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Input() size: ModalSize = 'md';
  @Output() close = new EventEmitter<void>();
  private originalOverflow: string = '';

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isOpen']) {
      this.handleBodyScroll(changes['isOpen'].currentValue);
    }
  }

  ngOnDestroy() {
    this.restoreScroll();
  }

  private handleBodyScroll(isOpen: boolean) {
    if (isOpen) {
      // Save the current scroll state
      this.originalOverflow = document.body.style.overflow;

      document.body.style.overflow = 'hidden';
    } else {
      this.restoreScroll();
    }
  }

  private restoreScroll() {
    document.body.style.overflow = this.originalOverflow;
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isOpen) {
      this.closeModal();
    }
  }

  closeModal() {
    this.close.emit();
  }
} 