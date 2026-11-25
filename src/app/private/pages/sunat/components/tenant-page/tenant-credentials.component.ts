import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';
import { ReasonModalComponent, ReasonModalResult } from '@shared/components/reusables/reason-modal/reason-modal.component';
import { BaseResponse } from '@shared/models/base-api-response.interface';
import { openModal, serverMessages } from '@shared/functions/list-helpers';
import { isoToLima, ymdToDisplay } from '@shared/functions/lima-dates';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { PermissionService } from '@shared/service/permission.service';
import { CERTIFICATE_BADGE, PERM, certificateStatusName } from '../../models/sunat.models';
import { CERTIFICATE_MAX_BYTES, CredentialsStatus, fieldErrors } from '../../models/tenant-admin.models';
import { TenantAdminService } from '../../services/tenant-admin.service';
import { openApiCredentials } from '../common/api-credentials-modal.component';

type CredForm = 'sol' | 'gre' | 'cert';

/**
 * Pestaña Credenciales (§11.4), **de solo escritura**: `GET tenants/{id}/credenciales` trae solo indicadores y metadatos
 * (`Admin.Tenants.View`); nunca el usuario / clave SOL, el client_id / client_secret, el certificado ni su contraseña. Con
 * `Admin.Tenants.Credentials`: reemplazar usuario y clave SOL, client_id y client_secret de GRE (inputs vacíos, nunca
 * prellenados, se borran al guardar), subir el certificado (.pfx / .p12 + contraseña, `multipart/form-data`: `certificado`,
 * `contrasena_certificado`, `motivo`) y regenerar las credenciales API (motivo + confirmación → modal de una sola vez).
 */
@Component({
  selector: 'app-tenant-credentials',
  imports: [NgClass, FormsModule],
  template: `
    @if (loading()) {
    <div class="erp-loading py-3" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span>Cargando…</div>
    } @else if (loadError()) {
    <div class="alert alert-warning small">{{ loadError() }} <button type="button" class="btn btn-link btn-sm p-0 align-baseline" (click)="load()">Reintentar</button></div>
    } @else if (status(); as s) {
    <div class="erp-callout mb-3"><em class="feather icon-lock"></em>
      <span>Las credenciales son de solo escritura: el panel muestra si están registradas, nunca sus valores. Cada cambio queda en la auditoría (sin los valores).
        @if (!canWrite) { Su rol puede verlas pero no cambiarlas.}</span></div>

    <div class="row g-3">
      <div class="col-12 col-xl-6">
        <section class="erp-form-section h-100">
          <h6 class="erp-form-section__title"><em class="feather icon-check-square"></em>Estado</h6>
          <dl class="row small mb-0">
            <dt class="col-sm-6">Usuario SOL</dt><dd class="col-sm-6"><span class="badge" [ngClass]="flag(s.hasSolUser)">{{ yes(s.hasSolUser) }}</span></dd>
            <dt class="col-sm-6">Clave SOL</dt><dd class="col-sm-6"><span class="badge" [ngClass]="flag(s.hasSolPassword)">{{ yes(s.hasSolPassword) }}</span></dd>
            <dt class="col-sm-6">Client ID de GRE</dt><dd class="col-sm-6"><span class="badge" [ngClass]="flag(s.hasClientId)">{{ yes(s.hasClientId) }}</span></dd>
            <dt class="col-sm-6">Client secret de GRE</dt><dd class="col-sm-6"><span class="badge" [ngClass]="flag(s.hasClientSecret)">{{ yes(s.hasClientSecret) }}</span></dd>
            <dt class="col-sm-6">API key vigente</dt><dd class="col-sm-6 font-monospace">{{ s.apiKeyLast4 ? '…' + s.apiKeyLast4 : '—' }}</dd>
          </dl>
          @if (canWrite) {
          <div class="mt-3 pt-3 border-top">
            <button type="button" class="btn btn-outline-danger btn-sm" [disabled]="regenerating()" (click)="regenerate()">
              @if (regenerating()) {<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>} @else {<em class="feather icon-refresh-cw me-1"></em>}
              Regenerar credenciales API
            </button>
            <div class="form-text">Crea una api_key y un api_secret nuevos; los anteriores dejan de servir al instante. El secreto se muestra una sola vez.</div>
          </div>
          }
        </section>
      </div>
      <div class="col-12 col-xl-6">
        <section class="erp-form-section h-100">
          <h6 class="erp-form-section__title"><em class="feather icon-award"></em>Certificado digital</h6>
          @if (s.certificate; as c) {
          <div class="d-flex flex-wrap align-items-center gap-2 small mb-2">
            <span class="badge" [ngClass]="certBadge(c.status)">{{ certName(c.status) }}</span>
            @if (c.expiresOn) {<span>Vence el {{ ymd(c.expiresOn) }}@if (c.daysLeft !== null && c.daysLeft !== undefined) { ({{ c.daysLeft }} días)}</span>}
          </div>
          @if (c.message) {<p class="small text-muted">{{ c.message }}</p>}
          @if (c.present) {
          <dl class="row small mb-0">
            <dt class="col-sm-4">Titular</dt><dd class="col-sm-8 text-break">{{ c.subject || '—' }}</dd>
            <dt class="col-sm-4">Emisor</dt><dd class="col-sm-8 text-break">{{ c.issuer || '—' }}</dd>
            <dt class="col-sm-4">N.º de serie</dt><dd class="col-sm-8 font-monospace">{{ c.serialNumber || '—' }}</dd>
            <dt class="col-sm-4">Válido desde</dt><dd class="col-sm-8">{{ instant(c.validFrom) || '—' }}</dd>
            <dt class="col-sm-4">Válido hasta</dt><dd class="col-sm-8">{{ instant(c.validTo) || '—' }}</dd>
          </dl>
          }
          } @else {
          <p class="small text-muted mb-0">Sin datos del certificado.</p>
          }
        </section>
      </div>
    </div>

    @if (canWrite) {
    <div class="row g-3 mt-1">
      <div class="col-12 col-xl-4">
        <form class="erp-form-section h-100 erp-form" novalidate (ngSubmit)="saveSol()" autocomplete="off">
          <h6 class="erp-form-section__title"><em class="feather icon-user"></em>Usuario y clave SOL</h6>
          <p class="small text-muted">Usuario secundario de SUNAT Operaciones en Línea. Reemplaza los guardados. En SUNAT puede tardar hasta 24 horas en activarse.</p>
          <label class="form-label" for="cr-sol-user">Usuario SOL <span class="erp-required">*</span></label>
          <input id="cr-sol-user" class="form-control mb-2" name="sol_user" [(ngModel)]="solUser" maxlength="50" autocomplete="off" spellcheck="false"
            [class.is-invalid]="!!err('sol', 'sol_user')" />
          @if (err('sol', 'sol_user')) {<div class="invalid-feedback mb-2">{{ err('sol', 'sol_user') }}</div>}
          <label class="form-label" for="cr-sol-pass">Clave SOL <span class="erp-required">*</span></label>
          <input id="cr-sol-pass" type="password" class="form-control mb-2" name="sol_pass" [(ngModel)]="solPass" maxlength="50" autocomplete="new-password"
            [class.is-invalid]="!!err('sol', 'sol_pass')" />
          @if (err('sol', 'sol_pass')) {<div class="invalid-feedback mb-2">{{ err('sol', 'sol_pass') }}</div>}
          <label class="form-label" for="cr-sol-motivo">Motivo (opcional)</label>
          <input id="cr-sol-motivo" class="form-control mb-3" name="sol_motivo" [(ngModel)]="solMotivo" maxlength="400" placeholder="Ej.: la empresa cambió su clave SOL" />
          <button type="submit" class="btn btn-primary btn-sm" [disabled]="saving() === 'sol'">
            @if (saving() === 'sol') {<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>}Guardar usuario y clave SOL
          </button>
        </form>
      </div>
      <div class="col-12 col-xl-4">
        <form class="erp-form-section h-100 erp-form" novalidate (ngSubmit)="saveGre()" autocomplete="off">
          <h6 class="erp-form-section__title"><em class="feather icon-truck"></em>Credenciales GRE (API REST de SUNAT)</h6>
          <p class="small text-muted">client_id y client_secret que da SUNAT: los usan las guías de remisión y la consulta CPE. Reemplazan los guardados.</p>
          <label class="form-label" for="cr-gre-id">Client ID <span class="erp-required">*</span></label>
          <input id="cr-gre-id" class="form-control mb-2" name="client_id" [(ngModel)]="clientId" maxlength="100" autocomplete="off" spellcheck="false"
            [class.is-invalid]="!!err('gre', 'client_id')" />
          @if (err('gre', 'client_id')) {<div class="invalid-feedback mb-2">{{ err('gre', 'client_id') }}</div>}
          <label class="form-label" for="cr-gre-secret">Client secret <span class="erp-required">*</span></label>
          <input id="cr-gre-secret" type="password" class="form-control mb-2" name="client_secret" [(ngModel)]="clientSecret" maxlength="255"
            autocomplete="new-password" [class.is-invalid]="!!err('gre', 'client_secret')" />
          @if (err('gre', 'client_secret')) {<div class="invalid-feedback mb-2">{{ err('gre', 'client_secret') }}</div>}
          <label class="form-label" for="cr-gre-motivo">Motivo (opcional)</label>
          <input id="cr-gre-motivo" class="form-control mb-3" name="gre_motivo" [(ngModel)]="greMotivo" maxlength="400" placeholder="Ej.: alta de credenciales GRE" />
          <button type="submit" class="btn btn-primary btn-sm" [disabled]="saving() === 'gre'">
            @if (saving() === 'gre') {<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>}Guardar credenciales GRE
          </button>
        </form>
      </div>
      <div class="col-12 col-xl-4">
        <form class="erp-form-section h-100 erp-form" novalidate (ngSubmit)="saveCert()" autocomplete="off">
          <h6 class="erp-form-section__title"><em class="feather icon-upload"></em>Certificado digital</h6>
          <p class="small text-muted">Archivo .pfx o .p12 con la clave privada (máx. 100 KB). La contraseña solo abre el archivo: no se guarda.</p>
          <label class="form-label" for="cr-cert-file">Archivo <span class="erp-required">*</span></label>
          <input id="cr-cert-file" type="file" class="form-control mb-2" accept=".pfx,.p12,application/x-pkcs12" (change)="pickCert($event)"
            [class.is-invalid]="!!err('cert', 'certificado')" />
          @if (err('cert', 'certificado')) {<div class="invalid-feedback mb-2">{{ err('cert', 'certificado') }}</div>}
          <label class="form-label" for="cr-cert-pass">Contraseña del certificado <span class="erp-required">*</span></label>
          <input id="cr-cert-pass" type="password" class="form-control mb-2" name="contrasena_certificado" [(ngModel)]="certPass" autocomplete="new-password"
            [class.is-invalid]="!!err('cert', 'contrasena_certificado')" />
          @if (err('cert', 'contrasena_certificado')) {<div class="invalid-feedback mb-2">{{ err('cert', 'contrasena_certificado') }}</div>}
          <label class="form-label" for="cr-cert-motivo">Motivo (opcional)</label>
          <input id="cr-cert-motivo" class="form-control mb-3" name="cert_motivo" [(ngModel)]="certMotivo" maxlength="400" placeholder="Ej.: renovación del certificado" />
          <button type="submit" class="btn btn-primary btn-sm" [disabled]="saving() === 'cert'">
            @if (saving() === 'cert') {<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>}Subir certificado
          </button>
        </form>
      </div>
    </div>
    }
    }
  `
})
export class TenantCredentialsComponent implements OnInit {
  private admin = inject(TenantAdminService);
  private alerts = inject(AlertModalService);
  private modal = inject(NgbModal);
  private perms = inject(PermissionService);

  readonly tenantId = input.required<number>();
  readonly tenantLabel = input('');
  readonly ruc = input('');
  /** Algo cambió (credenciales, certificado): la página recarga la cabecera y la configuración. */
  readonly changed = output<void>();

  readonly canWrite = this.perms.hasPermission(PERM.tenantsCredentials);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly status = signal<CredentialsStatus | null>(null);
  readonly saving = signal<CredForm | ''>('');
  readonly regenerating = signal(false);
  readonly errors = signal<Record<CredForm, Record<string, string>>>({ sol: {}, gre: {}, cert: {} });

  // Valores de los formularios: solo mientras se escriben; se borran al guardar. Nunca se prellenan.
  solUser = '';
  solPass = '';
  solMotivo = '';
  clientId = '';
  clientSecret = '';
  greMotivo = '';
  certPass = '';
  certMotivo = '';
  certInputRef: HTMLInputElement | null = null;
  private certFile: File | null = null;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.admin.credentials(this.tenantId()).subscribe({
      next: (resp) => {
        if (resp.succeeded && resp.data) {
          this.status.set(resp.data as CredentialsStatus);
        } else {
          this.loadError.set(serverMessages(resp, 'No se pudo cargar el estado de las credenciales.'));
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(serverMessages(err?.error, 'No se pudo cargar el estado de las credenciales.'));
        this.loading.set(false);
      }
    });
  }

  err(form: CredForm, key: string): string {
    return this.errors()[form][key] ?? '';
  }

  yes(v: boolean): string {
    return v ? 'Registrado' : 'Sin registrar';
  }

  flag(v: boolean): string {
    return v ? 'badge-light-success' : 'badge-light-secondary';
  }

  ymd(v?: string | null): string {
    return ymdToDisplay(v);
  }

  instant(v?: string | null): string {
    return v ? isoToLima(v) : '';
  }

  certName(status?: string | null): string {
    return status === 'SIN_CERTIFICADO' || !status ? 'Sin certificado' : certificateStatusName(status);
  }

  certBadge(status?: string | null): string {
    return CERTIFICATE_BADGE[status ?? ''] ?? 'badge-light-secondary';
  }

  private setErrors(form: CredForm, e: Record<string, string>): void {
    this.errors.update((all) => ({ ...all, [form]: e }));
  }

  saveSol(): void {
    const e: Record<string, string> = {};
    if (!this.solUser.trim()) {
      e['sol_user'] = 'Indique el usuario SOL.';
    }
    if (!this.solPass) {
      e['sol_pass'] = 'Indique la clave SOL.';
    }
    this.setErrors('sol', e);
    if (Object.keys(e).length) {
      return;
    }
    this.submit('sol', this.admin.setSol(this.tenantId(), { sol_user: this.solUser.trim(), sol_pass: this.solPass, ...motivo(this.solMotivo) }),
      'Usuario y clave SOL guardados.', () => {
        this.solUser = '';
        this.solPass = '';
        this.solMotivo = '';
      });
  }

  saveGre(): void {
    const e: Record<string, string> = {};
    if (!this.clientId.trim()) {
      e['client_id'] = 'Indique el client_id.';
    }
    if (!this.clientSecret) {
      e['client_secret'] = 'Indique el client_secret.';
    }
    this.setErrors('gre', e);
    if (Object.keys(e).length) {
      return;
    }
    this.submit('gre', this.admin.setGre(this.tenantId(), { client_id: this.clientId.trim(), client_secret: this.clientSecret, ...motivo(this.greMotivo) }),
      'Credenciales de GRE guardadas.', () => {
        this.clientId = '';
        this.clientSecret = '';
        this.greMotivo = '';
      });
  }

  pickCert(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.certInputRef = input;
    const f = input.files?.[0] ?? null;
    this.certFile = null;
    const e: Record<string, string> = {};
    if (f) {
      if (!/\.(pfx|p12)$/i.test(f.name)) {
        e['certificado'] = 'El certificado debe ser un archivo .pfx o .p12.';
      } else if (f.size > CERTIFICATE_MAX_BYTES) {
        e['certificado'] = 'El certificado no debe superar los 100 KB.';
      } else {
        this.certFile = f;
      }
    }
    this.setErrors('cert', e);
    if (e['certificado']) {
      input.value = '';
    }
  }

  saveCert(): void {
    const e: Record<string, string> = {};
    if (!this.certFile) {
      e['certificado'] = this.err('cert', 'certificado') || 'Elija el archivo .pfx o .p12.';
    }
    if (!this.certPass) {
      e['contrasena_certificado'] = 'La contraseña del certificado es obligatoria.';
    }
    this.setErrors('cert', e);
    if (Object.keys(e).length) {
      return;
    }
    this.submit('cert', this.admin.uploadCertificate(this.tenantId(), this.certFile!, this.certPass, this.certMotivo.trim()), 'Certificado actualizado.', () => {
      this.certPass = '';
      this.certMotivo = '';
      this.certFile = null;
      if (this.certInputRef) {
        this.certInputRef.value = '';
      }
    });
  }

  private submit(form: CredForm, call: Observable<BaseResponse>, okText: string, clear: () => void): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(form);
    call.subscribe({
      next: async (resp) => {
        if (resp.succeeded) {
          clear();
          if (resp.data) {
            this.status.set(resp.data as CredentialsStatus);
          }
          this.saving.set('');
          this.changed.emit();
          await this.alerts.showNotification('Listo', serverMessages(resp, okText), 'success');
        } else {
          this.setErrors(form, fieldErrors(resp));
          this.saving.set('');
          await this.alerts.showNotification('Atención', serverMessages(resp, 'No se pudo guardar.'), 'warning');
        }
      },
      error: async (err) => {
        this.setErrors(form, fieldErrors(err?.error));
        this.saving.set('');
        await this.alerts.showNotification('Error', serverMessages(err?.error, 'No se pudo guardar.'), 'danger');
      }
    });
  }

  /** Motivo obligatorio + confirmación; la respuesta va directo al modal de una sola vez (no se guarda). */
  regenerate(): void {
    openModal<ReasonModalResult>(this.modal, ReasonModalComponent, (ref) => Object.assign(ref.componentInstance, {
      title: 'Regenerar credenciales API', icon: 'icon-refresh-cw', confirmText: 'Continuar', confirmClass: 'btn-danger',
      description: `${this.tenantLabel()}. Se crean una api_key y un api_secret nuevos y los anteriores dejan de servir de inmediato: `
        + 'todos los sistemas de la empresa que usan la API dejarán de emitir hasta que se configuren con las nuevas.',
      placeholder: 'Por qué se regeneran (queda en la auditoría)'
    }), async (r) => {
      const ok = await this.alerts.show({
        title: '¿Regenerar ahora?', type: 'warning', showCancel: true, confirmText: 'Regenerar', cancelText: 'Cancelar',
        message: 'Las credenciales actuales dejarán de funcionar en este momento. Esta acción no se puede deshacer.'
      });
      if (ok) {
        this.doRegenerate(r.reason);
      }
    });
  }

  private doRegenerate(reason: string): void {
    this.regenerating.set(true);
    this.admin.regenerate(this.tenantId(), reason).subscribe({
      next: async (resp) => {
        this.regenerating.set(false);
        const d = (resp.data ?? {}) as { apiKey?: string; apiSecret?: string; aviso?: string };
        if (resp.succeeded && d.apiKey && d.apiSecret) {
          this.changed.emit();
          openApiCredentials(this.modal, { title: 'Credenciales regeneradas', tenantLabel: this.tenantLabel(), ruc: this.ruc(), apiKey: d.apiKey,
            apiSecret: d.apiSecret, aviso: d.aviso }, () => this.load());
        } else if (resp.succeeded) {
          this.load();
          await this.alerts.showNotification('Atención', 'Se regeneraron, pero la respuesta no trajo los valores. Vuelva a regenerarlas.', 'warning');
        } else {
          await this.alerts.showNotification('Atención', serverMessages(resp, 'No se pudieron regenerar las credenciales.'), 'warning');
        }
      },
      error: async (err) => {
        this.regenerating.set(false);
        await this.alerts.showNotification('Error', serverMessages(err?.error, 'No se pudieron regenerar las credenciales.'), 'danger');
      }
    });
  }
}

function motivo(value: string): { motivo?: string } {
  const t = (value ?? '').trim();
  return t ? { motivo: t } : {};
}
