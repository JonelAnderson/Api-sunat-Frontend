import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { NotFoundComponent } from '@shared/components/reusables/not-found/not-found.component';
import { PrivateLayoutComponent } from './layout/private-layout.component';
import { Home } from './pages/home/components/home/home';
import { Support } from './pages/support/components/support/support';
import { AccountComponent } from './pages/account/account.component';

/**
 * Zona privada del panel. Las Urls coinciden con el menú fijo de `GET admin/auth/menu` (§5.1 del contrato); cada pantalla
 * de datos lleva `RoleGuard` con su permiso (en `sunat.routes.ts`, `platform.routes.ts` y `admin.routes.ts`). Inicio, Mi cuenta y Ayuda no piden
 * permiso: el tablero se muestra solo con `Admin.Dashboard.View` (RoleGuard redirige a Inicio, así que Inicio no puede exigirlo).
 */
const routes: Routes = [
  {
    path: '',
    component: PrivateLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      { path: 'home', component: Home },
      { path: 'account', component: AccountComponent },
      { path: 'help', component: Support },
      { path: 'sunat', loadChildren: () => import('./pages/sunat/sunat.routes').then((m) => m.SUNAT_ROUTES) },
      { path: 'platform', loadChildren: () => import('./pages/platform/platform.routes').then((m) => m.PLATFORM_ROUTES) },
      { path: 'admin', loadChildren: () => import('./pages/admin/admin.routes').then((m) => m.ADMIN_ROUTES) },
      { path: '**', component: NotFoundComponent }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PrivateRoutingModule { }
