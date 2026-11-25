import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment as env } from '@envs/environment';
import { endpoint } from '@shared/apis/endpoint';
import { BaseResponse } from '@shared/models/base-api-response.interface';

/** `data` de `GET admin/auth/me` (y de `PUT admin/auth/me`). `role`: superadmin / operador / soporte / lectura. */
export interface CurrentUserProfile {
  id: number | string;
  userName: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email: string | null;
  profilePictureUrl: string | null;
  role?: string | null;
}

/** Nombres de los roles del panel (users.role de la API SUNAT). */
export const ADMIN_ROLE_NAMES: Record<string, string> = {
  superadmin: 'Superadministrador',
  operador: 'Operador',
  soporte: 'Soporte',
  lectura: 'Solo lectura'
};

/**
 * Nombre, correo y rol del administrador conectado. Salen de `GET admin/auth/me` y viven solo en memoria: el JWT no lleva
 * datos personales y nada de esto se guarda en localStorage.
 */
@Injectable({ providedIn: 'root' })
export class CurrentUserProfileService {
  readonly profile = signal<CurrentUserProfile | null>(null);

  constructor(private http: HttpClient) {}

  load(): Observable<CurrentUserProfile | null> {
    return this.http.get<BaseResponse>(`${env.apiUrl}${endpoint.ACCOUNT_ME}`).pipe(
      map((resp) => (resp?.succeeded && resp.data ? (resp.data as CurrentUserProfile) : null)),
      catchError(() => of(null)),
      tap((profile) => this.profile.set(profile))
    );
  }

  clear(): void {
    this.profile.set(null);
  }
}
