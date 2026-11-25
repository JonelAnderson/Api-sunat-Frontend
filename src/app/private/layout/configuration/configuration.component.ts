// Angular Import
import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { Location, LocationStrategy } from '@angular/common';
import { SharedModule } from '@shared/shared.module';
import { GradientAppConfig } from 'src/app/app-gradient-config';
import { ThemeService } from '@shared/service/customs-theme.service';

// project import


@Component({
  selector: 'app-configuration',
  imports: [SharedModule],
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class ConfigurationComponent implements OnInit {
  private location = inject(Location);
  private locationStrategy = inject(LocationStrategy);
  theme = inject(ThemeService);

  // public props
  styleSelectorToggle!: boolean; // open configuration menu
  layoutType!: string; // layout type
  rtlLayout!: boolean; // rtl type
  menuFixedLayout!: boolean; // menu/navbar fixed flag
  headerFixedLayout!: boolean; // header fixed flag
  boxLayout!: boolean; // box layout flag
  headerBackgroundColor!: string; // header background color
  headerBackColor!: string;
  gradientConfig;
  isConfig!: boolean;

  scroll = (): void => {
    if (this.headerFixedLayout === false) {
      (document.querySelector('#nav-ps-gradient-able') as HTMLElement).style.maxHeight = 'calc(100vh)';
      const el = document.querySelector('.pcoded-navbar.menupos-fixed') as HTMLElement;
      const scrollPosition = window.pageYOffset;
      if (scrollPosition > 56) {
        el.style.position = 'fixed';
        el.style.transition = 'none';
        el.style.marginTop = '0';
      } else {
        el.style.position = 'absolute';
        el.style.marginTop = '56px';
      }
    } else if (document.querySelector('.pcoded-navbar')?.hasAttribute('style')) {
      document.querySelector('.pcoded-navbar.menupos-fixed')?.removeAttribute('style');
    }
  };

  // constructor
  constructor() {
    this.gradientConfig = GradientAppConfig;
    this.setThemeLayout();
  }

  // life cycle event
  ngOnInit() {
    this.styleSelectorToggle = false;
    this.layoutType = GradientAppConfig.layoutType;
    this.setLayout(this.layoutType);
    this.headerBackgroundColor = GradientAppConfig.header_back_color;
    this.setHeaderBackground(this.headerBackgroundColor);
    this.rtlLayout = GradientAppConfig.isRtlLayout;
    this.changeRtlLayout(this.rtlLayout);
    this.menuFixedLayout = GradientAppConfig.nav_fixed_layout;
    if (GradientAppConfig.layout === 'vertical') {
      this.changeMenuFixedLayout(this.menuFixedLayout);
    }
    this.headerFixedLayout = GradientAppConfig.header_fixed_layout;
    this.changeHeaderFixedLayout(this.headerFixedLayout);
    this.boxLayout = GradientAppConfig.isBoxLayout;
    this.changeBoxLayout(this.boxLayout);
  }

  // public method
  setThemeLayout() {
    let current_url = this.location.path();
    const baseHref = this.locationStrategy.getBaseHref();
    if (baseHref) {
      current_url = baseHref + this.location.path();
    }

    switch (current_url) {
      case baseHref + '/layout/static':
        GradientAppConfig.layout = 'vertical';
        GradientAppConfig.nav_fixed_layout = false;
        GradientAppConfig.header_fixed_layout = false;
        break;
      case baseHref + '/layout/fixed':
        GradientAppConfig.layout = 'vertical';
        GradientAppConfig.nav_fixed_layout = true;
        GradientAppConfig.header_fixed_layout = true;
        break;
      case baseHref + '/layout/nav-fixed':
        GradientAppConfig.layout = 'vertical';
        GradientAppConfig.nav_fixed_layout = true;
        GradientAppConfig.header_fixed_layout = false;
        break;
      case baseHref + '/layout/collapse-menu':
        GradientAppConfig.layout = 'vertical';
        GradientAppConfig.isCollapse_menu = true;
        break;
      case baseHref + '/layout/vertical-rtl':
        GradientAppConfig.layout = 'vertical';
        GradientAppConfig.isRtlLayout = true;
        break;
      case baseHref + '/layout/horizontal':
        GradientAppConfig.layout = 'horizontal';
        GradientAppConfig.nav_fixed_layout = false;
        GradientAppConfig.header_fixed_layout = false;
        break;
      case baseHref + '/layout/horizontal-l2':
        GradientAppConfig.layout = 'horizontal';
        GradientAppConfig.subLayout = 'horizontal-2';
        GradientAppConfig.nav_fixed_layout = false;
        GradientAppConfig.header_fixed_layout = false;
        break;
      case baseHref + '/layout/box':
        GradientAppConfig.layout = 'vertical';
        GradientAppConfig.isBoxLayout = true;
        GradientAppConfig.header_fixed_layout = false;
        GradientAppConfig.isCollapse_menu = true;
        break;
      case baseHref + '/layout/light':
        GradientAppConfig.layout = 'vertical';
        GradientAppConfig.layoutType = 'menu-light';
        GradientAppConfig.header_back_color = 'header-blue';
        break;
      case baseHref + '/layout/dark':
        GradientAppConfig.layout = 'vertical';
        GradientAppConfig.layoutType = 'dark';
        GradientAppConfig.header_back_color = 'header-dark';
        break;
      case baseHref + '/layout/nav-color':
        GradientAppConfig.layout = 'vertical';
        GradientAppConfig.layoutType = 'menu-light';
        GradientAppConfig.header_back_color = 'header-info';
        GradientAppConfig.nav_fixed_layout = true;
        GradientAppConfig.header_fixed_layout = true;
        break;
      default:
        break;
    }
  }

  setHeaderBackColor(color: string) {
    this.headerBackColor = color;
    (document.querySelector('body') as HTMLElement).style.background = color;
  }

  // change main layout
  setLayout(layout: string) {
    this.isConfig = true;
    document.querySelector('.pcoded-navbar')?.classList.remove('menu-light');
    document.querySelector('.pcoded-navbar')?.classList.remove('menu-dark');
    document.querySelector('.pcoded-navbar')?.classList.remove('navbar-dark');
    document.querySelector('.pcoded-navbar')?.classList.remove('brand-dark');
    document.querySelector('body')?.classList.remove('gradient-dark');
    document.querySelector('html')?.classList.remove('dark');
    this.setHeaderBackground('header-blue');

    this.layoutType = layout;
    if (layout === 'menu-light') {
      document.querySelector('.pcoded-navbar')?.classList.add(layout);
    }
    if (layout === 'dark') {
      document.querySelector('.pcoded-navbar')?.classList.add('navbar-dark');
      document.querySelector('.pcoded-navbar')?.classList.add('brand-dark');
      this.setHeaderBackground('header-dark');
      document.querySelector('body')?.classList.add('gradient-dark');
      document.querySelector('html')?.classList.add('dark');
    }
    if (layout === 'reset') {
      this.reset();
    }
    this.theme.isDarkTheme.set(layout);
  }

  reset() {
    document.querySelector('.pcoded-navbar')?.classList.remove('icon-colored');
    this.styleSelectorToggle = true;
    this.ngOnInit(); // life cycle event
  }

  setRtlLayout(e: Event) {
    const flag = (e.target as HTMLInputElement).checked;
    this.changeRtlLayout(flag);
  }

  changeRtlLayout(flag: boolean) {
    if (flag) {
      document.querySelector('body')?.classList.add('gradient-rtl');
      document.querySelector('body')?.classList.remove('gradient-ltr');
    } else {
      document.querySelector('body')?.classList.remove('gradient-rtl');
      document.querySelector('body')?.classList.add('gradient-ltr');
    }
    this.theme.isRtlTheme.set(flag);
  }

  setMenuFixedLayout(e: Event) {
    const flag = (e.target as HTMLInputElement).checked;
    this.changeMenuFixedLayout(flag);
  }

  changeMenuFixedLayout(flag: boolean) {
    setTimeout(() => {
      if (flag) {
        document.querySelector('.pcoded-navbar')?.classList.remove('menupos-static');
        document.querySelector('.pcoded-navbar')?.classList.add('menupos-fixed');
        if (GradientAppConfig.layout === 'vertical') {
          (document.querySelector('#nav-ps-gradient-able') as HTMLElement).style.height = 'calc(100vh - 56px)'; // calc(100vh - 70px)
        }
        window.addEventListener('scroll', this.scroll, true);
        window.scrollTo(0, 0);
      } else {
        document.querySelector('.pcoded-navbar')?.classList.add('menupos-static');
        document.querySelector('.pcoded-navbar')?.classList.remove('menupos-fixed');
        if (GradientAppConfig.layout === 'vertical') {
          (document.querySelector('#nav-ps-gradient-able') as HTMLElement).style.height = '100%'; // calc(100% - 70px)
          console.log('demo');
        }
        if (GradientAppConfig.layout === 'vertical') {
          window.removeEventListener('scroll', this.scroll, true);
        }
      }
    }, 100);
  }

  setHeaderFixedLayout(e: Event) {
    const flag = (e.target as HTMLInputElement).checked;
    this.changeHeaderFixedLayout(flag);
  }

  changeHeaderFixedLayout(flag: boolean) {
    if (flag) {
      document.querySelector('.pcoded-header')?.classList.add('headerPos-fixed');
    } else {
      document.querySelector('.pcoded-header')?.classList.remove('headerPos-fixed');
      // static
      if (GradientAppConfig.layout === 'vertical' && this.menuFixedLayout) {
        window.addEventListener('scroll', this.scroll, true);
        window.scrollTo(0, 0);
      } else {
        window.removeEventListener('scroll', this.scroll, true);
      }
    }
  }

  setBoxLayout(e: Event) {
    const flag = (e.target as HTMLInputElement).checked;
    this.changeBoxLayout(flag);
  }

  changeBoxLayout(flag: boolean) {
    if (flag) {
      document.querySelector('body')?.classList.add('container');
      document.querySelector('body')?.classList.add('box-layout');
    } else {
      document.querySelector('body')?.classList.remove('box-layout');
      document.querySelector('body')?.classList.remove('container');
    }
    this.theme.isBoxTheme.set(flag);
  }

  setHeaderBackground(background: string) {
    this.headerBackgroundColor = background;
    GradientAppConfig.header_back_color = background;
    document.querySelector('.pcoded-header')?.classList.remove('header-blue');
    document.querySelector('.pcoded-header')?.classList.remove('header-red');
    document.querySelector('.pcoded-header')?.classList.remove('header-purple');
    document.querySelector('.pcoded-header')?.classList.remove('header-info');
    document.querySelector('.pcoded-header')?.classList.remove('header-dark');
    document.querySelector('.pcoded-header')?.classList.remove('header-orange');
    document.querySelector('.pcoded-header')?.classList.remove('header-green');
    document.querySelector('.pcoded-header')?.classList.remove('header-yellow');
    document.querySelector('.pcoded-header')?.classList.remove('header-orchidGreen');
    document.querySelector('.pcoded-header')?.classList.remove('header-indigoGreen');
    document.querySelector('.pcoded-header')?.classList.remove('header-darkGreen');
    document.querySelector('.pcoded-header')?.classList.remove('header-darkblue');

    if (background !== 'header-default') {
      document.querySelector('.pcoded-header')?.classList.add(background);
    }
  }
}
