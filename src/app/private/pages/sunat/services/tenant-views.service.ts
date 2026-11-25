import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment as env } from '@envs/environment';
import { endpoint } from '@shared/apis/endpoint';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { listUrl, rows } from '@shared/functions/list-helpers';
import { FetchError, FetchedFile, FileDownloadService } from '@shared/service/file-download.service';
import { DocFile, DocKind, Json, SaleKind, fallbackFileName } from '../models/tenant-views.models';

export type QueryValues = Record<string, string | number | null | undefined>;

/** Lo que pide app-list-table: `GetAll(size, page, getInputs)`. */
export interface ListSource {
  GetAll(size: number, page: number, getInputs: string): Observable<BaseResponse>;
}

function params(values?: QueryValues): HttpParams | undefined {
  if (!values) {
    return undefined;
  }
  let p = new HttpParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') {
      p = p.set(k, String(v));
    }
  });
  return p;
}

/** Los valores no vacíos como texto (para `FileDownloadService`). */
function textParams(values: QueryValues): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
}

/**
 * Vistas de empresa (§9): todas son `GET admin/tenants/{id}/…` con el permiso `Admin.Tenants.View`. `data` es el recurso de
 * `/api/v1` en snake_case (sin mapear). Listados: `records` / `numPage` + los filtros de `/api/v1` con su mismo nombre.
 * Fase A (§10.3, §10.5): vista unificada y su resumen (camelCase, fila común), exportación ZIP, constancia de anulación, vista
 * previa del PDF (`inline=1`) y consultas en vivo a SUNAT (`data` en snake_case, permiso `Admin.Sunat.Query`).
 */
@Injectable({ providedIn: 'root' })
export class TenantViewsService {
  private http = inject(HttpClient);
  private files = inject(FileDownloadService);

  private path(tenantId: number, view: string): string {
    return `${endpoint.TENANTS}/${tenantId}/${view}`;
  }

  /** Una vista sin paginar (detalle, panel, configuración, reportes). */
  get(tenantId: number, view: string, values?: QueryValues): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(`${env.apiUrl}${this.path(tenantId, view)}`, { params: params(values) });
  }

  /** Fuente de app-list-table para un listado paginado; `view` se lee en cada pedido (cambiar de tipo no recrea la fuente). */
  listSource(tenantId: number, view: () => string, decorate?: (row: Json) => void): ListSource {
    return {
      GetAll: (size: number, page: number, getInputs: string) =>
        this.http.get<BaseResponse>(listUrl(this.path(tenantId, view()), size, page, getInputs)).pipe(
          map((resp) => {
            if (decorate) {
              rows<Json>(resp).forEach(decorate);
            }
            return resp;
          })
        )
    };
  }

  /** XML, CDR o PDF de un documento por la ruta del panel (nunca por las URLs de `archivos`, que son de `/api/v1`). */
  download(tenantId: number, kind: DocKind, docId: number, file: DocFile, row: Json, pdfFormat = 'a4'): Promise<boolean> {
    const url = `${env.apiUrl}${this.path(tenantId, `${kind}/${docId}/${file}`)}`;
    // inline=0: `attachment` (§10.3); la descarga igual se arma desde el blob.
    return this.files.download(url, fallbackFileName(row, file), file === 'pdf' ? { formato: pdfFormat, inline: '0' } : undefined);
  }

  /** PDF para la vista previa (`inline=1`): el blob o el error con el mensaje de la API. */
  pdfPreview(tenantId: number, kind: DocKind, docId: number, pdfFormat = 'a4'): Promise<FetchedFile | FetchError> {
    const url = `${env.apiUrl}${this.path(tenantId, `${kind}/${docId}/pdf`)}`;
    return this.files.fetchBlob(url, { formato: pdfFormat, inline: '1' });
  }

  // ---------------------------------------------------------------- Constancia de anulación (§10.3)
  /** `data`: el RA / RC más reciente que contiene el comprobante, o `null` con el mensaje de la API. */
  voidRecord(tenantId: number, kind: SaleKind, docId: number): Observable<BaseResponse> {
    return this.get(tenantId, `${kind}/${docId}/anulacion`);
  }

  /** XML o CDR de la constancia (mismos nombres de §9.6: `RA-…xml`, `R-RA-…zip`). */
  downloadVoidFile(tenantId: number, kind: SaleKind, docId: number, file: 'xml' | 'cdr', identifier: string): Promise<boolean> {
    const url = `${env.apiUrl}${this.path(tenantId, `${kind}/${docId}/anulacion/${file}`)}`;
    const base = identifier || `anulacion-${docId}`;
    return this.files.download(url, file === 'xml' ? `${base}.xml` : `R-${base}.zip`);
  }

  // ---------------------------------------------------------------- Exportación ZIP (§10.3)
  /**
   * `GET tenants/{id}/comprobantes/exportar-zip` con los parámetros de `/api/v1` (`fecha_desde`, `fecha_hasta`, `tipo`,
   * `documentos`, `sucursal_id`, `estado`). Los topes (31 días, 2 000 archivos, 200 MB) y la validación llegan como el sobre:
   * `FileDownloadService` muestra sus mensajes.
   */
  exportZip(tenantId: number, values: QueryValues, fallbackName: string): Promise<boolean> {
    const url = `${env.apiUrl}${this.path(tenantId, 'comprobantes/exportar-zip')}`;
    return this.files.download(url, fallbackName, textParams(values));
  }

  // ---------------------------------------------------------------- Consultas en vivo a SUNAT (§10.5)
  /** Consulta integrada de CPE: `tipo_doc`, `serie`, `correlativo`, `fecha_emision` (dd/mm/aaaa), `monto`, `ruc_emisor?`. */
  consultarCpe(tenantId: number, values: QueryValues): Observable<BaseResponse> {
    return this.get(tenantId, 'consultar-cpe', values);
  }

  /** Consulta del CDR: `tipo_documento` (01 / 03 / 07 / 08), `serie` (4), `correlativo`. */
  consultarCdr(tenantId: number, values: QueryValues): Observable<BaseResponse> {
    return this.get(tenantId, 'consultar-cdr', values);
  }
}
