import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment as env } from '@envs/environment';
import { endpoint } from '@shared/apis/endpoint';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { MenuNavApiItem } from '@shared/models/menu-nav-api.interface';
import { NavigationItem } from '@shared/models/navigation-item.interface';
import { mapMenuNavApiToNavigation } from '@shared/mappers/menu-nav.mapper';

/**
 * Menú lateral del usuario conectado. Sale de `GET admin/auth/menu` (fijo en el código de la API y filtrado por permisos) y
 * vive solo en memoria: SessionBootstrapService lo pide al iniciar sesión y al recargar la página. Nunca va a localStorage.
 */
@Injectable({ providedIn: 'root' })
export class MenuNavService {
  private navigationSubject = new BehaviorSubject<NavigationItem[]>([]);
  readonly navigation$ = this.navigationSubject.asObservable();

  constructor(private http: HttpClient) {}

  loadUserNavigation(): Observable<NavigationItem[]> {
    return this.http.get<BaseResponse>(`${env.apiUrl}${endpoint.MENU_NAV}`).pipe(
      map((resp) => mapMenuNavApiToNavigation(resp?.succeeded ? (resp.data as MenuNavApiItem[]) : [])),
      tap((items) => this.navigationSubject.next(items))
    );
  }
}
