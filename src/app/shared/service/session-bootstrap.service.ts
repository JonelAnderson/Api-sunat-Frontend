import { Injectable } from '@angular/core';
import { forkJoin, from, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PermissionService } from '@shared/service/permission.service';
import { MenuNavService } from '@shared/service/menu-nav.service';
import { CurrentUserProfileService } from '@shared/service/current-user-profile.service';

/**
 * Carga permisos (`GET admin/auth/permissions`), menú (`GET admin/auth/menu`) y perfil (`GET admin/auth/me`), todo en memoria,
 * después del login o al recargar una pantalla privada.
 */
@Injectable({ providedIn: 'root' })
export class SessionBootstrapService {
  constructor(
    private permissionService: PermissionService,
    private menuService: MenuNavService,
    private profile: CurrentUserProfileService
  ) {}

  bootstrap(): Observable<boolean> {
    // El panel no es multiempresa: no hay contexto de empresa / sucursal que resolver antes.
    return forkJoin({
      permissions: from(this.permissionService.loadPermissions()).pipe(catchError(() => of(false))),
      menu: this.menuService.loadUserNavigation().pipe(catchError(() => of([]))),
      // Nombre y correo para la barra superior (el JWT no lleva datos personales).
      profile: this.profile.load()
    }).pipe(map(() => true));
  }

  hasStoredSession(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return !!localStorage.getItem('token');
  }
}
