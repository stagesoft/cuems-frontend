import { Directive, ElementRef, HostListener, Input } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: '[appTimecodeMask]',
  standalone: true
})
export class TimecodeMaskDirective {
  private previousValue: string = '';

  constructor(
    private el: ElementRef<HTMLInputElement>,
    private control: NgControl
  ) {}

  @HostListener('input', ['$event'])
  onInput(event: any): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const cursorPosition = input.selectionStart || 0;

    const digitsOnly = value.replace(/\D/g, '');
    
    // Limit to maximum 9 digits (HH MM SS mmm)
    const limitedDigits = digitsOnly.slice(0, 9);
    
    // Format with the mask
    const formatted = this.formatTimecode(limitedDigits);
    
    // Validate time limits (maximum 23:59:59.999)
    const validatedFormatted = this.validateTimecode(formatted);
    
    // Calculate new cursor position
    const newCursorPosition = this.calculateCursorPosition(
      this.previousValue,
      validatedFormatted,
      cursorPosition
    );

    // Update the value
    input.value = validatedFormatted;
    this.previousValue = validatedFormatted;

    // Update the Forms control
    if (this.control && this.control.control) {
      this.control.control.setValue(validatedFormatted, { emitEvent: false });
    }

    // Restore cursor position
    setTimeout(() => {
      input.setSelectionRange(newCursorPosition, newCursorPosition);
    }, 0);
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;
    
    // Key support
    const allowedKeys = [
      'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'Home', 'End'
    ];

    if (allowedKeys.includes(event.key)) {
      return;
    }

    // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
    if (event.ctrlKey && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) {
      return;
    }

    // Only allow digits
    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    
    const pastedText = event.clipboardData?.getData('text') || '';
    const digitsOnly = pastedText.replace(/\D/g, '');
    const limitedDigits = digitsOnly.slice(0, 9);
    const formatted = this.formatTimecode(limitedDigits);
    const validatedFormatted = this.validateTimecode(formatted);
    
    const input = event.target as HTMLInputElement;
    input.value = validatedFormatted;
    this.previousValue = validatedFormatted;

    // Update the Forms control
    if (this.control && this.control.control) {
      this.control.control.setValue(validatedFormatted, { emitEvent: false });
    }
  }

  private formatTimecode(digits: string): string {
    // Pad with zeros if necessary
    const paddedDigits = digits.padEnd(9, '0');
    
    const hours = paddedDigits.slice(0, 2);
    const minutes = paddedDigits.slice(2, 4);
    const seconds = paddedDigits.slice(4, 6);
    const milliseconds = paddedDigits.slice(6, 9);
    
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  private validateTimecode(timecode: string): string {
    // Extract parts of the timecode
    const parts = timecode.split(/[:.]/);
    if (parts.length !== 4) return timecode;

    let hours = parseInt(parts[0], 10);
    let minutes = parseInt(parts[1], 10);
    let seconds = parseInt(parts[2], 10);
    let milliseconds = parseInt(parts[3], 10);

    // Validate and correct limits
    if (hours > 23) hours = 23;
    if (minutes > 59) minutes = 59;
    if (seconds > 59) seconds = 59;
    if (milliseconds > 999) milliseconds = 999;

    // Format back with zeros to the left
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  private calculateCursorPosition(
    previousValue: string,
    newValue: string,
    currentPosition: number
  ): number {
    // If there is no previous value, position at the end of the significant digits
    if (!previousValue) {
      const digitsOnly = newValue.replace(/\D/g, '');
      const significantDigits = digitsOnly.replace(/0+$/, '') || '0';
      return this.getPositionAfterDigits(significantDigits.length);
    }

    // Calculate how many digits are before the current position
    const digitsBeforeCursor = previousValue.slice(0, currentPosition).replace(/\D/g, '').length;
    
    // Find the corresponding position in the new value
    return this.getPositionAfterDigits(digitsBeforeCursor);
  }

  private getPositionAfterDigits(digitCount: number): number {
    // Mapping of digit count to position in the format HH:MM:SS.mmm
    const positionMap = [
      0,  // 0 digits -> position 0
      1,  // 1 digit -> position 1
      2,  // 2 digits -> position 2 (after HH)
      4,  // 3 digits -> position 4 (after HH:M)
      5,  // 4 digits -> position 5 (after HH:MM)
      7,  // 5 digits -> position 7 (after HH:MM:S)
      8,  // 6 digits -> position 8 (after HH:MM:SS)
      10, // 7 digits -> position 10 (after HH:MM:SS.m)
      11, // 8 digits -> position 11 (after HH:MM:SS.mm)
      12  // 9 digits -> position 12 (final)
    ];

    return positionMap[Math.min(digitCount, 9)] || 12;
  }
} 