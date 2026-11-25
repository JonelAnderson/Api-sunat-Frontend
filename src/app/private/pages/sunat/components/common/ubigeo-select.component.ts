import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UbigeoChoice, UbigeoItem } from '../../models/tenant-admin.models';
import { UbigeoService } from '../../services/tenant-admin.service';

/**
 * Ubigeo con listas dependientes región → provincia → distrito (`GET catalogos/ubigeo/…`, §11.9). El `id` del distrito es
 * el ubigeo. Con `value` (6 dígitos) abre ya elegido. Emite `changed` con el ubigeo y los nombres al elegir un distrito
 * (`null` si se cambia la región o la provincia). Si el catálogo no responde, deja escribir el ubigeo a mano.
 */
@Component({
  selector: 'app-ubigeo-select',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row g-2">
      @if (manual()) {
      <div class="col-md-4">
        <label class="form-label" [for]="idPrefix() + '-manual'">Ubigeo @if (required()) {<span class="erp-required">*</span>}</label>
        <input [id]="idPrefix() + '-manual'" class="form-control" inputmode="numeric" maxlength="6" [ngModel]="manualValue()"
          (ngModelChange)="onManual($event)" [class.is-invalid]="!!error()" placeholder="150101" />
        @if (error()) {<div class="invalid-feedback">{{ error() }}</div>}
      </div>
      <div class="col-md-8 d-flex align-items-end">
        <div class="small text-warning">{{ loadError() }} Escriba el código de 6 dígitos.
          <button type="button" class="btn btn-link btn-sm p-0 align-baseline" (click)="retry()">Reintentar</button></div>
      </div>
      } @else {
      <div class="col-md-4">
        <label class="form-label" [for]="idPrefix() + '-reg'">Departamento @if (required()) {<span class="erp-required">*</span>}</label>
        <select [id]="idPrefix() + '-reg'" class="form-select" [ngModel]="region()" (ngModelChange)="pickRegion($event)" [disabled]="disabled()">
          <option [ngValue]="''">Elija…</option>
          @for (r of regions(); track r.id) {<option [ngValue]="r.id">{{ r.nombre }}</option>}
        </select>
      </div>
      <div class="col-md-4">
        <label class="form-label" [for]="idPrefix() + '-prov'">Provincia @if (required()) {<span class="erp-required">*</span>}</label>
        <select [id]="idPrefix() + '-prov'" class="form-select" [ngModel]="province()" (ngModelChange)="pickProvince($event)"
          [disabled]="disabled() || !region()">
          <option [ngValue]="''">{{ loadingProvinces() ? 'Cargando…' : 'Elija…' }}</option>
          @for (p of provinces(); track p.id) {<option [ngValue]="p.id">{{ p.nombre }}</option>}
        </select>
      </div>
      <div class="col-md-4">
        <label class="form-label" [for]="idPrefix() + '-dist'">Distrito @if (required()) {<span class="erp-required">*</span>}</label>
        <select [id]="idPrefix() + '-dist'" class="form-select" [ngModel]="district()" (ngModelChange)="pickDistrict($event)"
          [disabled]="disabled() || !province()" [class.is-invalid]="!!error()">
          <option [ngValue]="''">{{ loadingDistricts() ? 'Cargando…' : 'Elija…' }}</option>
          @for (d of districts(); track d.id) {<option [ngValue]="d.id">{{ d.nombre }}</option>}
        </select>
        @if (error()) {<div class="invalid-feedback">{{ error() }}</div>}
      </div>
      <div class="col-12 form-text mt-1">Ubigeo: {{ district() || '—' }}</div>
      }
    </div>
  `
})
export class UbigeoSelectComponent implements OnInit {
  private ubigeo = inject(UbigeoService);

  /** Ubigeo inicial (6 dígitos) o vacío. */
  readonly value = input('');
  readonly required = input(true);
  readonly disabled = input(false);
  /** Mensaje de error del campo (validación local o de la API). */
  readonly error = input('');
  readonly idPrefix = input('ubigeo');
  readonly changed = output<UbigeoChoice | null>();

  readonly regions = signal<UbigeoItem[]>([]);
  readonly provinces = signal<UbigeoItem[]>([]);
  readonly districts = signal<UbigeoItem[]>([]);
  readonly region = signal('');
  readonly province = signal('');
  readonly district = signal('');
  readonly loadingProvinces = signal(false);
  readonly loadingDistricts = signal(false);
  readonly manual = signal(false);
  readonly manualValue = signal('');
  readonly loadError = signal('');

  ngOnInit(): void {
    const v = (this.value() ?? '').trim();
    this.manualValue.set(v);
    if (/^\d{6}$/.test(v)) {
      this.region.set(v.substring(0, 2));
      this.province.set(v.substring(0, 4));
      this.district.set(v);
    }
    this.loadAll();
  }

  retry(): void {
    this.manual.set(false);
    this.loadError.set('');
    this.loadAll();
  }

  private loadAll(): void {
    this.ubigeo.regions().subscribe({
      next: (list) => {
        this.regions.set(list);
        if (this.region()) {
          this.loadProvinces(this.region(), true);
        }
      },
      error: (err: Error) => this.fail(err)
    });
  }

  private fail(err: Error): void {
    this.loadError.set(err.message);
    this.manual.set(true);
    this.loadingProvinces.set(false);
    this.loadingDistricts.set(false);
  }

  private loadProvinces(regionId: string, keep: boolean): void {
    this.loadingProvinces.set(true);
    this.ubigeo.provinces(regionId).subscribe({
      next: (list) => {
        this.loadingProvinces.set(false);
        this.provinces.set(list);
        if (keep && this.province()) {
          this.loadDistricts(this.province());
        }
      },
      error: (err: Error) => this.fail(err)
    });
  }

  private loadDistricts(provinceId: string): void {
    this.loadingDistricts.set(true);
    this.ubigeo.districts(provinceId).subscribe({
      next: (list) => {
        this.loadingDistricts.set(false);
        this.districts.set(list);
      },
      error: (err: Error) => this.fail(err)
    });
  }

  pickRegion(id: string): void {
    this.region.set(id ?? '');
    this.province.set('');
    this.district.set('');
    this.provinces.set([]);
    this.districts.set([]);
    this.changed.emit(null);
    if (id) {
      this.loadProvinces(id, false);
    }
  }

  pickProvince(id: string): void {
    this.province.set(id ?? '');
    this.district.set('');
    this.districts.set([]);
    this.changed.emit(null);
    if (id) {
      this.loadDistricts(id);
    }
  }

  pickDistrict(id: string): void {
    this.district.set(id ?? '');
    if (!id) {
      this.changed.emit(null);
      return;
    }
    const name = (list: UbigeoItem[], key: string) => list.find((x) => x.id === key)?.nombre ?? '';
    this.changed.emit({
      ubigeo: id, departamento: name(this.regions(), this.region()), provincia: name(this.provinces(), this.province()),
      distrito: name(this.districts(), id)
    });
  }

  onManual(value: string): void {
    const v = (value ?? '').replace(/\D/g, '').substring(0, 6);
    this.manualValue.set(v);
    // A mano no hay nombres: se conservan los que ya tenía el formulario (vacío = no se cambian).
    this.changed.emit(v.length === 6 ? { ubigeo: v, departamento: '', provincia: '', distrito: '' } : null);
  }
}
