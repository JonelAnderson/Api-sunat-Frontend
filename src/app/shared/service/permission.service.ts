import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, lastValueFrom } from 'rxjs';
import { environment } from '@envs/environment';
import { endpoint } from '@shared/apis/endpoint';
import { map } from 'rxjs/operators';
import { BaseResponse } from '@shared/models/base-api-response.interface';

/**
 * Permisos del usuario conectado. Solo en memoria (ya no en localStorage): al recargar la página se vuelven a pedir a la
 * API antes de abrir cualquier pantalla privada (AuthGuard → ensureLoaded). Son solo para mostrar u ocultar opciones; la
 * API valida cada permiso.
 */
@Injectable({
  providedIn: 'root'
})
export class PermissionService {
  private permissionsSubject: BehaviorSubject<string[]> = new BehaviorSubject<string[]>([]);
  public permissions$: Observable<string[]> = this.permissionsSubject.asObservable();
  private permissions: string[] = [];
  private loaded = false;
  private inFlight: Promise<boolean> | null = null;

  constructor(private http: HttpClient) {}

  hasPermission(permission: string): boolean {
    return this.permissions.includes(permission);
  }

  hasAnyPermission(requiredPermissions: string[]): boolean {
    return requiredPermissions.some(permission => this.permissions.includes(permission));
  }

  getPermissions(): string[] {
    return this.permissions;
  }

  /** Carga los permisos si aún no están (una sola petición aunque la pidan varios a la vez). */
  ensureLoaded(): Promise<boolean> {
    return this.loaded ? Promise.resolve(true) : this.loadPermissions();
  }

  /** Vuelve a pedir los permisos a la API (login, renovación, cambio de roles). */
  loadPermissions(): Promise<boolean> {
    if (this.inFlight) {
      return this.inFlight;
    }
    const requestUrl = `${environment.apiUrl}${endpoint.GET_PERMISSIONS}`;
    this.inFlight = lastValueFrom(
      this.http.get<BaseResponse>(requestUrl).pipe(
        map((response: any) => {
          if (response.succeeded) {
            this.permissions = response.data;
            this.loaded = true;
            this.permissionsSubject.next(this.permissions);
            return true;
          }
          return false;
        })
      )
    ).finally(() => (this.inFlight = null));
    return this.inFlight;
  }

  clearPermissions(): void {
    this.permissions = [];
    this.loaded = false;
    this.permissionsSubject.next([]);
  }
}
