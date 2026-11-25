import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { PermissionService } from '@shared/service/permission.service';

/**
 * Pantalla con permiso requerido (`data.requiredPermission`, basta uno). Los permisos viven en memoria: si aún no se
 * cargaron (página recién recargada) se esperan; si no alcanzan, se vuelven a pedir una vez (los roles pudieron cambiar).
 */
export const RoleGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Promise<boolean | UrlTree> => {

  const router = inject(Router);
  const permissionService = inject(PermissionService);

  const requiredPermission: string[] = route.data['requiredPermission'] || [];
  if (requiredPermission.length === 0) {
    return true;
  }

  try {
    await permissionService.ensureLoaded();
    if (permissionService.hasAnyPermission(requiredPermission)) {
      return true;
    }
    const reloaded = await permissionService.loadPermissions();
    if (reloaded && permissionService.hasAnyPermission(requiredPermission)) {
      return true;
    }
  } catch (error) {
    console.error('RoleGuard: Failed to load permissions', error);
  }

  return router.parseUrl('/private/home');
};
