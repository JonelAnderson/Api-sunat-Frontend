import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment as env } from '@envs/environment';
import { endpoint } from '@shared/apis/endpoint';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { listUrl, rows } from '@shared/functions/list-helpers';
import { isFutureInstant, isoToLima } from '@shared/functions/lima-dates';
import { ADMIN_ROLE_NAMES } from '@shared/service/current-user-profile.service';
import { ACTOR_TYPE_OPTIONS, AdminUserResponse, AuditLogResponse, CreateAdminUserRequest, UpdateAdminUserRequest } from '../models/admin.models';

/** Administradores del panel (`/api/admin/users`, solo superadmin). */
@Injectable({ providedIn: 'root' })
export class AdminUserService {
  private http = inject(HttpClient);

  private url(id?: number, suffix = ''): string {
    return `${env.apiUrl}${endpoint.ADMIN_USERS}${id != null ? `/${id}` : ''}${suffix}`;
  }

  GetAll(size: number, page: number, getInputs: string): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(listUrl(endpoint.ADMIN_USERS, size, page, getInputs)).pipe(
      map((resp) => {
        rows<AdminUserResponse>(resp).forEach((u) => {
          u.locked = isFutureInstant(u.lockedUntil);
          u.badgeColor = !u.isActive ? 'badge-light-danger' : u.locked ? 'badge-light-warning' : 'badge-light-success';
          u.statusText = !u.isActive ? 'Inactivo' : u.locked ? 'Bloqueado' : 'Activo';
          u.lockedText = u.locked ? `Bloqueado hasta ${isoToLima(u.lockedUntil)}` : '';
          u.mfaText = u.mfaEnabled ? 'Configurada' : 'Pendiente (primer ingreso)';
          u.lastLoginText = u.lastLoginAt ? isoToLima(u.lastLoginAt) : 'Nunca';
          u.roleName = u.roleName || ADMIN_ROLE_NAMES[u.role] || u.role;
        });
        return resp;
      })
    );
  }

  create(body: CreateAdminUserRequest): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(this.url(), body);
  }

  update(id: number, body: UpdateAdminUserRequest): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(this.url(id), body);
  }

  toggleStatus(id: number): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(this.url(id, '/toggle-status'), {});
  }

  resetMfa(id: number): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(this.url(id, '/mfa/reset'), {});
  }

  unlock(id: number): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(this.url(id, '/unlock'), {});
  }

  /** Contraseña temporal (revoca las sesiones del usuario). */
  setPassword(id: number, password: string): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(this.url(id, '/password'), { password });
  }
}

/** Auditoría (`GET admin/audit`, solo superadmin). */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private http = inject(HttpClient);

  GetAll(size: number, page: number, getInputs: string): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(listUrl(endpoint.AUDIT, size, page, getInputs)).pipe(
      map((resp) => {
        rows<AuditLogResponse>(resp).forEach((a) => {
          a.createdAtText = isoToLima(a.createdAt);
          a.actorText = ACTOR_TYPE_OPTIONS.find((o) => o.id === a.actorTipo)?.name ?? a.actorTipo;
        });
        return resp;
      })
    );
  }
}
