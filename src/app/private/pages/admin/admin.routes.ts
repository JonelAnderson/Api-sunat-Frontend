import { Routes } from '@angular/router';
import { RoleGuard } from '@shared/guards/role.guard.service';
import { PERM } from '../sunat/models/sunat.models';
import { AdminUserListComponent } from './users/admin-user-list.component';
import { AuditListComponent } from './audit/audit-list.component';

/** Administración del panel (solo superadmin): Administradores y Auditoría. */
export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'users' },
  { path: 'users', canActivate: [RoleGuard], data: { requiredPermission: [PERM.users] }, component: AdminUserListComponent },
  { path: 'audit', canActivate: [RoleGuard], data: { requiredPermission: [PERM.audit] }, component: AuditListComponent }
];
