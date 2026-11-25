import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { FeedPreset, UnifiedDocumentsComponent } from './unified-documents.component';

/** Filtro de la URL: `?tenantId=&tenant=&estado=&tipo=` (desde el tablero, Empresas o Rechazos). */
function presetFrom(route: ActivatedRoute): FeedPreset {
  const p = route.snapshot.queryParamMap;
  const id = Number(p.get('tenantId'));
  return { tenantId: id > 0 ? id : null, tenant: p.get('tenant'), estado: p.get('estado'), tipo: p.get('tipo') };
}

/** Comprobantes (`/private/sunat/documents`, `Admin.Tenants.View`): todos los documentos de todas las empresas (§10.3). */
@Component({
  selector: 'app-document-list',
  imports: [PageHeaderComponent, UnifiedDocumentsComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-file-text" title="COMPROBANTES" subtitle="Todos los documentos de todas las empresas emisoras, en una sola lista"
            help="Facturas, boletas, notas, guías, retenciones, percepciones, liquidaciones de compra, resúmenes diarios, bajas y reversiones. Sin empresa ni fechas muestra los últimos 30 días. El detalle y las descargas quedan en la auditoría.">
          </app-page-header>
          <div class="card-body">
            <app-unified-documents mode="documents" [preset]="preset"></app-unified-documents>
          </div>
        </div>
      </div>
    </div>
  `
})
export class DocumentListComponent {
  readonly preset = presetFrom(inject(ActivatedRoute));

  constructor() {
    inject(CustomTitleService).set('Comprobantes');
  }
}

/** Envíos SUNAT (`/private/sunat/submissions`, `Admin.Rejections.View`): feed de envíos de todas las empresas y estados (§10.3). */
@Component({
  selector: 'app-submission-list',
  imports: [PageHeaderComponent, UnifiedDocumentsComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-send" title="ENVÍOS SUNAT" subtitle="Lo último que se envió a SUNAT, de todas las empresas, en todos los estados"
            help="Ordenado por el momento del envío (o de registro si no se envió), del más reciente al más antiguo. Siempre dentro de un rango de fechas de emisión (por defecto los últimos 30 días, máximo 366).">
          </app-page-header>
          <div class="card-body">
            <app-unified-documents mode="submissions" [preset]="preset"></app-unified-documents>
          </div>
        </div>
      </div>
    </div>
  `
})
export class SubmissionListComponent {
  readonly preset = presetFrom(inject(ActivatedRoute));

  constructor() {
    inject(CustomTitleService).set('Envíos SUNAT');
  }
}
