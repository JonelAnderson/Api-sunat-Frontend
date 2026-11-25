import { Component, ViewChild, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { ListTableComponent } from '@shared/components/reusables/list-table/list-table.component';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { ButtonResetFiltersComponent } from '@shared/components/reusables/button-reset-filters/button-reset-filters.component';
import { FilterSelectComponent } from '@shared/components/reusables/filter-select/filter-select.component';
import { TableColumns } from '@shared/models/list-table.interface';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { col, query } from '@shared/functions/list-helpers';
import { CERTIFICATE_STATUS_OPTIONS, CertificateResponse, CertificateStatus } from '../../models/sunat.models';
import { CertificateService } from '../../services/sunat.services';

/**
 * Certificados digitales de las empresas activas (`GET certificates`). `dias` marca "por vencer" a los que vencen dentro de
 * ese plazo; vacío = el aviso configurado en la API (`app.ops.cert-dias-aviso`).
 */
@Component({
  selector: 'app-certificate-list',
  imports: [SharedModule, ListTableComponent, PageHeaderComponent, ButtonResetFiltersComponent, FilterSelectComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-award" title="CERTIFICADOS DIGITALES" subtitle="Vencimiento y estado del certificado de cada empresa activa"
            help="Misma regla que la verificación diaria de la API: vigente, por vencer (dentro de los días indicados), vencido, roto (no se puede leer) o sin certificado.">
            <app-filter-select headerFilters #statusFilter [items]="statuses" placeholder="Estado" [currentValue]="status" (filterChange)="status = $event; refresh()"></app-filter-select>
            <div headerFilters class="input-group" style="width: 190px;">
              <span class="input-group-text">Aviso (días)</span>
              <input type="number" min="1" max="365" class="form-control" placeholder="API" aria-label="Días de aviso"
                [value]="days ?? ''" (change)="setDays($any($event.target).value)" />
            </div>
            <app-button-reset-filters headerActions (buttonClick)="reset()"></app-button-reset-filters>
          </app-page-header>
          <div class="card-body p-0">
            <app-list-table [service]="certificates" [columns]="columns" [getInputs]="getInputs()"></app-list-table>
          </div>
        </div>
      </div>
    </div>
  `
})
export class CertificateListComponent {
  @ViewChild('statusFilter') statusFilter?: FilterSelectComponent;

  readonly statuses = CERTIFICATE_STATUS_OPTIONS;
  readonly columns: TableColumns<CertificateResponse>[] = [
    col('RUC', 'ruc'), col('RAZÓN SOCIAL', 'razonSocial'), col('AMBIENTE', 'environmentText'),
    { ...col<CertificateResponse>('ESTADO', 'statusText', 'badge'), tooltip: 'message' },
    col('VENCE', 'expiresOnText'), col('DÍAS', 'daysLeft', 'number'), col('DETALLE', 'message')
  ];

  status: CertificateStatus | null = null;
  days: number | null = null;
  readonly getInputs = signal('');

  constructor(public certificates: CertificateService, route: ActivatedRoute, title: CustomTitleService) {
    title.set('Certificados');
    // Desde el tablero llega ?status=POR_VENCER.
    const initial = route.snapshot.queryParamMap.get('status');
    this.status = this.statuses.some((o) => o.id === initial) ? (initial as CertificateStatus) : null;
    this.refresh();
  }

  setDays(value: string): void {
    const n = Math.trunc(Number(value));
    this.days = value !== '' && n > 0 ? n : null;
    this.refresh();
  }

  reset(): void {
    this.status = null;
    this.days = null;
    this.statusFilter?.resetFilter();
    this.refresh();
  }

  refresh(): void {
    this.getInputs.set(query({ status: this.status, dias: this.days, refresh: Math.random() }));
  }
}
