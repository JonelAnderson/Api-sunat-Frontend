import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, timeout } from 'rxjs/operators';
import { environment as env } from '@envs/environment';
import { endpoint } from '@shared/apis/endpoint';
import { BaseResponse } from '@shared/models/base-api-response.interface';

/** Segmento de `POST tenants/{id}/…` de §11.7 (también decide el permiso: todos son `Admin.Documents.Issue`). */
export type IssueKind = 'facturas' | 'boletas' | 'notas-credito' | 'notas-debito' | 'guias-remision' | 'guias-remision-transportista' | 'retenciones'
  | 'percepciones' | 'liquidaciones-compra' | 'resumenes';

/** Lo que devuelve una emisión: el sobre y si la API repitió una respuesta guardada (`Idempotency-Replayed: true`, §11.6). */
export interface IssueResponse {
  resp: BaseResponse;
  replayed: boolean;
}

/** Fila del catálogo 25 (UNSPSC) de §11.9. */
export interface ProductSunatRow {
  codigo: string;
  descripcion: string;
  clase?: string;
}

/** Nodo de la jerarquía (segmento, familia, clase) o producto. */
export interface ProductSunatNode {
  codigo: string;
  nombre: string;
}

/** Espera máxima de una emisión: si se agota, el resultado es desconocido y se reintenta con la misma clave. */
export const ISSUE_TIMEOUT_MS = 120_000;

/**
 * Fase D, entrega 3 (§11.6, §11.7, §11.9): emitir documentos nuevos en nombre de una empresa y el catálogo de productos SUNAT.
 * Cada emisión lleva la cabecera `Idempotency-Key` (la genera y conserva `EmissionSubmitter`): este servicio solo la envía.
 * El cuerpo es el de `/api/v1` (snake_case) más `motivo` opcional; `data` es el recurso de `/api/v1` en snake_case.
 */
@Injectable({ providedIn: 'root' })
export class EmissionService {
  private http = inject(HttpClient);

  issue(tenantId: number, kind: IssueKind, body: Record<string, unknown>, idempotencyKey: string): Observable<IssueResponse> {
    return this.http.post<BaseResponse>(`${env.apiUrl}${endpoint.TENANTS}/${tenantId}/${kind}`, body, {
      headers: { 'Idempotency-Key': idempotencyKey }, observe: 'response'
    }).pipe(
      timeout(ISSUE_TIMEOUT_MS),
      map((r) => ({ resp: r.body as BaseResponse, replayed: (r.headers.get('Idempotency-Replayed') ?? '').toLowerCase() === 'true' }))
    );
  }

  /** Búsqueda en el catálogo 25: `q` (2 o más; texto o prefijo de código), `per_page` 1–50; `totalRecords` = total. */
  searchProducts(q: string, page = 1, perPage = 20): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(`${env.apiUrl}${endpoint.PRODUCTO_SUNAT}`, { params: { q, page, per_page: perPage } });
  }

  /** Jerarquía: segmentos (sin parámetro), familias (`segmento`), clases (`familia`) y productos (`clase`). */
  productLevel(level: 'segmentos' | 'familias' | 'clases' | 'productos', parent?: string): Observable<BaseResponse> {
    const param: Record<string, string> = {};
    if (parent && level === 'familias') {
      param['segmento'] = parent;
    } else if (parent && level === 'clases') {
      param['familia'] = parent;
    } else if (parent && level === 'productos') {
      param['clase'] = parent;
    }
    return this.http.get<BaseResponse>(`${env.apiUrl}${endpoint.PRODUCTO_SUNAT}/${level}`, { params: param });
  }

  /** Un código de 8 dígitos con su jerarquía; inexistente → 404. */
  productByCode(code: string): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(`${env.apiUrl}${endpoint.PRODUCTO_SUNAT}/${encodeURIComponent(code)}`);
  }
}
