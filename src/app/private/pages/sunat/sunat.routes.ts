import { Routes } from '@angular/router';
import { RoleGuard } from '@shared/guards/role.guard.service';
import { PERM } from './models/sunat.models';
import { TenantListComponent } from './components/tenants/tenant-list.component';
import { CertificateListComponent } from './components/certificates/certificate-list.component';
import { UsageListComponent } from './components/usage/usage-list.component';
import { RejectionListComponent } from './components/rejections/rejection-list.component';
import { JobListComponent } from './components/jobs/job-list.component';
import { HealthComponent } from './components/health/health.component';

/** Emisores y Operación: las Urls coinciden con el menú fijo de `GET admin/auth/menu` (§5.1 del contrato). */
export const SUNAT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tenants' },
  { path: 'tenants', canActivate: [RoleGuard], data: { requiredPermission: [PERM.tenantsView] }, component: TenantListComponent },
  // Página de la empresa con las vistas de §9 (carga diferida: es la pantalla más grande del panel).
  {
    path: 'tenants/:id', canActivate: [RoleGuard], data: { requiredPermission: [PERM.tenantsView] },
    loadComponent: () => import('./components/tenant-page/tenant-page.component').then((m) => m.TenantPageComponent)
  },
  // Fase D, entrega 3 (§11.6–§11.7): emitir documentos nuevos de la empresa (carga diferida; la API vuelve a exigir el permiso).
  { path: 'tenants/:id/emitir', pathMatch: 'full', redirectTo: 'tenants/:id/emitir/facturas' },
  {
    path: 'tenants/:id/emitir/:tipo', canActivate: [RoleGuard], data: { requiredPermission: [PERM.documentsIssue] },
    loadComponent: () => import('./components/emission/emission-page.component').then((m) => m.EmissionPageComponent)
  },
  // Fase A (§10.3): vista global de comprobantes, sucursales y series de todas las empresas (carga diferida).
  {
    path: 'documents', canActivate: [RoleGuard], data: { requiredPermission: [PERM.tenantsView] },
    loadComponent: () => import('./components/documents/document-pages.component').then((m) => m.DocumentListComponent)
  },
  {
    path: 'branches', canActivate: [RoleGuard], data: { requiredPermission: [PERM.tenantsView] },
    loadComponent: () => import('./components/catalogs/catalog-lists.component').then((m) => m.BranchListComponent)
  },
  {
    path: 'series', canActivate: [RoleGuard], data: { requiredPermission: [PERM.tenantsView] },
    loadComponent: () => import('./components/catalogs/catalog-lists.component').then((m) => m.SeriesListComponent)
  },
  { path: 'certificates', canActivate: [RoleGuard], data: { requiredPermission: [PERM.certificates] }, component: CertificateListComponent },
  // Feed de envíos (§10.3): mismo permiso que Rechazos.
  {
    path: 'submissions', canActivate: [RoleGuard], data: { requiredPermission: [PERM.rejections] },
    loadComponent: () => import('./components/documents/document-pages.component').then((m) => m.SubmissionListComponent)
  },
  { path: 'usage', canActivate: [RoleGuard], data: { requiredPermission: [PERM.usage] }, component: UsageListComponent },
  { path: 'rejections', canActivate: [RoleGuard], data: { requiredPermission: [PERM.rejections] }, component: RejectionListComponent },
  // Consultas en vivo a SUNAT (§10.5): nunca el rol lectura.
  {
    path: 'cpe-query', canActivate: [RoleGuard], data: { requiredPermission: [PERM.sunatQuery] },
    loadComponent: () => import('./components/cpe-query/cpe-query.component').then((m) => m.CpeQueryComponent)
  },
  { path: 'jobs', canActivate: [RoleGuard], data: { requiredPermission: [PERM.jobsView] }, component: JobListComponent },
  { path: 'health', canActivate: [RoleGuard], data: { requiredPermission: [PERM.health] }, component: HealthComponent }
];
