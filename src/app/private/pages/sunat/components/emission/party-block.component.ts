import { Component, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { serverMessages } from '@shared/functions/list-helpers';
import { Option } from '../../models/sunat.models';
import { LOOKUP_DOC_TYPES } from '../../models/tenant-admin.models';
import { obj, str } from '../../models/tenant-views.models';
import { TenantAdminService } from '../../services/tenant-admin.service';
import { PARTY_DOC_OPTIONS, PartyValue } from './emission.models';

/**
 * Bloque de cliente / destinatario / remitente de un comprobante (reutilizable en corregir y, en la entrega 3, emitir):
 * tipo y número de documento, razón social y, si se pide, dirección. "Consultar" usa `GET tenants/{id}/buscar-documento`
 * (§11.9, `Admin.Documents.Issue`; cuenta en el límite de 20 por minuto del administrador) y solo se ofrece con `tenantId`
 * y `lookup`. Los errores llegan con las claves de la API (`cliente.num_doc`…), según `prefix`.
 */
@Component({
  selector: 'app-party-block',
  imports: [FormsModule],
  template: `
    <fieldset class="border rounded p-3 mb-3">
      <legend class="float-none w-auto px-2 fs-6 mb-0">{{ title() }}</legend>
      @if (err('')) {<div class="text-danger small mb-2">{{ err('') }}</div>}
      <div class="row g-2">
        <div class="col-md-4">
          <label class="form-label small" [for]="fid('tipo')">Tipo de documento <span class="erp-required">*</span></label>
          <select [id]="fid('tipo')" class="form-select form-select-sm" [disabled]="disabled()" [ngModel]="value().tipo_doc"
            (ngModelChange)="set('tipo_doc', $event)" [class.is-invalid]="!!err('tipo_doc')">
            <option [ngValue]="''">Elija…</option>
            @for (d of docTypes(); track d.id) {<option [ngValue]="d.id">{{ d.name }}</option>}
          </select>
          @if (err('tipo_doc')) {<div class="invalid-feedback">{{ err('tipo_doc') }}</div>}
        </div>
        <div class="col-md-8">
          <label class="form-label small" [for]="fid('num')">Número <span class="erp-required">*</span></label>
          <div class="input-group input-group-sm has-validation">
            <input [id]="fid('num')" class="form-control" maxlength="15" autocomplete="off" [disabled]="disabled()" [ngModel]="value().num_doc"
              (ngModelChange)="set('num_doc', $event)" [class.is-invalid]="!!err('num_doc')" />
            @if (canLookup()) {
            <button type="button" class="btn btn-outline-primary" [disabled]="disabled() || lookingUp()" (click)="doLookup()"
              title="Cliente de la empresa, SUNAT o RENIEC">
              @if (lookingUp()) {<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>} @else {<em class="feather icon-search me-1"></em>}Consultar
            </button>
            }
            @if (err('num_doc')) {<div class="invalid-feedback">{{ err('num_doc') }}</div>}
          </div>
          @if (lookupMsg(); as lm) {<div class="small mt-1" [class.text-success]="lm.ok" [class.text-danger]="!lm.ok">{{ lm.text }}</div>}
        </div>
        <div class="col-12">
          <label class="form-label small" [for]="fid('rs')">{{ nameLabel() }} <span class="erp-required">*</span></label>
          <input [id]="fid('rs')" class="form-control form-control-sm" maxlength="1500" [disabled]="disabled()" [ngModel]="value().razon_social"
            (ngModelChange)="set('razon_social', $event)" [class.is-invalid]="!!err('razon_social')" />
          @if (err('razon_social')) {<div class="invalid-feedback">{{ err('razon_social') }}</div>}
        </div>
        @if (showAddress()) {
        <div class="col-12">
          <label class="form-label small" [for]="fid('dir')">Dirección</label>
          <input [id]="fid('dir')" class="form-control form-control-sm" maxlength="500" [disabled]="disabled()" [ngModel]="value().direccion"
            (ngModelChange)="set('direccion', $event)" [class.is-invalid]="!!err('direccion')" />
          @if (err('direccion')) {<div class="invalid-feedback">{{ err('direccion') }}</div>}
        </div>
        }
      </div>
      @if (hint()) {<p class="form-text mb-0 mt-2">{{ hint() }}</p>}
    </fieldset>
  `
})
export class PartyBlockComponent {
  private admin = inject(TenantAdminService);

  /** Valor (two-way: `[(value)]`). */
  readonly value = model<PartyValue>({ tipo_doc: '6', num_doc: '', razon_social: '', direccion: '' });
  readonly title = input('Cliente');
  readonly nameLabel = input('Razón social o nombre');
  readonly docTypes = input<Option<string>[]>(PARTY_DOC_OPTIONS);
  readonly showAddress = input(true);
  /** Clave de los errores de la API (`cliente` → `cliente.num_doc`). */
  readonly prefix = input('cliente');
  readonly errors = input<Record<string, string>>({});
  readonly disabled = input(false);
  /** Empresa para "Consultar" (sin ella no se ofrece). */
  readonly tenantId = input<number | null>(null);
  /** El usuario tiene `Admin.Documents.Issue` (lo exige `buscar-documento`). */
  readonly lookup = input(false);
  readonly hint = input('');

  readonly lookingUp = signal(false);
  readonly lookupMsg = signal<{ ok: boolean; text: string } | null>(null);
  private readonly uid = Math.random().toString(36).substring(2, 8);

  fid(name: string): string {
    return `pb-${this.uid}-${name}`;
  }

  /** `''` = el error del bloque (`cliente`). */
  err(field: string): string {
    const e = this.errors();
    return field ? e[`${this.prefix()}.${field}`] ?? '' : e[this.prefix()] ?? '';
  }

  canLookup(): boolean {
    return this.lookup() && this.tenantId() != null && LOOKUP_DOC_TYPES.includes(this.value().tipo_doc);
  }

  set(field: keyof PartyValue, v: unknown): void {
    this.value.update((p) => ({ ...p, [field]: v == null ? '' : String(v) }));
  }

  /** Solo al pulsar "Consultar": completa la razón social y la dirección con lo que trae la API. */
  doLookup(): void {
    const n = this.value().num_doc.trim();
    if (!/^[A-Za-z0-9-]{8,15}$/.test(n)) {
      this.lookupMsg.set({ ok: false, text: 'Escriba de 8 a 15 caracteres para consultar.' });
      return;
    }
    this.lookingUp.set(true);
    this.lookupMsg.set(null);
    this.admin.lookupDocument(this.tenantId()!, this.value().tipo_doc, n).subscribe({
      next: (resp) => {
        this.lookingUp.set(false);
        if (resp.succeeded && resp.data) {
          const d = obj(resp.data);
          this.value.update((p) => ({
            ...p, razon_social: str(d['razon_social']) || p.razon_social, direccion: str(d['direccion']) || p.direccion
          }));
          const source = str(d['fuente'] ?? d['source']);
          const from = source === 'local' ? 'cliente de la empresa' : source ? source.toUpperCase() : '';
          this.lookupMsg.set({ ok: true, text: `${str(d['razon_social']) || 'Encontrado'}${from ? ` (${from})` : ''}.` });
        } else {
          this.lookupMsg.set({ ok: false, text: serverMessages(resp, 'No se encontró información para el documento ingresado.') });
        }
      },
      error: (err) => {
        this.lookingUp.set(false);
        this.lookupMsg.set({ ok: false, text: serverMessages(err?.error, 'No se pudo consultar el documento.') });
      }
    });
  }
}
