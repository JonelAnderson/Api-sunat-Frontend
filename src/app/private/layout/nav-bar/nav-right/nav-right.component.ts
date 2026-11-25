// angular import
import { Component, DoCheck, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

// bootstrap import
import { NgbDropdownConfig } from '@ng-bootstrap/ng-bootstrap';

// third party
import { TranslateService } from '@ngx-translate/core';
import screenfull from 'screenfull';

// project import
import { SharedModule } from '@shared/shared.module';
import { GradientAppConfig } from 'src/app/app-gradient-config';
import { AuthService } from 'src/app/public/pages/login/services/auth.service';
import { ADMIN_ROLE_NAMES, CurrentUserProfileService } from '@shared/service/current-user-profile.service';

/** Lado derecho de la barra superior: pantalla completa y menú del usuario (Mi cuenta, Cerrar sesión). */
@Component({
  selector: 'app-nav-right',
  imports: [SharedModule],
  templateUrl: './nav-right.component.html',
  styleUrls: ['./nav-right.component.scss'],
  providers: [NgbDropdownConfig]
})
export class NavRightComponent implements DoCheck, OnInit, OnDestroy {
  authenticationService = inject(AuthService);
  private translate = inject(TranslateService);
  private router = inject(Router);
  private profile = inject(CurrentUserProfileService);

  gradientConfig = GradientAppConfig;
  screenFull = true;

  // Nombre y rol de GET admin/auth/me (en memoria; el JWT no lleva datos personales).
  readonly userName = computed(() => this.profile.profile()?.fullName || this.profile.profile()?.email || 'Administrador');
  readonly roleName = computed(() => ADMIN_ROLE_NAMES[this.profile.profile()?.role ?? ''] ?? '');
  readonly userImage = computed(() => this.profile.profile()?.profilePictureUrl || 'assets/images/user/user-icon.png');

  private readonly onFullscreenChange = () => (this.screenFull = screenfull.isFullscreen);

  ngOnInit() {
    setTimeout(() => this.translate.use(GradientAppConfig.i18n), 0);
    if (screenfull.isEnabled) {
      this.screenFull = screenfull.isFullscreen;
      screenfull.on('change', this.onFullscreenChange);
    }
  }

  ngDoCheck() {
    this.gradientConfig.isRtlLayout = !!document.querySelector('body')?.classList.contains('elite-rtl');
  }

  ngOnDestroy() {
    if (screenfull.isEnabled) {
      screenfull.off('change', this.onFullscreenChange);
    }
  }

  logout() {
    this.authenticationService.logout();
  }

  /** Mi cuenta: contraseña, verificación en dos pasos y códigos de recuperación. */
  openAccount() {
    void this.router.navigate(['/private/account']);
  }

  toggleFullscreen() {
    if (screenfull.isEnabled) {
      screenfull.toggle().then(() => (this.screenFull = screenfull.isFullscreen));
    }
  }
}
