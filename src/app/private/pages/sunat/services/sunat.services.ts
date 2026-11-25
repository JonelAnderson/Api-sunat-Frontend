import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment as env } from '@envs/environment';
import { endpoint } from '@shared/apis/endpoint';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { formatNumber, listUrl, rows } from '@shared/functions/list-helpers';
import { isoToLima, ymdToDisplay } from '@shared/functions/lima-dates';
import { money, sunatBadge, sunatStatusName } from '../models/tenant-views.models';
import {
  BranchRow, CERTIFICATE_BADGE, CertificateResponse, DocumentRow, SeriesRow, ChangeTenantPlanRequest, ChangeTenantStateRequest, FailedJobResponse, RejectionResponse,
  TenantResponse, UsageResponse, certificateStatusName, documentTypeName, environmentName, planName
} from '../models/sunat.models';

/**
 * Servicios del panel (§5.3 del contrato). Los `GetAll(size, page, getInputs)` son los que llama app-list-table: `records`,
 * `numPage` (desde 1) y los filtros ya armados con `query(...)`. El contrato no tiene cursor (`lastId`): se ignora.
 */

/** Emitidos / cupo; `maxDocumentsMonth` es la copia del cupo efectivo (§12.2): -1 = ilimitado. */
const usage = (used?: number | null, max?: number | null) => `${formatNumber(used ?? 0)} / ${max == null ? '—' : max === -1 ? 'ilimitado' : formatNumber(max)}`;
const tenantText = (ruc: string, name: string) => `${name} (${ruc})`;

// ---------------------------------------------------------------- Tablero
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);

  get(): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(`${env.apiUrl}${endpoint.DASHBOARD}`);
  }
}

// ---------------------------------------------------------------- Empresas
@Injectable({ providedIn: 'root' })
export class TenantService {
  private http = inject(HttpClient);

  static decorate(t: TenantResponse): TenantResponse {
    t.badgeColor = t.isActive ? 'badge-light-success' : 'badge-light-danger';
    t.statusText = t.isActive ? 'Activa' : 'Suspendida';
    t.environmentText = environmentName(t.environment);
    t.planText = planName(t.plan) + (t.emissionMode === 'unlimited' ? ' · ilimitada' : '');
    t.usageText = usage(t.documentsThisMonth, t.maxDocumentsMonth);
    return t;
  }

  GetAll(size: number, page: number, getInputs: string): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(listUrl(endpoint.TENANTS, size, page, getInputs)).pipe(
      map((resp) => {
        rows<TenantResponse>(resp).forEach(TenantService.decorate);
        return resp;
      })
    );
  }

  byId(id: number): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(`${env.apiUrl}${endpoint.TENANTS}/${id}`);
  }

  /** Suspender (motivo obligatorio) o activar. */
  changeState(id: number, body: ChangeTenantStateRequest): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(`${env.apiUrl}${endpoint.TENANTS}/${id}/estado`, body);
  }

  changePlan(id: number, body: ChangeTenantPlanRequest): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(`${env.apiUrl}${endpoint.TENANTS}/${id}/plan`, body);
  }
}

// ---------------------------------------------------------------- Uso del mes
@Injectable({ providedIn: 'root' })
export class UsageService {
  private http = inject(HttpClient);

  GetAll(size: number, page: number, getInputs: string): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(listUrl(endpoint.USAGE, size, page, getInputs)).pipe(
      map((resp) => {
        rows<UsageResponse>(resp).forEach((u) => {
          u.planText = planName(u.plan);
          u.usageText = usage(u.issued, u.maxDocumentsMonth);
          u.tenantText = tenantText(u.ruc, u.razonSocial);
        });
        return resp;
      })
    );
  }
}

// ---------------------------------------------------------------- Certificados
@Injectable({ providedIn: 'root' })
export class CertificateService {
  private http = inject(HttpClient);

  GetAll(size: number, page: number, getInputs: string): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(listUrl(endpoint.CERTIFICATES, size, page, getInputs)).pipe(
      map((resp) => {
        rows<CertificateResponse>(resp).forEach((c) => {
          c.badgeColor = CERTIFICATE_BADGE[c.status] ?? 'badge-light-secondary';
          c.statusText = certificateStatusName(c.status);
          c.expiresOnText = ymdToDisplay(c.expiresOn);
          c.environmentText = environmentName(c.environment);
          c.tenantText = tenantText(c.ruc, c.razonSocial);
        });
        return resp;
      })
    );
  }
}

// ---------------------------------------------------------------- Rechazos
@Injectable({ providedIn: 'root' })
export class RejectionService {
  private http = inject(HttpClient);

  GetAll(size: number, page: number, getInputs: string): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(listUrl(endpoint.REJECTIONS, size, page, getInputs)).pipe(
      map((resp) => {
        rows<RejectionResponse>(resp).forEach((r) => {
          r.tenantText = tenantText(r.ruc, r.razonSocial);
          r.documentText = `${r.serie}-${r.correlativo}`;
          r.tipoText = documentTypeName(r.tipo);
          r.fechaText = ymdToDisplay(r.fechaEmision);
        });
        return resp;
      })
    );
  }
}

// ---------------------------------------------------------------- Trabajos fallidos
@Injectable({ providedIn: 'root' })
export class JobService {
  private http = inject(HttpClient);

  GetAll(size: number, page: number, getInputs: string): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(listUrl(endpoint.JOBS, size, page, getInputs)).pipe(
      map((resp) => {
        rows<FailedJobResponse>(resp).forEach((j) => {
          j.failedAtText = isoToLima(j.failedAt);
          const text = (j.exception ?? '').replace(/\s+/g, ' ').trim();
          j.exceptionShort = text.length > 120 ? `${text.substring(0, 120)}…` : text;
        });
        return resp;
      })
    );
  }

  retry(id: number): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(`${env.apiUrl}${endpoint.JOBS}/${id}/retry`, {});
  }

  /** `data`: `{ retried }`. */
  retryAll(): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(`${env.apiUrl}${endpoint.JOBS_RETRY_ALL}`, {});
  }
}

// ---------------------------------------------------------------- Salud
@Injectable({ providedIn: 'root' })
export class HealthService {
  private http = inject(HttpClient);

  get(): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(`${env.apiUrl}${endpoint.HEALTH}`);
  }
}

// ---------------------------------------------------------------- Documentos: envíos y vista unificada (§10.3)
/** Campos "para la tabla" de la fila común. */
export function decorateDocumentRow(d: DocumentRow): DocumentRow {
  const state = d.observado ? 'observado' : d.sunatStatus;
  d.statusText = sunatStatusName(state);
  d.badgeColor = sunatBadge(state);
  d.sunatText = [d.sunatCode, d.sunatDescription].filter((v) => v != null && v !== '').join(' – ');
  d.fechaText = ymdToDisplay(d.fechaEmision);
  d.sentText = d.sentAt ? isoToLima(d.sentAt) : 'Sin enviar';
  d.totalText = d.total != null ? money(d.total, d.moneda ?? undefined) : '';
  d.tenantText = tenantText(d.ruc, d.razonSocial);
  return d;
}

/** Origen de un listado de documentos con la fila común. */
export type DocumentFeed = 'submissions' | 'documents';

/**
 * `GET submissions` (feed de envíos, `Admin.Rejections.View`), `GET documents` + `documents/summary` (vista global,
 * `Admin.Tenants.View`) y la vista unificada de una empresa (`tenants/{id}/comprobantes` + `/resumen`).
 */
@Injectable({ providedIn: 'root' })
export class DocumentFeedService {
  private http = inject(HttpClient);

  private listPath(feed: DocumentFeed | 'tenant', tenantId?: number | null): string {
    return feed === 'tenant' ? `${endpoint.TENANTS}/${tenantId}/comprobantes` : feed === 'submissions' ? endpoint.SUBMISSIONS : endpoint.DOCUMENTS;
  }

  /** Fuente de app-list-table; `feed` y `tenantId` se leen en cada pedido. */
  source(feed: () => DocumentFeed | 'tenant', tenantId: () => number | null = () => null): { GetAll(size: number, page: number, getInputs: string): Observable<BaseResponse> } {
    return {
      GetAll: (size: number, page: number, getInputs: string) =>
        this.http.get<BaseResponse>(listUrl(this.listPath(feed(), tenantId()), size, page, getInputs)).pipe(
          map((resp) => {
            rows<DocumentRow>(resp).forEach(decorateDocumentRow);
            return resp;
          })
        )
    };
  }

  /** Contadores: `documents/summary` (global) o `tenants/{id}/comprobantes/resumen`. `getInputs` empieza con `&`. */
  summary(tenantId: number | null, getInputs: string): Observable<BaseResponse> {
    const path = tenantId ? `${endpoint.TENANTS}/${tenantId}/comprobantes/resumen` : endpoint.DOCUMENTS_SUMMARY;
    const qs = (getInputs ?? '').replace(/^&/, '');
    return this.http.get<BaseResponse>(`${env.apiUrl}${path}${qs ? `?${qs}` : ''}`);
  }
}

// ---------------------------------------------------------------- Sucursales y series de todas las empresas (§10.3)
@Injectable({ providedIn: 'root' })
export class BranchService {
  private http = inject(HttpClient);

  GetAll(size: number, page: number, getInputs: string): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(listUrl(endpoint.BRANCHES, size, page, getInputs)).pipe(
      map((resp) => {
        rows<BranchRow>(resp).forEach((b) => {
          b.badgeColor = b.isActive ? 'badge-light-success' : 'badge-light-secondary';
          b.statusText = b.isActive ? 'Activa' : 'Inactiva';
          b.principalText = b.isPrincipal ? 'Principal' : '';
        });
        return resp;
      })
    );
  }
}

@Injectable({ providedIn: 'root' })
export class SeriesService {
  private http = inject(HttpClient);

  GetAll(size: number, page: number, getInputs: string): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(listUrl(endpoint.SERIES, size, page, getInputs)).pipe(
      map((resp) => {
        rows<SeriesRow>(resp).forEach((s) => {
          s.badgeColor = s.isActive ? 'badge-light-success' : 'badge-light-secondary';
          s.statusText = s.isActive ? 'Activa' : 'Inactiva';
          s.correlativoText = formatNumber(s.correlativo);
        });
        return resp;
      })
    );
  }
}
