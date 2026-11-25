import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment as env } from '@envs/environment';
import { endpoint } from '@shared/apis/endpoint';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { formatNumber, listUrl, rows } from '@shared/functions/list-helpers';
import { money } from '../../sunat/models/tenant-views.models';
import { EmissionSettingsRequest, PlanRequest, PlanRow } from '../models/platform.models';

/** Límite de documentos del mes para mostrar: -1 = ilimitado, null = sin límite definido. */
export function limitText(value: number | null | undefined): string {
  if (value == null) {
    return 'Sin definir';
  }
  return value === -1 ? 'Ilimitado' : formatNumber(value);
}

/** Planes (`GET plans`, `Admin.Plans.View`; escrituras `Admin.Plans.Manage`; eliminar `Admin.Plans.Delete`). */
@Injectable({ providedIn: 'root' })
export class PlanService {
  private http = inject(HttpClient);

  private url(id?: number, suffix = ''): string {
    return `${env.apiUrl}${endpoint.PLANS}${id != null ? `/${id}` : ''}${suffix}`;
  }

  static decorate(p: PlanRow): PlanRow {
    p.badgeColor = p.isActive ? 'badge-light-success' : 'badge-light-secondary';
    p.statusText = p.isActive ? 'Activo' : 'Inactivo';
    // El contrato no indica la moneda del precio: se muestra solo el monto.
    p.priceText = `${money(p.priceMonthly)} / mes` + (p.priceYearly ? ` · ${money(p.priceYearly)} / año` : '');
    p.documentsText = p.isUnlimited ? 'Ilimitado' : limitText(p.documentsMonth);
    p.usageText = `${formatNumber(p.subscriptionsCount ?? 0)} suscripciones · ${formatNumber(p.tenantsCount ?? 0)} empresas`;
    p.kindText = p.isSystem ? `${p.slug} · del sistema` : p.slug;
    return p;
  }

  GetAll(size: number, page: number, getInputs: string): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(listUrl(endpoint.PLANS, size, page, getInputs)).pipe(
      map((resp) => {
        rows<PlanRow>(resp).forEach(PlanService.decorate);
        return resp;
      })
    );
  }

  /** Inexistente → 404 `No existe el plan.` */
  byId(id: number): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(this.url(id));
  }

  catalog(): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(`${env.apiUrl}${endpoint.PLANS_CATALOG}`);
  }

  create(body: PlanRequest): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(this.url(), body);
  }

  update(id: number, body: PlanRequest): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(this.url(id), body);
  }

  /** Invierte `isActive` (inactivo: no sale en `/api/v1/planes`). */
  toggle(id: number): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(this.url(id, '/toggle'), {});
  }

  /** Solo superadmin; con suscripciones o del sistema → `succeeded: false`. */
  remove(id: number): Observable<BaseResponse> {
    return this.http.delete<BaseResponse>(this.url(id));
  }
}

/** Configuración global de emisión (`GET settings`, `Admin.Settings.View`; escrituras `Admin.Settings.Manage`, solo superadmin). */
@Injectable({ providedIn: 'root' })
export class PlatformSettingsService {
  private http = inject(HttpClient);

  get(): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(`${env.apiUrl}${endpoint.SETTINGS}`);
  }

  updateEmission(body: EmissionSettingsRequest): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(`${env.apiUrl}${endpoint.SETTINGS_EMISSION}`, body);
  }

  /** Token de consulta RUC / DNI: de solo escritura (se guarda cifrado y nunca vuelve). */
  setLookupToken(token: string): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(`${env.apiUrl}${endpoint.SETTINGS_LOOKUP_TOKEN}`, { token });
  }

  clearLookupToken(): Observable<BaseResponse> {
    return this.http.delete<BaseResponse>(`${env.apiUrl}${endpoint.SETTINGS_LOOKUP_TOKEN}`);
  }
}
