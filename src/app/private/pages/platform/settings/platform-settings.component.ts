import { Component, WritableSignal, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { PermissionService } from '@shared/service/permission.service';
import { formatNumber, serverMessages } from '@shared/functions/list-helpers';
import { isoToLima } from '@shared/functions/lima-dates';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { Observable } from 'rxjs';
import { PERM } from '../../sunat/models/sunat.models';
import { PlatformSettings } from '../models/platform.models';
import { PlatformSettingsService } from '../services/platform.services';

/** Token de consulta: 8–1000 caracteres imprimibles, sin espacios (§10.6). */
const TOKEN = /^[\x21-\x7E]{8,1000}$/;

const SOURCE_NAMES: Record<string, string> = {
  panel: 'Guardado en el panel (cifrado)',
  environment: 'Variable del despliegue (LOOKUP_API_TOKEN)',
  none: 'Sin token'
};

/**
 * Configuración de emisión (`/private/platform/settings`, `Admin.Settings.View`; cambiarla es solo de superadmin,
 * `Admin.Settings.Manage`, §10.6):
 * - Emisión ilimitada global (cambia el cobro de todas las empresas; encenderla o apagarla exige motivo) y empresas nuevas
 *   ilimitadas. La variable `EMISION_ILIMITADA_GLOBAL` del despliegue se muestra y no se puede apagar desde aquí.
 * - Token de consulta RUC / DNI: de solo escritura. Se puede configurar, reemplazar o eliminar; nunca vuelve (solo
 *   `configured`, el origen y, si la API lo da, los 4 últimos caracteres).
 */
@Component({
  selector: 'app-platform-settings',
  imports: [NgClass, FormsModule, PageHeaderComponent],
  template: `
    <div class="row btn-page">
      <div class="col-lg-11 col-xl-9">
        <div class="card">
          <app-page-header icon="icon-sliders" title="CONFIGURACIÓN DE EMISIÓN" subtitle="Ajustes globales de la plataforma que afectan a todas las empresas"
            help="Solo un superadministrador puede cambiarla. Cada cambio queda en la auditoría (el token nunca).">
            <button headerActions type="button" class="btn btn-light" [disabled]="loading()" (click)="load()"><em class="feather icon-refresh-cw"></em>ACTUALIZAR</button>
          </app-page-header>
          <div class="card-body">
            @if (loading() && !settings()) {
            <div class="erp-loading" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Cargando…</div>
            } @else if (error()) {
            <div class="alert alert-warning mb-0">{{ error() }}</div>
            } @else if (settings(); as s) {
            @if (!canManage) {
            <div class="erp-callout mb-3" role="note"><em class="feather icon-lock" aria-hidden="true"></em>
              <div>Solo lectura: cambiar esta configuración es de un superadministrador.</div></div>
            }

            <div class="row g-2 mb-3">
              <div class="col-sm-4"><div class="border rounded p-2 h-100"><div class="small text-muted">Empresas</div>
                <div class="fs-5 fw-semibold text-primary">{{ n(s.stats.tenantsTotal) }}</div></div></div>
              <div class="col-sm-4"><div class="border rounded p-2 h-100"><div class="small text-muted">Con emisión ilimitada</div>
                <div class="fs-5 fw-semibold text-primary">{{ n(s.stats.tenantsUnlimited) }}</div></div></div>
              <div class="col-sm-4"><div class="border rounded p-2 h-100"><div class="small text-muted">Según su plan</div>
                <div class="fs-5 fw-semibold text-primary">{{ n(s.stats.tenantsPlan) }}</div></div></div>
            </div>

            <section class="erp-form-section">
              <h6 class="erp-form-section__title"><em class="feather icon-zap"></em>Emisión</h6>
              <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
                <span class="small text-muted">Emisión ilimitada global en efecto:</span>
                <span class="badge" [ngClass]="s.emission.globalUnlimitedEffective ? 'badge-light-warning' : 'badge-light-success'">
                  {{ s.emission.globalUnlimitedEffective ? 'SÍ: NINGUNA EMPRESA TIENE LÍMITE' : 'NO: CADA EMPRESA SEGÚN SU PLAN O SU MODO' }}</span>
              </div>
              @if (s.emission.globalUnlimitedByEnvironment) {
              <div class="alert alert-warning small" role="note">La variable <code>EMISION_ILIMITADA_GLOBAL</code> del despliegue está encendida: la emisión
                es ilimitada para todas las empresas aunque aquí se apague. Solo se cambia en el servidor.</div>
              }
              <form class="erp-form" novalidate (ngSubmit)="saveEmission()">
                <div class="form-check form-switch mb-1">
                  <input id="set-global" class="form-check-input" type="checkbox" role="switch" name="globalUnlimited" [(ngModel)]="globalUnlimited"
                    [disabled]="!canManage || saving()" />
                  <label class="form-check-label" for="set-global">Emisión ilimitada para todas las empresas</label>
                </div>
                <p class="form-text mt-0 mb-3">Ninguna empresa queda limitada por su plan mientras esté encendida (cambia el cobro de todas). Encenderla o apagarla
                  pide un motivo.</p>
                <div class="form-check form-switch mb-1">
                  <input id="set-new" class="form-check-input" type="checkbox" role="switch" name="newTenantsUnlimited" [(ngModel)]="newTenantsUnlimited"
                    [disabled]="!canManage || saving()" />
                  <label class="form-check-label" for="set-new">Empresas nuevas con emisión ilimitada</label>
                </div>
                <p class="form-text mt-0 mb-3">Se guarda y se muestra; lo aplicará el alta de empresas desde el panel (aún no disponible). El registro público y el
                  bridge no cambian.</p>
                @if (globalChanged()) {
                <div class="mb-3">
                  <label class="form-label" for="set-motivo">Motivo del cambio de la emisión global <span class="erp-required">*</span></label>
                  <textarea id="set-motivo" class="form-control" rows="2" maxlength="400" name="motivo" [(ngModel)]="motivo" [disabled]="saving()"
                    [class.is-invalid]="motivoMissing()" placeholder="Queda registrado en la auditoría"></textarea>
                  @if (motivoMissing()) {<div class="invalid-feedback">Indique el motivo.</div>}
                </div>
                }
                <div class="d-flex flex-wrap align-items-center gap-2">
                  @if (canManage) {
                  <button type="submit" class="btn btn-primary btn-sm" [disabled]="saving() || !emissionChanged()">
                    @if (saving()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
                    Guardar emisión
                  </button>
                  }
                  <span class="small text-muted">Último cambio: {{ s.emission.updatedAt ? when(s.emission.updatedAt) : 'nunca se guardó' }}</span>
                </div>
              </form>
            </section>

            <section class="erp-form-section mb-0">
              <h6 class="erp-form-section__title"><em class="feather icon-key"></em>Token de consulta RUC / DNI</h6>
              <div class="erp-doc__grid mb-3">
                <div><span class="erp-doc__label">Estado</span>
                  <span class="badge" [ngClass]="s.lookupToken.configured ? 'badge-light-success' : 'badge-light-secondary'">{{ s.lookupToken.configured ? 'CONFIGURADO' : 'SIN TOKEN' }}</span></div>
                <div><span class="erp-doc__label">Origen</span><span class="erp-doc__value">{{ sourceName(s.lookupToken.source) }}</span></div>
                @if (s.lookupToken.last4) {<div><span class="erp-doc__label">Termina en</span><span class="erp-doc__value">…{{ s.lookupToken.last4 }}</span></div>}
                @if (s.lookupToken.updatedAt) {<div><span class="erp-doc__label">Guardado</span><span class="erp-doc__value">{{ when(s.lookupToken.updatedAt) }}</span></div>}
              </div>
              <p class="small text-muted">Lo usa la consulta de RUC / DNI de la API antes que la variable <code>LOOKUP_API_TOKEN</code>. Se guarda cifrado y
                <strong>nunca se vuelve a mostrar</strong>: para cambiarlo, escriba uno nuevo.</p>
              @if (canManage) {
              <form class="erp-form" novalidate (ngSubmit)="saveToken()" autocomplete="off">
                <div class="row g-2 align-items-end">
                  <div class="col-md-8">
                    <label class="form-label" for="set-token">{{ s.lookupToken.source === 'panel' ? 'Reemplazar el token' : 'Nuevo token' }}</label>
                    <input id="set-token" type="password" class="form-control" name="token" [(ngModel)]="token" maxlength="1000" autocomplete="new-password"
                      spellcheck="false" [class.is-invalid]="tokenInvalid()" [disabled]="savingToken()" />
                    @if (tokenInvalid()) {<div class="invalid-feedback">De 8 a 1000 caracteres, sin espacios.</div>}
                  </div>
                  <div class="col-md-4 d-flex gap-2">
                    <button type="submit" class="btn btn-primary btn-sm" [disabled]="savingToken() || !token">
                      @if (savingToken()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
                      Guardar token
                    </button>
                    @if (s.lookupToken.source === 'panel') {
                    <button type="button" class="btn btn-outline-danger btn-sm" [disabled]="savingToken()" (click)="clearToken()">Eliminar</button>
                    }
                  </div>
                </div>
              </form>
              }
            </section>
            }
          </div>
        </div>
      </div>
    </div>
  `
})
export class PlatformSettingsComponent {
  private service = inject(PlatformSettingsService);
  private alerts = inject(AlertModalService);
  private perms = inject(PermissionService);

  readonly canManage = this.perms.hasPermission(PERM.settingsManage);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly settings = signal<PlatformSettings | null>(null);
  readonly saving = signal(false);
  readonly savingToken = signal(false);
  readonly submitted = signal(false);
  readonly tokenSubmitted = signal(false);

  globalUnlimited = false;
  newTenantsUnlimited = false;
  motivo = '';
  token = '';

  constructor() {
    inject(CustomTitleService).set('Configuración de emisión');
    this.load();
  }

  n(value?: number | null): string {
    return formatNumber(value ?? 0);
  }

  when(value: string): string {
    return isoToLima(value);
  }

  sourceName(source: string): string {
    return SOURCE_NAMES[source] ?? source;
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service.get().subscribe({
      next: (resp) => {
        this.loading.set(false);
        if (resp.succeeded && resp.data) {
          this.apply(resp.data as PlatformSettings);
        } else {
          this.error.set(serverMessages(resp, 'No se pudo cargar la configuración.'));
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(serverMessages(err?.error, 'No se pudo cargar la configuración.'));
      }
    });
  }

  private apply(s: PlatformSettings): void {
    this.settings.set(s);
    this.globalUnlimited = !!s.emission?.globalUnlimited;
    this.newTenantsUnlimited = !!s.emission?.newTenantsUnlimited;
    this.motivo = '';
    this.submitted.set(false);
  }

  globalChanged(): boolean {
    return this.globalUnlimited !== !!this.settings()?.emission?.globalUnlimited;
  }

  emissionChanged(): boolean {
    return this.globalChanged() || this.newTenantsUnlimited !== !!this.settings()?.emission?.newTenantsUnlimited;
  }

  motivoMissing(): boolean {
    return this.submitted() && this.globalChanged() && !this.motivo.trim();
  }

  tokenInvalid(): boolean {
    return this.tokenSubmitted() && !TOKEN.test(this.token);
  }

  /** Aplica la respuesta (la configuración actualizada) y avisa. */
  private run(call: Observable<BaseResponse>, busy: WritableSignal<boolean>, failText: string, okText: string, done?: () => void): void {
    busy.set(true);
    call.subscribe({
      next: async (resp) => {
        busy.set(false);
        if (resp.succeeded) {
          if (resp.data) {
            this.apply(resp.data as PlatformSettings);
          } else {
            this.load();
          }
          done?.();
          await this.alerts.showNotification('Listo', serverMessages(resp, okText), 'success');
        } else {
          await this.alerts.showNotification('Atención', serverMessages(resp, failText), 'warning');
        }
      },
      error: async (err) => {
        busy.set(false);
        await this.alerts.showNotification('Error', serverMessages(err?.error, failText), 'danger');
      }
    });
  }

  async saveEmission(): Promise<void> {
    this.submitted.set(true);
    if (!this.canManage || this.saving() || !this.emissionChanged() || this.motivoMissing()) {
      return;
    }
    if (this.globalChanged()) {
      const ok = await this.alerts.show({
        title: this.globalUnlimited ? 'Encender la emisión ilimitada global' : 'Apagar la emisión ilimitada global', type: 'warning', showCancel: true,
        confirmText: this.globalUnlimited ? 'Encender' : 'Apagar',
        message: this.globalUnlimited
          ? 'Todas las empresas podrán emitir sin el límite de su plan (cambia el cobro de todas). ¿Continuar?'
          : 'Las empresas vuelven a su plan o a su modo de emisión (las que superaron su límite dejarán de emitir). ¿Continuar?'
      });
      if (!ok) {
        return;
      }
    }
    this.run(this.service.updateEmission({
      globalUnlimited: this.globalUnlimited, newTenantsUnlimited: this.newTenantsUnlimited, motivo: this.globalChanged() ? this.motivo.trim() : null
    }), this.saving, 'No se pudo guardar la configuración de emisión.', 'Configuración de emisión actualizada.');
  }

  saveToken(): void {
    this.tokenSubmitted.set(true);
    if (!this.canManage || this.savingToken() || !TOKEN.test(this.token)) {
      return;
    }
    const token = this.token;
    this.run(this.service.setLookupToken(token), this.savingToken, 'No se pudo guardar el token.', 'Token de consulta guardado.', () => {
      // Nunca se conserva en pantalla.
      this.token = '';
      this.tokenSubmitted.set(false);
    });
  }

  async clearToken(): Promise<void> {
    const ok = await this.alerts.show({
      title: 'Eliminar el token de consulta', type: 'warning', showCancel: true, confirmText: 'Eliminar',
      message: 'La consulta de RUC / DNI usará la variable LOOKUP_API_TOKEN del despliegue, si existe; si no, no tendrá token. ¿Continuar?'
    });
    if (ok) {
      this.run(this.service.clearLookupToken(), this.savingToken, 'No se pudo eliminar el token.', 'Token de consulta eliminado.', () => (this.token = ''));
    }
  }
}
