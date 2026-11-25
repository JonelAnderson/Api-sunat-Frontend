import { Component, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { openModal } from '@shared/functions/list-helpers';
import { Option } from '../../models/sunat.models';
import { money } from '../../models/tenant-views.models';
import {
  ESTIMATE_IGV_RATE, EmissionItem, IGV_AFFECTATION_OPTIONS, ItemField, SALE_ITEM_FIELDS, UNIT_OPTIONS, emptyItem, isSunatCodeField, lineEstimate,
  totalsPreview
} from './emission.models';
import { ProductSunatChoice, ProductSunatModalComponent } from './product-sunat-modal.component';

/**
 * Grilla de ítems de un comprobante (corregir un rechazado y emitir). Columnas según `fields`: código, código de producto
 * SUNAT (con buscador del catálogo 25), descripción, unidad, cantidad, precio con IGV o valor sin IGV (liquidación),
 * descuento % y afectación del IGV; agregar, quitar y editar en la misma fila. Los errores llegan con las claves de la API
 * (`items.0.cantidad`, o `items` para la lista) y se muestran en su celda. Con precio o valor, el pie muestra una **vista
 * previa** de los totales por afectación con la tasa de la empresa (`rate`, en %): los totales oficiales los calcula la API.
 */
@Component({
  selector: 'app-item-grid',
  imports: [FormsModule],
  template: `
    <datalist [id]="listId('units')">
      @for (u of units; track u.id) {<option [value]="u.id">{{ u.name }}</option>}
    </datalist>
    @if (errors()[prefix()]) {<div class="alert alert-danger py-1 px-2 small mb-2">{{ errors()[prefix()] }}</div>}
    <div class="table-responsive">
      <table class="table table-sm align-top small mb-2">
        <thead>
          <tr>
            <th scope="col" class="text-muted" style="width: 2rem">#</th>
            @if (has('codigo')) {<th scope="col" style="min-width: 7rem">Código</th>}
            @if (codeField()) {<th scope="col" style="min-width: 9rem">Cód. SUNAT @if (sunatCodeRequired()) {<span class="erp-required">*</span>}</th>}
            @if (has('descripcion')) {<th scope="col" style="min-width: 14rem">Descripción <span class="erp-required">*</span></th>}
            @if (has('unidad')) {<th scope="col" style="min-width: 6rem">Unidad <span class="erp-required">*</span></th>}
            @if (has('cantidad')) {<th scope="col" class="text-end" style="min-width: 6rem">Cantidad <span class="erp-required">*</span></th>}
            @if (has('precio_unitario')) {<th scope="col" class="text-end" style="min-width: 7rem">Precio unit. (con IGV) <span class="erp-required">*</span></th>}
            @if (has('valor_unitario')) {<th scope="col" class="text-end" style="min-width: 7rem">Valor unit. (sin IGV) <span class="erp-required">*</span></th>}
            @if (has('descuento_pct')) {<th scope="col" class="text-end" style="min-width: 5rem">Desc. %</th>}
            @if (has('tip_afe_igv')) {<th scope="col" style="min-width: 9rem">IGV <span class="erp-required">*</span></th>}
            @if (priced()) {<th scope="col" class="text-end">Importe</th>}
            @if (!disabled() && allowRemove()) {<th scope="col"><span class="visually-hidden">Quitar</span></th>}
          </tr>
        </thead>
        <tbody>
          @for (it of items(); track it.key; let i = $index) {
          <tr>
            <td class="text-muted pt-2">{{ i + 1 }}</td>
            @if (has('codigo')) {
            <td>
              <input class="form-control form-control-sm" [attr.aria-label]="'Código del ítem ' + (i + 1)" maxlength="30" [disabled]="off('codigo')"
                [ngModel]="it.codigo" (ngModelChange)="set(i, 'codigo', $event)" [class.is-invalid]="!!err(i, 'codigo')" />
              @if (err(i, 'codigo')) {<div class="invalid-feedback">{{ err(i, 'codigo') }}</div>}
            </td>
            }
            @if (codeField(); as cf) {
            <td>
              <div class="input-group input-group-sm has-validation">
                <input class="form-control" [attr.aria-label]="'Código de producto SUNAT del ítem ' + (i + 1)" maxlength="8" inputmode="numeric"
                  [disabled]="off(cf)" [ngModel]="it.cod_sunat" (ngModelChange)="setCode(i, $event)" [class.is-invalid]="!!err(i, cf)" />
                @if (!off(cf)) {
                <button type="button" class="btn btn-outline-secondary px-2" (click)="findCode(i)" [attr.aria-label]="'Buscar el código SUNAT del ítem ' + (i + 1)"
                  title="Buscar en el catálogo 25 de SUNAT"><em class="feather icon-search"></em></button>
                }
                @if (err(i, cf)) {<div class="invalid-feedback">{{ err(i, cf) }}</div>}
              </div>
            </td>
            }
            @if (has('descripcion')) {
            <td>
              <input class="form-control form-control-sm" [attr.aria-label]="'Descripción del ítem ' + (i + 1)" maxlength="500" [disabled]="off('descripcion')"
                [ngModel]="it.descripcion" (ngModelChange)="set(i, 'descripcion', $event)" [class.is-invalid]="!!err(i, 'descripcion')" />
              @if (err(i, 'descripcion')) {<div class="invalid-feedback">{{ err(i, 'descripcion') }}</div>}
            </td>
            }
            @if (has('unidad')) {
            <td>
              <input class="form-control form-control-sm text-uppercase" [attr.list]="listId('units')" [attr.aria-label]="'Unidad del ítem ' + (i + 1)"
                maxlength="10" [disabled]="off('unidad')" [ngModel]="it.unidad" (ngModelChange)="set(i, 'unidad', ($event || '').toUpperCase())"
                [class.is-invalid]="!!err(i, 'unidad')" />
              @if (err(i, 'unidad')) {<div class="invalid-feedback">{{ err(i, 'unidad') }}</div>}
            </td>
            }
            @if (has('cantidad')) {
            <td>
              <input type="number" min="0" step="any" class="form-control form-control-sm text-end" [attr.aria-label]="'Cantidad del ítem ' + (i + 1)"
                [disabled]="off('cantidad')" [ngModel]="it.cantidad" (ngModelChange)="set(i, 'cantidad', numOrNull($event))" [class.is-invalid]="!!err(i, 'cantidad')" />
              @if (err(i, 'cantidad')) {<div class="invalid-feedback">{{ err(i, 'cantidad') }}</div>}
            </td>
            }
            @if (has('precio_unitario')) {
            <td>
              <input type="number" min="0" step="any" class="form-control form-control-sm text-end" [attr.aria-label]="'Precio del ítem ' + (i + 1)"
                [disabled]="off('precio_unitario')" [ngModel]="it.precio_unitario" (ngModelChange)="set(i, 'precio_unitario', numOrNull($event))"
                [class.is-invalid]="!!err(i, 'precio_unitario')" />
              @if (err(i, 'precio_unitario')) {<div class="invalid-feedback">{{ err(i, 'precio_unitario') }}</div>}
            </td>
            }
            @if (has('valor_unitario')) {
            <td>
              <input type="number" min="0" step="any" class="form-control form-control-sm text-end" [attr.aria-label]="'Valor unitario del ítem ' + (i + 1)"
                [disabled]="off('valor_unitario')" [ngModel]="it.valor_unitario" (ngModelChange)="set(i, 'valor_unitario', numOrNull($event))"
                [class.is-invalid]="!!err(i, 'valor_unitario')" />
              @if (err(i, 'valor_unitario')) {<div class="invalid-feedback">{{ err(i, 'valor_unitario') }}</div>}
            </td>
            }
            @if (has('descuento_pct')) {
            <td>
              <input type="number" min="0" max="100" step="any" class="form-control form-control-sm text-end" [attr.aria-label]="'Descuento del ítem ' + (i + 1)"
                [disabled]="off('descuento_pct')" [ngModel]="it.descuento_pct" (ngModelChange)="set(i, 'descuento_pct', numOrNull($event))"
                [class.is-invalid]="!!err(i, 'descuento_pct') || !!errors()[prefix() + '.' + i + '.descuentos']" />
              @if (err(i, 'descuento_pct') || errors()[prefix() + '.' + i + '.descuentos']) {
              <div class="invalid-feedback">{{ err(i, 'descuento_pct') || errors()[prefix() + '.' + i + '.descuentos'] }}</div>
              }
            </td>
            }
            @if (has('tip_afe_igv')) {
            <td>
              <select class="form-select form-select-sm" [attr.aria-label]="'Afectación del IGV del ítem ' + (i + 1)" [disabled]="off('tip_afe_igv')"
                [ngModel]="it.tip_afe_igv" (ngModelChange)="set(i, 'tip_afe_igv', $event)" [class.is-invalid]="!!err(i, 'tip_afe_igv')">
                <option [ngValue]="''">Elija…</option>
                @for (o of igvTypes(); track o.id) {<option [ngValue]="o.id">{{ o.name }}</option>}
              </select>
              @if (err(i, 'tip_afe_igv')) {<div class="invalid-feedback">{{ err(i, 'tip_afe_igv') }}</div>}
            </td>
            }
            @if (priced()) {<td class="text-end pt-2 erp-num">{{ amount(it) }}</td>}
            @if (!disabled() && allowRemove()) {
            <td class="text-end">
              <button type="button" class="btn btn-sm btn-link text-danger px-1" [disabled]="items().length <= minItems()" (click)="remove(i)"
                [attr.aria-label]="'Quitar el ítem ' + (i + 1)" title="Quitar"><em class="feather icon-trash-2"></em></button>
            </td>
            }
          </tr>
          }
        </tbody>
        @if (priced() && items().length) {
        <tfoot>
          <tr class="small">
            <td [attr.colspan]="footSpan()" class="text-end text-muted">
              <span class="badge badge-light-secondary me-1">Vista previa</span>
              @for (p of previewParts(); track p.label) {<span class="me-2">{{ p.label }} {{ p.value }}</span>}
              · total
            </td>
            <td class="text-end fw-semibold erp-num">{{ previewTotal() }}</td>
            @if (!disabled() && allowRemove()) {<td></td>}
          </tr>
        </tfoot>
        }
      </table>
    </div>
    @if (!disabled() && allowAdd()) {
    <button type="button" class="btn btn-sm btn-outline-primary" (click)="add()"><em class="feather icon-plus me-1"></em>Agregar ítem</button>
    }
    @if (has('precio_unitario')) {
    <p class="form-text mb-0 mt-1">El precio unitario incluye el IGV en los ítems gravados. La vista previa usa el {{ rate() }} % de la empresa: los totales oficiales
      (y la leyenda) los calcula la API al emitir.</p>
    } @else if (has('valor_unitario')) {
    <p class="form-text mb-0 mt-1">El valor unitario no incluye el IGV: en los gravados la API suma el {{ rate() }} %. La retención del impuesto a la renta y el neto
      a pagar los calcula la API.</p>
    }
  `
})
export class ItemGridComponent {
  private modal = inject(NgbModal);

  /** Ítems (two-way: `[(items)]`). */
  readonly items = model<EmissionItem[]>([]);
  readonly fields = input<ItemField[]>(SALE_ITEM_FIELDS);
  readonly currency = input('');
  /** Errores con las claves de la API (`items.0.cantidad`). */
  readonly errors = input<Record<string, string>>({});
  readonly prefix = input('items');
  readonly disabled = input(false);
  readonly minItems = input(1);
  /** Unidad por defecto de una fila nueva. */
  readonly defaultUnit = input('NIU');
  /** Tasa del IGV de la vista previa, en % (la de la empresa). */
  readonly rate = input(ESTIMATE_IGV_RATE * 100);
  /** Afectaciones que se ofrecen (la liquidación solo admite 10, 20 y 30). */
  readonly igvTypes = input<Option<string>[]>(IGV_AFFECTATION_OPTIONS);
  /** Columnas que no se editan (p. ej. según el motivo de una nota). */
  readonly lockedFields = input<ItemField[]>([]);
  readonly allowAdd = input(true);
  readonly allowRemove = input(true);
  readonly sunatCodeRequired = input(false);

  readonly units = UNIT_OPTIONS;
  private readonly uid = Math.random().toString(36).substring(2, 8);

  has(field: ItemField): boolean {
    return this.fields().includes(field);
  }

  /** Columna del código SUNAT (`cod_producto_sunat` o `cod_prod_sunat`), si la hay. */
  codeField(): ItemField | undefined {
    return this.fields().find(isSunatCodeField);
  }

  priced(): boolean {
    return this.has('precio_unitario') || this.has('valor_unitario');
  }

  off(field: ItemField): boolean {
    return this.disabled() || this.lockedFields().includes(field);
  }

  listId(name: string): string {
    return `ig-${this.uid}-${name}`;
  }

  err(i: number, field: ItemField): string {
    return this.errors()[`${this.prefix()}.${i}.${field}`] ?? '';
  }

  numOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  set(i: number, field: keyof EmissionItem, value: unknown): void {
    this.items.update((list) => list.map((it, j) => (j === i ? { ...it, [field]: value } : it)));
  }

  setCode(i: number, value: unknown): void {
    this.set(i, 'cod_sunat', String(value ?? '').replace(/\D/g, '').substring(0, 8));
  }

  /** Buscador del catálogo 25: pone el código y, si la descripción está vacía, la del catálogo. */
  findCode(i: number): void {
    const it = this.items()[i];
    openModal<ProductSunatChoice>(this.modal, ProductSunatModalComponent, (ref) => (ref.componentInstance.initial = it?.descripcion ?? ''), (choice) => {
      if (!choice?.codigo) {
        return;
      }
      this.items.update((list) => list.map((x, j) => (j === i ? { ...x, cod_sunat: choice.codigo, descripcion: x.descripcion.trim() ? x.descripcion : choice.descripcion } : x)));
    }, 'lg');
  }

  add(): void {
    this.items.update((list) => [...list, emptyItem(this.defaultUnit())]);
  }

  remove(i: number): void {
    if (this.items().length <= this.minItems()) {
      return;
    }
    this.items.update((list) => list.filter((_, j) => j !== i));
  }

  private rateFactor(): number {
    return (Number(this.rate()) || 0) / 100;
  }

  amount(it: EmissionItem): string {
    return money(lineEstimate(it, this.rateFactor(), this.has('valor_unitario')).total);
  }

  /** Partes de la vista previa con valor (gravadas, exoneradas, inafectas, exportación, IGV). */
  previewParts(): { label: string; value: string }[] {
    const t = totalsPreview(this.items(), this.rateFactor(), this.has('valor_unitario'));
    return [
      { label: 'Gravadas', value: t.gravadas }, { label: 'Exoneradas', value: t.exoneradas }, { label: 'Inafectas', value: t.inafectas },
      { label: 'Exportación', value: t.exportacion }, { label: 'IGV', value: t.igv }
    ].filter((p, i) => i === 0 || i === 4 || p.value > 0).map((p) => ({ label: p.label, value: money(p.value) }));
  }

  previewTotal(): string {
    return money(totalsPreview(this.items(), this.rateFactor(), this.has('valor_unitario')).total, this.currency() || undefined);
  }

  /** Columnas antes del importe (para el pie). */
  footSpan(): number {
    const cols: ItemField[] = ['codigo', 'descripcion', 'unidad', 'cantidad', 'precio_unitario', 'valor_unitario', 'descuento_pct', 'tip_afe_igv'];
    return 1 + cols.filter((f) => this.has(f)).length + (this.codeField() ? 1 : 0);
  }
}
