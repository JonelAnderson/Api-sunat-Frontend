// Angular Import
import { CommonModule } from '@angular/common';
import { Component, ViewEncapsulation, effect, inject, input } from '@angular/core';

// project import
import { ThemeService } from '../../../service/customs-theme.service';
import { GradientConfig } from 'src/app/app-config';

@Component({
  selector: 'app-animation-modal',
  imports: [CommonModule],
  templateUrl: './animation-modal.component.html',
  styleUrls: ['./animation-modal.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class AnimationModalComponent {
  private themeService = inject(ThemeService);

  // public props
  modalClass = input<string>();
  contentClass = input<string>();
  modalID = input<string>();
  backDrop = input<boolean>(false);

  themeMode = GradientConfig.layoutType;

  constructor() {
    effect(() => {
      this.isDarkTheme(this.themeService.isDarkTheme());
    });
  }

  // public method
  close(event: string) {
    (document.querySelector('#' + event) as HTMLElement).classList.remove('md-show');
  }

  // private method
  isDarkTheme(isDark: string) {
    this.themeMode = isDark;
  }
}
