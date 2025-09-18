import { Component, Input, Output, EventEmitter, forwardRef, ViewChild, TemplateRef, ViewContainerRef, ElementRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OverlayModule, Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { A11yModule } from '@angular/cdk/a11y';

@Component({
  selector: 'app-multiselect',
  standalone: true,
  imports: [CommonModule, FormsModule, OverlayModule, A11yModule],
  templateUrl: './multiselect.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MultiselectComponent),
      multi: true
    }
  ]
})
export class MultiselectComponent implements ControlValueAccessor {
  @ViewChild('dropdownTemplate') dropdownTemplate!: TemplateRef<any>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  
  @Input() options: Array<{value: any, label: string, disabled?: boolean}> = [];
  @Input() multiple: boolean = false;
  @Input() searchEnabled: boolean = true;
  @Input() placeholder: string = 'Selecciona una opción';
  @Input() hasError: boolean = false;
  @Input() disabled: boolean = false;
  
  @Output() selectionChange = new EventEmitter<any>();
  @Output() searchChange = new EventEmitter<string>();

  isOpen = false;
  searchTerm = '';
  filteredOptions: Array<{value: any, label: string, disabled?: boolean}> = [];
  selectedValues: any[] = [];
  focusedIndex = 0;
  triggerWidth = 0;

  private overlayRef: OverlayRef | null = null;
  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    private overlay: Overlay,
    private viewContainerRef: ViewContainerRef,
    private elementRef: ElementRef
  ) {}

  ngOnInit() {
    this.filteredOptions = [...this.options.filter(opt => !opt.disabled)];
  }

  ngOnChanges() {
    this.filterOptions();
  }

  ngOnDestroy() {
    this.closeDropdown();
  }

  toggle() {
    if (this.disabled) return;
    this.isOpen ? this.closeDropdown() : this.openDropdown();
  }

  openDropdown() {
    if (this.overlayRef) {
      this.overlayRef.dispose();
    }

    // Calculate the width of the trigger
    this.triggerWidth = this.elementRef.nativeElement.querySelector('div').offsetWidth;

    const positionStrategy = this.overlay.position()
      .flexibleConnectedTo(this.elementRef)
      .withPositions([
        {
          originX: 'start',
          originY: 'bottom',
          overlayX: 'start',
          overlayY: 'top',
          offsetY: 4
        },
        {
          originX: 'start',
          originY: 'top',
          overlayX: 'start',
          overlayY: 'bottom',
          offsetY: -4
        }
      ])
      .withPush(false);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      maxHeight: '320px'
    });

    const portal = new TemplatePortal(this.dropdownTemplate, this.viewContainerRef);
    this.overlayRef.attach(portal);
    this.isOpen = true;
    this.focusedIndex = 0;

    if (this.searchEnabled) {
      setTimeout(() => {
        this.searchInput?.nativeElement?.focus();
      });
    }

    this.overlayRef.backdropClick().subscribe(() => {
      this.closeDropdown();
    });
  }

  closeDropdown() {
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
    this.isOpen = false;
    this.searchTerm = '';
    this.filterOptions();
    this.onTouched();
  }

  selectOption(option: {value: any, label: string, disabled?: boolean}) {
    if (option.disabled) return;

    if (this.multiple) {
      const index = this.selectedValues.findIndex(val => val === option.value);
      if (index > -1) {
        this.selectedValues.splice(index, 1);
      } else {
        this.selectedValues.push(option.value);
      }
      this.onChange([...this.selectedValues]);
    } else {
      this.selectedValues = [option.value];
      this.onChange(option.value);
      this.closeDropdown();
    }
    
    this.selectionChange.emit(this.multiple ? [...this.selectedValues] : option.value);
  }

  isSelected(value: any): boolean {
    return this.selectedValues.includes(value);
  }

  onSearch() {
    this.filterOptions();
    this.focusedIndex = 0;
    this.searchChange.emit(this.searchTerm);
  }

  onTriggerKeyDown(event: KeyboardEvent) {
    if (this.disabled) return;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!this.isOpen) {
          this.openDropdown();
        } else {
          this.navigateOptions(event.key === 'ArrowDown' ? 1 : -1);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (this.isOpen && this.filteredOptions[this.focusedIndex]) {
          this.selectOption(this.filteredOptions[this.focusedIndex]);
        } else {
          this.openDropdown();
        }
        break;
      case 'Escape':
        if (this.isOpen) {
          event.preventDefault();
          this.closeDropdown();
        }
        break;
    }
  }

  onSearchKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.navigateOptions(event.key === 'ArrowDown' ? 1 : -1);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.filteredOptions[this.focusedIndex]) {
          this.selectOption(this.filteredOptions[this.focusedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.closeDropdown();
        break;
    }
  }

  removeSelectedOption(value: any, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    
    const index = this.selectedValues.findIndex(val => val === value);
    if (index > -1) {
      this.selectedValues.splice(index, 1);
      this.onChange(this.multiple ? [...this.selectedValues] : null);
      this.selectionChange.emit(this.multiple ? [...this.selectedValues] : null);
    }
  }

  clearAll(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    
    this.selectedValues = [];
    this.onChange(this.multiple ? [] : null);
    this.selectionChange.emit(this.multiple ? [] : null);
  }

  toggleSelectAll() {
    if (this.allFilteredSelected) {
        // Deselect all the filtered options
      this.filteredOptions.forEach(option => {
        const index = this.selectedValues.findIndex(val => val === option.value);
        if (index > -1) {
          this.selectedValues.splice(index, 1);
        }
      });
    } else {
      // Select all the filtered options that are not disabled
      this.filteredOptions.forEach(option => {
        if (!option.disabled && !this.isSelected(option.value)) {
          this.selectedValues.push(option.value);
        }
      });
    }
    
    this.onChange([...this.selectedValues]);
    this.selectionChange.emit([...this.selectedValues]);
  }

  private navigateOptions(direction: number) {
    const newIndex = this.focusedIndex + direction;
    this.focusedIndex = Math.max(0, Math.min(newIndex, this.filteredOptions.length - 1));
  }

  private filterOptions() {
    if (!this.searchTerm) {
      this.filteredOptions = [...this.options.filter(opt => !opt.disabled)];
    } else {
      this.filteredOptions = this.options
        .filter(opt => !opt.disabled && 
                opt.label.toLowerCase().includes(this.searchTerm.toLowerCase()));
    }
  }

  trackByValue(index: number, option: {value: any, label: string, disabled?: boolean} | undefined) {
    return option?.value ?? index;
  }

  get selectedOptions() {
    return this.selectedValues
      .map(value => this.options.find(opt => opt.value === value))
      .filter((option): option is {value: any, label: string, disabled?: boolean} => option !== undefined);
  }

  get allFilteredSelected(): boolean {
    if (this.filteredOptions.length === 0) return false;
    return this.filteredOptions
      .filter(option => !option.disabled)
      .every(option => this.isSelected(option.value));
  }

  get displayText(): string {
    if (this.selectedValues.length === 0) {
      return this.placeholder;
    }
    
    if (this.multiple) {
      return '';
    } else {
      const option = this.options.find(opt => opt.value === this.selectedValues[0]);
      return option ? option.label : '';
    }
  }

  get placeholderText(): string {
    if (this.multiple && this.selectedValues.length > 0) {
      return 'Agregar más opciones...';
    }
    return this.placeholder;
  }

  writeValue(value: any): void {
    if (value !== undefined && value !== null) {
      this.selectedValues = this.multiple ? 
        (Array.isArray(value) ? value : []) : 
        [value];
    } else {
      this.selectedValues = [];
    }
  }

  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}