import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { environment as env } from '@envs/environment';
import { endpoint } from '@shared/apis/endpoint';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { serverMessages } from '@shared/functions/list-helpers';
import {
  BranchBody, ClientBody, CreateTenantBody, GreCredentialsBody, SeriesCreateBody, SeriesUpdateBody, SolCredentialsBody, TenantDataBody,
  UbigeoItem
} from '../models/tenant-admin.models';
import { DocKind, SaleKind } from '../models/tenant-views.models';

/**
 * Escrituras de la fase C sobre una empresa (§11.3–§11.5), la ayuda `buscar-documento` (§11.9) y las acciones de la fase D
 * sobre sus documentos (§11.8: reenviar, anular / revertir, refrescar y corregir). Rutas relativas a `/api/admin/`; cada una
 * vuelve a comprobar el permiso en el servidor (`Admin.Tenants.Edit`, `.Credentials`, `.Delete`, `Admin.Documents.*`).
 * Las respuestas con `apiKey` / `apiSecret` (alta y regenerar) se entregan tal cual al llamador: este servicio no las guarda.
 */
@Injectable({ providedIn: 'root' })
export class TenantAdminService {
  private http = inject(HttpClient);

  private url(tenantId: number | null, path = ''): string {
    return `${env.apiUrl}${endpoint.TENANTS}${tenantId != null ? `/${tenantId}` : ''}${path ? `/${path}` : ''}`;
  }

  // ---------------------------------------------------------------- Empresa (§11.3)
  /** `data`: `{ tenantId, empresa, apiKey, apiSecret, aviso }` (una sola vez). 409 si el RUC ya existe. */
  create(body: CreateTenantBody): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(this.url(null), body);
  }

  /** Autocompletar el alta (solo al pulsar "Consultar"; cuenta en el límite de 20 por minuto). 409 si ya está registrado. */
  rucLookup(ruc: string): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(`${env.apiUrl}${endpoint.TENANTS_RUC_LOOKUP}`, { params: { ruc } });
  }

  /** Solo cambia lo que llega (`PUT /api/v1/empresa`); `data` = recurso de la empresa de §9.5. */
  update(tenantId: number, body: TenantDataBody): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(this.url(tenantId), body);
  }

  /** Borrado lógico, solo superadmin: `{ motivo, ruc }` (el RUC confirma). */
  remove(tenantId: number, motivo: string, ruc: string): Observable<BaseResponse> {
    return this.http.delete<BaseResponse>(this.url(tenantId), { body: { motivo, ruc } });
  }

  /** `multipart/form-data`, campo `logo` (PNG / JPG / WEBP, máx. 2 MB). `data`: `{ logoUrl, formato }`. */
  uploadLogo(tenantId: number, file: File): Observable<BaseResponse> {
    const form = new FormData();
    form.append('logo', file, file.name);
    return this.http.post<BaseResponse>(this.url(tenantId, 'logo'), form);
  }

  // ---------------------------------------------------------------- Credenciales (§11.4, solo escritura)
  /** Indicadores y metadatos (camelCase), nunca valores. */
  credentials(tenantId: number): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(this.url(tenantId, 'credenciales'));
  }

  setSol(tenantId: number, body: SolCredentialsBody): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(this.url(tenantId, 'credenciales/sol'), body);
  }

  setGre(tenantId: number, body: GreCredentialsBody): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(this.url(tenantId, 'credenciales/gre'), body);
  }

  /** `multipart/form-data`: `certificado` (.pfx / .p12, máx. 100 KB), `contrasena_certificado` y `motivo` opcional. */
  uploadCertificate(tenantId: number, file: File, password: string, motivo: string): Observable<BaseResponse> {
    const form = new FormData();
    form.append('certificado', file, file.name);
    form.append('contrasena_certificado', password);
    if (motivo) {
      form.append('motivo', motivo);
    }
    return this.http.post<BaseResponse>(this.url(tenantId, 'certificado'), form);
  }

  /** Nuevas `api_key` / `api_secret` (motivo obligatorio); `data`: `{ apiKey, apiSecret, aviso }` una sola vez. */
  regenerate(tenantId: number, motivo: string): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(this.url(tenantId, 'credenciales/regenerar'), { motivo });
  }

  // ---------------------------------------------------------------- Sucursales, series y clientes (§11.5)
  createBranch(tenantId: number, body: BranchBody): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(this.url(tenantId, 'sucursales'), body);
  }

  updateBranch(tenantId: number, branchId: number, body: BranchBody): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(this.url(tenantId, `sucursales/${branchId}`), body);
  }

  deleteBranch(tenantId: number, branchId: number, motivo: string): Observable<BaseResponse> {
    return this.http.delete<BaseResponse>(this.url(tenantId, `sucursales/${branchId}`), motivo ? { body: { motivo } } : {});
  }

  /** `data`: `{ creadas: [serie], errores?: [texto] }`. */
  createSeries(tenantId: number, body: SeriesCreateBody): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(this.url(tenantId, 'series'), body);
  }

  updateSeries(tenantId: number, seriesId: number, body: SeriesUpdateBody): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(this.url(tenantId, `series/${seriesId}`), body);
  }

  /** Borrado lógico: la serie queda inactiva. */
  deactivateSeries(tenantId: number, seriesId: number, motivo: string): Observable<BaseResponse> {
    return this.http.delete<BaseResponse>(this.url(tenantId, `series/${seriesId}`), motivo ? { body: { motivo } } : {});
  }

  /** Si ya existe ese documento, la API lo actualiza. */
  createClient(tenantId: number, body: ClientBody): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(this.url(tenantId, 'clientes'), body);
  }

  updateClient(tenantId: number, clientId: number, body: ClientBody): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(this.url(tenantId, `clientes/${clientId}`), body);
  }

  deleteClient(tenantId: number, clientId: number, motivo: string): Observable<BaseResponse> {
    return this.http.delete<BaseResponse>(this.url(tenantId, `clientes/${clientId}`), motivo ? { body: { motivo } } : {});
  }

  /** §11.9 (`Admin.Documents.Issue`): cliente de la empresa o SUNAT / RENIEC; `tipo` 1 / 4 / 6 / 7 / 0, `numero` de 8 a 15. */
  lookupDocument(tenantId: number, tipo: string, numero: string): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(this.url(tenantId, 'buscar-documento'), { params: { tipo, numero } });
  }

  // ---------------------------------------------------------------- Fase D: acciones sobre documentos (§11.8)
  // `data` = recurso de `/api/v1` (snake_case). La empresa debe estar activa (si no, 403) y cada acción cuenta en los límites
  // por minuto de la empresa y del administrador (429). Ninguna usa `Idempotency-Key` (§11.6).

  /** `POST {vista}/{docId}/enviar` con `{ motivo }` obligatorio (`Admin.Documents.Resend`), cualquier tipo de §9. */
  resendDocument(tenantId: number, kind: DocKind, docId: number, motivo: string): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(this.url(tenantId, `${kind}/${docId}/enviar`), { motivo });
  }

  /**
   * Anular (`Admin.Documents.Void`, motivo obligatorio que va a SUNAT): facturas y notas → `…/anular` (RA), boletas →
   * `…/anular` (RC), retenciones y percepciones → `…/revertir` (RR), liquidaciones → `…/revertir` con `causal` (RR).
   */
  voidDocument(tenantId: number, kind: DocKind, docId: number, motivo: string, causal?: string): Observable<BaseResponse> {
    const reversal = kind === 'retenciones' || kind === 'percepciones' || kind === 'liquidaciones-compra';
    const body: Record<string, string> = { motivo };
    if (kind === 'liquidaciones-compra') {
      body['causal'] = causal ?? '';
    }
    return this.http.post<BaseResponse>(this.url(tenantId, `${kind}/${docId}/${reversal ? 'revertir' : 'anular'}`), body);
  }

  /** `POST {vista}/{docId}/refrescar` (`Admin.Documents.Refresh`): consulta a SUNAT y guarda el resultado; motivo opcional. */
  refreshDocument(tenantId: number, kind: DocKind, docId: number, motivo: string): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(this.url(tenantId, `${kind}/${docId}/refrescar`), motivo ? { motivo } : {});
  }

  /**
   * Corregir y reenviar (`Admin.Documents.Issue`, §11.8.4): `PUT {vista}/{docId}` con el cuerpo de `PUT /api/v1/...` más
   * `motivo` obligatorio. Comprobantes: solo los campos a corregir; guías: el cuerpo completo.
   */
  fixDocument(tenantId: number, kind: SaleKind | 'guias-remision', docId: number, body: Record<string, unknown>): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(this.url(tenantId, `${kind}/${docId}`), body);
  }
}

/**
 * Catálogo de ubigeo (§11.9, `Admin.Tenants.View`): listas sin paginar que se guardan en memoria mientras dura la sesión
 * (no son datos sensibles). Un error no queda en la caché.
 */
@Injectable({ providedIn: 'root' })
export class UbigeoService {
  private http = inject(HttpClient);
  private cache = new Map<string, Observable<UbigeoItem[]>>();

  regions(): Observable<UbigeoItem[]> {
    return this.list('regiones', {});
  }

  provinces(regionId: string): Observable<UbigeoItem[]> {
    return this.list('provincias', { region_id: regionId });
  }

  districts(provinceId: string): Observable<UbigeoItem[]> {
    return this.list('distritos', { provincia_id: provinceId });
  }

  private list(kind: string, params: Record<string, string>): Observable<UbigeoItem[]> {
    const key = `${kind}:${Object.values(params).join(',')}`;
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    const call = this.http.get<BaseResponse>(`${env.apiUrl}${endpoint.UBIGEO}/${kind}`, { params }).pipe(
      map((resp) => {
        if (!resp.succeeded) {
          throw new Error(serverMessages(resp, 'No se pudo cargar el catálogo de ubigeo.'));
        }
        return (Array.isArray(resp.data) ? resp.data : [])
          .filter((x: unknown) => x && typeof x === 'object')
          .map((x: Record<string, unknown>) => ({ id: String(x['id'] ?? ''), nombre: String(x['nombre'] ?? '') }))
          .filter((x: UbigeoItem) => x.id);
      }),
      catchError((err) => {
        this.cache.delete(key);
        const message = err instanceof HttpErrorResponse
          ? serverMessages(err.error, 'No se pudo cargar el catálogo de ubigeo.')
          : String(err?.message || 'No se pudo cargar el catálogo de ubigeo.');
        return throwError(() => new Error(message));
      }),
      shareReplay(1)
    );
    this.cache.set(key, call);
    return call;
  }
}
