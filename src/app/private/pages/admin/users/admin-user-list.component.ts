import { Component, ViewChild, signal } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';
import { SharedModule } from '@shared/shared.module';
import { ListTableComponent } from '@shared/components/reusables/list-table/list-table.component';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { SearchBoxMultipleComponent } from '@shared/components/reusables/search-box-multiple/search-box-multiple.component';
import { ButtonResetFiltersComponent } from '@shared/components/reusables/button-reset-filters/button-reset-filters.component';
import { FilterByStateComponent } from '@shared/components/reusables/filter-by-state/filter-by-state.component';
import { FiltersBox, SearchOptions } from '@shared/models/search-options.interface';
import { TableAction } from '@shared/models/table-action.interface';
import { TableColumns } from '@shared/models/list-table.interface';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { CurrentUserProfileService } from '@shared/service/current-user-profile.service';
import { STATE_MENU, actionsCol, col, openModal, query, runAction } from '@shared/functions/list-helpers';
import { AdminUserResponse } from '../models/admin.models';
import { AdminUserService } from '../services/admin.services';
import { AdminUserFormComponent } from './admin-user-form.component';
import { AdminUserPasswordComponent } from './admin-user-password.component';

/**
 * Administradores del panel (solo superadmin; la ruta exige `Admin.Users.Manage`). Crear, editar, activar / desactivar,
 * restablecer el MFA, desbloquear y contraseña temporal. La API impide quitarse el rol superadmin, desactivarse a sí mismo y
 * dejar la plataforma sin superadmin activo; aquí además no se ofrece desactivarse a uno mismo.
 */
@Component({
  selector: 'app-admin-user-list',
  imports: [SharedModule, ListTableComponent, PageHeaderComponent, SearchBoxMultipleComponent, ButtonResetFiltersComponent, FilterByStateComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-users" title="ADMINISTRADORES" subtitle="Quién entra a este panel y con qué rol"
            help="Superadministrador: todo. Operador: todo menos administradores, auditoría, configuración global y eliminar planes. Soporte: lee todo menos la auditoría y consulta SUNAT en vivo, sin editar. Solo lectura: solo datos guardados. 5 intentos fallidos bloquean la cuenta 15 minutos.">
            <app-filter-by-state headerFilters #stateFilter [currentMenu]="state!" [items]="stateMenu" (filterChange)="state = $event; refresh()"></app-filter-by-state>
            <app-search-box-multiple headerFilters #searchBox [searchOptions]="searchOptions" (search)="search($event)" [currentValue]="text"></app-search-box-multiple>
            <app-button-reset-filters headerActions (buttonClick)="reset()"></app-button-reset-filters>
            <button headerActions type="button" class="btn btn-primary" (click)="openForm(null)"><em class="feather icon-plus"></em>AGREGAR</button>
          </app-page-header>
          <div class="card-body p-0">
            <app-list-table [service]="users" [columns]="columns" [getInputs]="getInputs()" [actions]="actions" (actionTriggered)="onAction($event)"></app-list-table>
          </div>
        </div>
      </div>
    </div>
  `
})
export class AdminUserListComponent {
  @ViewChild('stateFilter') stateFilter?: FilterByStateComponent;
  @ViewChild('searchBox') searchBox?: SearchBoxMultipleComponent;

  readonly stateMenu = STATE_MENU;
  readonly searchOptions: SearchOptions[] = [
    { label: 'Nombre / Correo', value: 1, placeholder: 'Buscar por nombre o correo', validation: [], validation_desc: '', icon: 'search' }
  ];
  readonly columns: TableColumns<AdminUserResponse>[] = [
    { ...col<AdminUserResponse>('NOMBRE', 'name'), subProperty: 'email' }, col('ROL', 'roleName'), col('VERIFICACIÓN EN DOS PASOS', 'mfaText'),
    col('ÚLTIMO INGRESO', 'lastLoginText'), { ...col<AdminUserResponse>('ESTADO', 'statusText', 'badge'), tooltip: 'lockedText' }, actionsCol()
  ];
  readonly actions: TableAction[] = [
    { id: 'edit', label: 'Editar', icon: 'border_color', color: 'primary', tooltip: 'Nombre, correo y rol' },
    { id: 'password', label: 'Contraseña temporal', icon: 'key', color: 'primary', tooltip: 'Asigna una contraseña y cierra sus sesiones' },
    { id: 'unlock', label: 'Desbloquear', icon: 'lock_open', color: 'primary', tooltip: 'Limpia el bloqueo por intentos fallidos',
      visible: (r: AdminUserResponse) => !!r.locked },
    { id: 'mfa', label: 'Restablecer verificación en dos pasos', icon: 'phonelink_erase', color: 'warn',
      tooltip: 'Configurará la app de nuevo en su próximo ingreso', visible: (r: AdminUserResponse) => r.mfaEnabled },
    { id: 'state', label: (r: AdminUserResponse) => (r.isActive ? 'Desactivar' : 'Activar'),
      icon: (r: AdminUserResponse) => (r.isActive ? 'toggle_off' : 'toggle_on'), color: 'accent',
      tooltip: 'Desactivar cierra sus sesiones', visible: (r: AdminUserResponse) => !this.isMe(r) }
  ];

  state: number | null = null;
  text = '';
  readonly getInputs = signal('');

  constructor(public users: AdminUserService, private modal: NgbModal, private alerts: AlertModalService,
    private profile: CurrentUserProfileService, title: CustomTitleService) {
    title.set('Administradores');
    this.refresh();
  }

  isMe(row: AdminUserResponse): boolean {
    const me = this.profile.profile()?.id;
    return me != null && String(me) === String(row.id);
  }

  search(data: FiltersBox): void {
    this.text = data.searchData;
    this.refresh();
  }

  reset(): void {
    this.state = null;
    this.text = '';
    this.stateFilter?.resetFilter();
    this.searchBox?.resetComplete();
    this.refresh();
  }

  refresh(): void {
    this.getInputs.set(query({ stateFilter: this.state, textFilter: this.text, refresh: Math.random() }));
  }

  openForm(user: AdminUserResponse | null): void {
    openModal<boolean>(this.modal, AdminUserFormComponent, (ref) => (ref.componentInstance.user = user), () => this.refresh());
  }

  private async confirmAndRun(title: string, message: string, confirmText: string, call: () => Observable<BaseResponse>,
    failText: string, okText: string): Promise<void> {
    const ok = await this.alerts.show({ title, message, type: 'warning', showCancel: true, confirmText });
    if (ok) {
      runAction(this.alerts, call(), failText, () => this.refresh(), okText);
    }
  }

  async onAction(event: { action: string; row: AdminUserResponse }): Promise<void> {
    const u = event.row;
    const who = `${u.name} (${u.email})`;
    switch (event.action) {
      case 'edit':
        this.openForm(u);
        break;
      case 'password':
        openModal<boolean>(this.modal, AdminUserPasswordComponent, (ref) => (ref.componentInstance.user = u), () => this.refresh());
        break;
      case 'unlock':
        await this.confirmAndRun('Desbloquear', `¿Desbloquear a ${who}? Podrá intentar ingresar de nuevo enseguida.`, 'Desbloquear',
          () => this.users.unlock(u.id), 'No se pudo desbloquear.', 'Cuenta desbloqueada.');
        break;
      case 'mfa':
        await this.confirmAndRun('Restablecer verificación en dos pasos',
          `${who}: se borran su clave y sus códigos de recuperación y se cierran sus sesiones. En su próximo ingreso configurará la app de nuevo.`,
          'Restablecer', () => this.users.resetMfa(u.id), 'No se pudo restablecer la verificación.', 'Verificación restablecida.');
        break;
      case 'state':
        await this.confirmAndRun(u.isActive ? 'Desactivar administrador' : 'Activar administrador',
          u.isActive ? `¿Desactivar a ${who}? No podrá ingresar y se cerrarán sus sesiones.` : `¿Activar a ${who}? Podrá volver a ingresar.`,
          u.isActive ? 'Desactivar' : 'Activar', () => this.users.toggleStatus(u.id), 'No se pudo cambiar el estado.',
          u.isActive ? 'Administrador desactivado.' : 'Administrador activado.');
        break;
    }
  }
}
