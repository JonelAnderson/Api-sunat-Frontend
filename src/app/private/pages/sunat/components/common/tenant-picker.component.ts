import { ChangeDetectionStrategy, Component, DestroyRef, OnChanges, SimpleChanges, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { query, rows } from '@shared/functions/list-helpers';
import { TenantResponse } from '../../models/sunat.models';
import { TenantService } from '../../services/sunat.services';

/** Empresa elegida en el selector. */
export interface TenantPick {
  id: number;
  label: string;
  ruc: string;
}

/**
 * Selector de empresa con búsqueda en el servidor (`GET tenants` con `textFilter`, 20 filas: RUC, razón social o nombre
 * comercial). No carga el listado completo. `value` / `label` fijan la empresa desde el padre (p. ej. desde la URL).
 */
@Component({
  selector: 'app-tenant-picker',
  imports: [FormsModule, NgSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filter-select-wrapper" [style.min-width]="minWidth()">
      <ng-select class="filter-select-glass" dropdownPanelClass="filter-select-panel" appendTo="body" [items]="items()" bindLabel="label"
        bindValue="id" [placeholder]="placeholder()" [typeahead]="input$" [loading]="loading()" [clearable]="clearable()" [ngModel]="selected()"
        (ngModelChange)="onSelect($event)" (open)="onOpen()" [labelForId]="inputId()" typeToSearchText="Escriba el RUC o la razón social"
        notFoundText="Sin empresas que coincidan" loadingText="Buscando…" [attr.aria-label]="placeholder()">
      </ng-select>
    </div>
  `
})
export class TenantPickerComponent implements OnChanges {
  private tenants = inject(TenantService);
  private destroyRef = inject(DestroyRef);

  readonly value = input<number | null>(null);
  readonly label = input<string>('');
  readonly placeholder = input('Empresa (todas)');
  readonly minWidth = input('260px');
  readonly clearable = input(true);
  readonly inputId = input<string | null>(null);
  readonly tenantChange = output<TenantPick | null>();

  readonly items = signal<TenantPick[]>([]);
  readonly selected = signal<number | null>(null);
  readonly loading = signal(false);
  readonly input$ = new Subject<string>();
  private loadedOnce = false;

  constructor() {
    this.input$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap(() => this.loading.set(true)),
      switchMap((text) => this.tenants.GetAll(20, 0, query({ textFilter: (text ?? '').trim().substring(0, 100) })).pipe(catchError(() => of(null)))),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((resp) => {
      this.loading.set(false);
      const found = resp?.succeeded ? rows<TenantResponse>(resp).map((t) => ({ id: t.id, label: `${t.razonSocial} (${t.ruc})`, ruc: t.ruc })) : [];
      // La empresa elegida sigue en la lista aunque la búsqueda no la traiga (para que se vea su nombre).
      const current = this.items().find((i) => i.id === this.selected());
      this.items.set(current && !found.some((f) => f.id === current.id) ? [current, ...found] : found);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] || changes['label']) {
      const id = this.value();
      this.selected.set(id);
      if (id && !this.items().some((i) => i.id === id)) {
        this.items.set([{ id, label: this.label() || `Empresa #${id}`, ruc: '' }, ...this.items()]);
      }
    }
  }

  onOpen(): void {
    if (!this.loadedOnce) {
      this.loadedOnce = true;
      this.input$.next('');
    }
  }

  onSelect(id: number | null): void {
    this.selected.set(id ?? null);
    this.tenantChange.emit(id ? this.items().find((i) => i.id === id) ?? { id, label: `Empresa #${id}`, ruc: '' } : null);
  }
}
