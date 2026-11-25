/**
 * Administradores del panel (§5.2 del contrato, solo superadmin) y auditoría (§5.3 `GET audit`). Instantes en ISO-8601 UTC.
 */

import { Option } from '../../sunat/models/sunat.models';

export type AdminRole = 'superadmin' | 'operador' | 'soporte' | 'lectura';

/** Roles de `users.role` (§3 y matriz de §10.2). */
export const ADMIN_ROLE_OPTIONS: Option<AdminRole>[] = [
  { id: 'superadmin', name: 'Superadministrador (todo: también administradores, auditoría, configuración global y eliminar planes)' },
  { id: 'operador', name: 'Operador (todo menos administradores, auditoría, configuración global y eliminar planes)' },
  { id: 'soporte', name: 'Soporte (lee todo menos la auditoría y consulta SUNAT en vivo; no edita)' },
  { id: 'lectura', name: 'Solo lectura (solo datos guardados; sin consultas en vivo a SUNAT)' }
];

/** Valores de `audit_logs.actor_tipo`: `admin` (este panel), `api` (una empresa con su clave) y `sistema` (tareas propias). */
export const ACTOR_TYPE_OPTIONS: Option<string>[] = [
  { id: 'admin', name: 'Administrador del panel' },
  { id: 'api', name: 'Empresa (API)' },
  { id: 'sistema', name: 'Sistema' }
];

// ---------------------------------------------------------------- Administradores
export interface AdminUserResponse {
  id: number;
  name: string;
  email: string;
  role: AdminRole;
  roleName?: string | null;
  isActive: boolean;
  mfaEnabled: boolean;
  lockedUntil?: string | null;
  lastLoginAt?: string | null;
  // Para la tabla
  badgeColor?: string;
  statusText?: string;
  mfaText?: string;
  lastLoginText?: string;
  lockedText?: string;
  locked?: boolean;
}

export interface CreateAdminUserRequest {
  name: string;
  email: string;
  role: AdminRole;
  password: string;
}

export interface UpdateAdminUserRequest {
  name: string;
  email: string;
  role: AdminRole;
}

// ---------------------------------------------------------------- Auditoría
export interface AuditLogResponse {
  id: number;
  createdAt: string;
  actorTipo: string;
  actorEtiqueta?: string | null;
  accion: string;
  tenantId?: number | null;
  descripcion?: string | null;
  ip?: string | null;
  // Para la tabla
  createdAtText?: string;
  actorText?: string;
}
