import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-generic-loading',
  imports: [CommonModule],
  templateUrl: './generic-loading.component.html',
  styleUrls: ['./generic-loading.component.scss']
})
export class GenericLoadingComponent {
  
  @Input() isVisible: boolean = false;
  @Input() message: string = 'Cargando...';
  @Input() submessage: string = 'Por favor espera un momento';
  @Input() overlay: boolean = true;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Input() variant: 'primary' | 'success' | 'warning' | 'error' = 'primary';
  @Input() spinnerType: 'dots' | 'ring' | 'pulse' = 'dots';
  @Input() showProgress: boolean = false;
  @Input() showSubmessage: boolean = true;

  constructor() { }

   get spinnerClass(): string {
    return `spinner-${this.spinnerType} size-${this.size} variant-${this.variant}`;
  }

  get containerClass(): string {
    return this.overlay ? 'loading-overlay' : 'loading-inline';
  }

  get progressBarClass(): string {
    return `progress-bar variant-${this.variant}`;
  }

  // Array para generar dots del spinner
  get dotsArray(): number[] {
    return Array.from({ length: 12 }, (_, i) => i);
  }

  getDotStyle(index: number): { [key: string]: string } {
    return {
      'top': '0',
      'left': '50%',
      'transform': `translateX(-50%) rotate(${index * 30}deg) translateY(-20px)`,
      'animation-delay': `-${index * 0.1}s`
    };
  }
} 