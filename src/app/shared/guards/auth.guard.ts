import { inject } from "@angular/core";
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from "@angular/router";
import { PermissionService } from "@shared/service/permission.service";

/**
 * Zona privada: exige sesión y, antes de abrir cualquier pantalla, espera los permisos (viven en memoria; tras recargar la
 * página se piden a la API). Así ninguna pantalla se arma creyendo que el usuario no tiene permisos.
 */
export const AuthGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
): Promise<boolean | UrlTree> => {
  const router = inject(Router);
  const permissions = inject(PermissionService);

  if (typeof window !== 'undefined') {
    const storedToken = await getStoredToken();
    if (!storedToken) {
      return router.createUrlTree(['public']);
    }
    try {
      await permissions.ensureLoaded();
    } catch {
      // Sin red o sesión vencida: el interceptor se encarga (renueva o cierra la sesión); la pantalla se abre igual.
    }
    return true;
  }

  return false;
};

async function getStoredToken(): Promise<string | null> {
  return new Promise(resolve => {
    setTimeout(() => {
      const token = localStorage.getItem("token");
      resolve(token);
    }, 0);
  });
}
