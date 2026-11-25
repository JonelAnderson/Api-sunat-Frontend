import { Routes } from '@angular/router';
import { RoleGuard } from '@shared/guards/role.guard.service';
import { PERM } from '../sunat/models/sunat.models';

/** Plataforma (§5.1 y §10.4 / §10.6 del contrato): Planes y Configuración de emisión. Las escrituras se ocultan sin su permiso. */
export const PLATFORM_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'plans' },
  {
    path: 'plans', canActivate: [RoleGuard], data: { requiredPermission: [PERM.plansView] },
    loadComponent: () => import('./plans/plan-list.component').then((m) => m.PlanListComponent)
  },
  {
    path: 'settings', canActivate: [RoleGuard], data: { requiredPermission: [PERM.settingsView] },
    loadComponent: () => import('./settings/platform-settings.component').then((m) => m.PlatformSettingsComponent)
  }
];
