import { Component, ViewChild, signal } from '@angular/core';
import { SharedModule } from '@shared/shared.module';
import { ListTableComponent } from '@shared/components/reusables/list-table/list-table.component';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { SearchBoxMultipleComponent } from '@shared/components/reusables/search-box-multiple/search-box-multiple.component';
import { ButtonResetFiltersComponent } from '@shared/components/reusables/button-reset-filters/button-reset-filters.component';
import { FiltersBox, SearchOptions } from '@shared/models/search-options.interface';
import { TableAction } from '@shared/models/table-action.interface';
import { TableColumns } from '@shared/models/list-table.interface';
import { PermissionService } from '@shared/service/permission.service';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { actionsCol, col, query, runAction, serverMessages } from '@shared/functions/list-helpers';
import { FailedJobResponse, PERM } from '../../models/sunat.models';
import { JobService } from '../../services/sunat.services';

/**
 * Trabajos de la cola que fallaron (`GET jobs`, tabla failed_jobs). Se reintenta uno (`POST jobs/{id}/retry`) o todos
 * (`POST jobs/retry-all`); ambos exigen `Admin.Jobs.Retry`. Solo se muestran los campos del contrato (nunca el payload).
 */
@Component({
  selector: 'app-job-list',
  imports: [SharedModule, ListTableComponent, PageHeaderComponent, SearchBoxMultipleComponent, ButtonResetFiltersComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-alert-triangle" title="TRABAJOS FALLIDOS" subtitle="Envíos y tareas de la cola que agotaron sus intentos"
            help="Reintentar vuelve a poner el trabajo en su cola con los mismos datos. Revise el error antes: si la causa sigue, volverá a fallar.">
            <app-search-box-multiple headerFilters #searchBox [searchOptions]="searchOptions" (search)="search($event)" [currentValue]="queue"></app-search-box-multiple>
            <app-button-reset-filters headerActions (buttonClick)="reset()"></app-button-reset-filters>
            @if (canRetry()) {
            <button headerActions type="button" class="btn btn-primary" (click)="retryAll()"><em class="feather icon-refresh-cw"></em>REINTENTAR TODOS</button>
            }
          </app-page-header>
          <div class="card-body p-0">
            <app-list-table [service]="jobs" [columns]="columns" [getInputs]="getInputs()" [actions]="actions" (actionTriggered)="onAction($event)"></app-list-table>
          </div>
        </div>
      </div>
    </div>
  `
})
export class JobListComponent {
  @ViewChild('searchBox') searchBox?: SearchBoxMultipleComponent;

  readonly searchOptions: SearchOptions[] = [
    { label: 'Cola', value: 1, placeholder: 'Filtrar por nombre de cola', validation: [], validation_desc: '', icon: 'search' }
  ];
  readonly columns: TableColumns<FailedJobResponse>[] = [
    col('ID', 'id', 'number'), col('COLA', 'queue'), col('TIPO', 'type'), col('DOCUMENTO', 'documentId'),
    col('INTENTOS', 'attempts', 'number'), col('FALLÓ', 'failedAtText'),
    { ...col<FailedJobResponse>('ERROR', 'exceptionShort'), tooltip: 'exception' }
  ];
  readonly actions: TableAction[] = [
    { id: 'retry', label: 'Reintentar', icon: 'replay', color: 'primary', tooltip: 'Volver a encolar este trabajo' }
  ];

  queue = '';
  readonly getInputs = signal('');

  constructor(public jobs: JobService, private perms: PermissionService, private alerts: AlertModalService, title: CustomTitleService) {
    title.set('Trabajos fallidos');
    if (this.canRetry()) {
      this.columns = [...this.columns, actionsCol()];
    }
    this.refresh();
  }

  canRetry(): boolean {
    return this.perms.hasPermission(PERM.jobsRetry);
  }

  search(data: FiltersBox): void {
    this.queue = data.searchData;
    this.refresh();
  }

  reset(): void {
    this.queue = '';
    this.searchBox?.resetComplete();
    this.refresh();
  }

  refresh(): void {
    this.getInputs.set(query({ queue: this.queue, refresh: Math.random() }));
  }

  async onAction(event: { action: string; row: FailedJobResponse }): Promise<void> {
    if (event.action !== 'retry') {
      return;
    }
    const j = event.row;
    const ok = await this.alerts.show({
      title: 'Reintentar trabajo', type: 'warning', showCancel: true, confirmText: 'Reintentar',
      message: `¿Volver a encolar el trabajo #${j.id} (${j.type}, cola ${j.queue})?`
    });
    if (ok) {
      runAction(this.alerts, this.jobs.retry(j.id), 'No se pudo reintentar el trabajo.', () => this.refresh(), 'Trabajo reencolado.');
    }
  }

  async retryAll(): Promise<void> {
    const ok = await this.alerts.show({
      title: 'Reintentar todos', type: 'warning', showCancel: true, confirmText: 'Reintentar todos',
      message: 'Se volverán a encolar TODOS los trabajos fallidos (de todas las colas, no solo los filtrados). ¿Continuar?'
    });
    if (!ok) {
      return;
    }
    this.jobs.retryAll().subscribe({
      next: async (resp) => {
        if (resp.succeeded) {
          this.refresh();
          const retried = Number(resp.data?.retried ?? 0);
          await this.alerts.showNotification('Listo', `Se reencolaron ${retried} trabajo(s).`, 'success');
        } else {
          await this.alerts.showNotification('Atención', serverMessages(resp, 'No se pudo reintentar los trabajos.'), 'warning');
        }
      },
      error: async (err) => {
        await this.alerts.showNotification('Error', serverMessages(err?.error, 'No se pudo reintentar los trabajos.'), 'danger');
      }
    });
  }
}
