import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { TenantPickerComponent, TenantPick } from '../common/tenant-picker.component';
import { SunatLiveQueryComponent } from './sunat-live-query.component';

/**
 * Consulta CPE (`/private/sunat/cpe-query`, `Admin.Sunat.Query`): consultas en vivo a SUNAT en nombre de una empresa
 * (§10.5). Se elige la empresa (por RUC o razón social) y se escriben los datos del comprobante. `?tenantId=&tenant=` la
 * deja elegida.
 */
@Component({
  selector: 'app-cpe-query',
  imports: [PageHeaderComponent, TenantPickerComponent, SunatLiveQueryComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-search" title="CONSULTA CPE" subtitle="Consulta en vivo a SUNAT del estado de un comprobante y de su CDR"
            help="Usa las credenciales guardadas de la empresa (no se muestran). No guarda nada. Cada consulta queda en la auditoría y cuenta en el límite por minuto de la empresa y en el suyo (20 por minuto).">
          </app-page-header>
          <div class="card-body">
            <div class="erp-callout mb-3" role="note">
              <em class="feather icon-shield" aria-hidden="true"></em>
              <div>
                Esta consulta va a SUNAT <strong>en nombre de la empresa</strong>, con sus credenciales guardadas (usted nunca las ve). Queda registrada en la
                auditoría con su usuario, la empresa y los datos consultados, y cuenta en el límite por minuto de la empresa (según su plan) y en el suyo
                (20 por minuto). No cambia el estado guardado del comprobante: para eso, revise su detalle en la página de la empresa.
              </div>
            </div>
            <div class="row g-2 mb-3">
              <div class="col-12 col-md-8 col-xl-5">
                <label class="form-label small" for="cpe-tenant">Empresa <span class="erp-required">*</span></label>
                <app-tenant-picker inputId="cpe-tenant" placeholder="Elija la empresa (RUC o razón social)" minWidth="100%" [value]="tenantId()"
                  [label]="tenantLabel()" (tenantChange)="setTenant($event)"></app-tenant-picker>
              </div>
            </div>
            <app-sunat-live-query [tenantId]="tenantId()"></app-sunat-live-query>
          </div>
        </div>
      </div>
    </div>
  `
})
export class CpeQueryComponent {
  private route = inject(ActivatedRoute);

  readonly tenantId = signal<number | null>(null);
  readonly tenantLabel = signal('');

  constructor() {
    inject(CustomTitleService).set('Consulta CPE');
    const params = this.route.snapshot.queryParamMap;
    const id = Number(params.get('tenantId'));
    if (id > 0) {
      this.tenantId.set(id);
      this.tenantLabel.set(params.get('tenant') ?? '');
    }
  }

  setTenant(t: TenantPick | null): void {
    this.tenantId.set(t?.id ?? null);
    this.tenantLabel.set(t?.label ?? '');
  }
}
