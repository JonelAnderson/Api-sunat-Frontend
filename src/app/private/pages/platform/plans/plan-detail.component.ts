import { Component, OnInit, inject, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { formatNumber, serverMessages } from '@shared/functions/list-helpers';
import { isoToLima } from '@shared/functions/lima-dates';
import { ViewBlock, c, filled, item, money, table } from '../../sunat/models/tenant-views.models';
import { ViewBlockComponent } from '../../sunat/components/tenant-page/view-block.component';
import { PlanCatalog, PlanDetail, PlanRow } from '../models/platform.models';
import { PlanService, limitText } from '../services/platform.services';

/** Detalle de un plan (`GET plans/{id}`), con las etiquetas del catálogo (`GET plans/catalog`). Solo lectura. */
@Component({
  selector: 'app-plan-detail',
  imports: [ViewBlockComponent],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-package"></em>Plan {{ plan.name }}</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      @if (loading()) {
      <div class="erp-loading" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Cargando…</div>
      } @else if (error()) {
      <div class="alert alert-warning mb-0">{{ error() }}</div>
      } @else {
      <app-view-block [block]="block()"></app-view-block>
      }
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="activeModal.dismiss()">Cerrar</button>
    </div>
  `
})
export class PlanDetailComponent implements OnInit {
  readonly activeModal = inject(NgbActiveModal);
  private plans = inject(PlanService);

  plan!: PlanRow;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly block = signal<ViewBlock | null>(null);

  ngOnInit(): void {
    forkJoin([this.plans.byId(this.plan.id), this.plans.catalog().pipe(catchError(() => of(null as BaseResponse | null)))]).subscribe({
      next: ([detail, catalog]) => {
        this.loading.set(false);
        if (detail.succeeded && detail.data) {
          this.block.set(this.build(detail.data as PlanDetail, catalog?.succeeded ? (catalog.data as PlanCatalog) : null));
        } else {
          this.error.set(serverMessages(detail, 'No se pudo cargar el plan.'));
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(serverMessages(err?.error, 'No se pudo cargar el plan.'));
      }
    });
  }

  private build(p: PlanDetail, cat: PlanCatalog | null): ViewBlock {
    const limitLabel = (k: string) => cat?.limits?.find((l) => l.key === k);
    const featureLabel = (k: string) => cat?.features?.find((f) => f.key === k);
    const limits = Object.entries(p.limits ?? {});
    const features = p.features ?? [];
    return {
      groups: [
        { title: 'Plan', icon: 'icon-package', items: filled([
          item('Slug', p.slug), item('Nombre', p.name), item('Estado', p.isActive ? 'Activo' : 'Inactivo', p.isActive ? 'badge-light-success' : 'badge-light-secondary'),
          item('Tipo', p.isSystem ? 'Del sistema (no cambia de slug ni se elimina)' : 'Personalizado'), item('Precio mensual', money(p.priceMonthly)),
          item('Precio anual', money(p.priceYearly ?? 0)), item('Documentos SUNAT por mes', p.isUnlimited ? 'Ilimitado' : limitText(p.documentsMonth)),
          item('Duración', p.durationDays ? `${formatNumber(p.durationDays)} días` : 'Sin vencimiento'), item('Orden', formatNumber(p.sortOrder ?? 0)),
          item('Suscripciones', formatNumber(p.subscriptionsCount ?? 0)), item('Empresas con este plan', formatNumber(p.tenantsCount ?? 0)),
          item('Creado', isoToLima(p.createdAt)), item('Actualizado', isoToLima(p.updatedAt))
        ]) }
      ],
      tables: [
        table([c('grupo', 'Grupo'), c('limite', 'Límite'), c('valor', 'Valor', 'end')],
          limits.map(([k, v]) => ({ cells: { grupo: limitLabel(k)?.group ?? '—', limite: limitLabel(k)?.label ?? k, valor: limitText(v) } })),
          'Límites', 'El plan no tiene límites definidos.', 'icon-sliders'),
        table([c('grupo', 'Grupo'), c('funcionalidad', 'Funcionalidad')],
          features.map((k) => ({ cells: { grupo: featureLabel(k)?.group ?? '—', funcionalidad: featureLabel(k)?.label ?? k } })),
          'Funcionalidades', 'El plan no tiene funcionalidades.', 'icon-check-square')
      ]
    };
  }
}
