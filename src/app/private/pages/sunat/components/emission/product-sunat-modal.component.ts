import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { serverMessages } from '@shared/functions/list-helpers';
import { arr, str } from '../../models/tenant-views.models';
import { EmissionService, ProductSunatNode, ProductSunatRow } from '../../services/emission.service';

/** Lo que devuelve el buscador: el código de 8 dígitos y su descripción. */
export interface ProductSunatChoice {
  codigo: string;
  descripcion: string;
}

const PAGE_SIZE = 20;

/**
 * Buscador del código de producto SUNAT (catálogo 25, UNSPSC v14; §11.9, `Admin.Tenants.View`): por texto o prefijo de
 * código (`GET catalogos/producto-sunat?q=`, 20 por página) o recorriendo segmento → familia → clase → producto. Solo
 * consulta al pulsar "Buscar" o al elegir un nivel; nada se guarda.
 */
@Component({
  selector: 'app-product-sunat-modal',
  imports: [FormsModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-search"></em>Código de producto SUNAT (catálogo 25)</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body">
      <ul class="nav nav-pills nav-sm mb-3" role="tablist">
        <li class="nav-item"><button type="button" class="nav-link py-1" [class.active]="mode() === 'search'" (click)="mode.set('search')">Buscar</button></li>
        <li class="nav-item"><button type="button" class="nav-link py-1" [class.active]="mode() === 'tree'" (click)="openTree()">Por categorías</button></li>
      </ul>

      @if (mode() === 'search') {
      <form class="input-group input-group-sm mb-2" (ngSubmit)="search(1)">
        <input class="form-control" name="q" [(ngModel)]="q" maxlength="100" placeholder="Por ejemplo: café, laptop, 5020…" aria-label="Texto o código" />
        <button type="submit" class="btn btn-primary" [disabled]="loading()">
          @if (loading()) {<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>}Buscar
        </button>
      </form>
      <p class="form-text mt-0">Escriba al menos 2 caracteres: una palabra de la descripción o el inicio del código.</p>
      } @else {
      <div class="row g-2 mb-2">
        @for (lv of levels; track lv.id; let i = $index) {
        @if (i === 0 || choice[levels[i - 1].id]) {
        <div class="col-md-4">
          <label class="form-label small" [for]="'ps-' + lv.id">{{ lv.name }}</label>
          <select [id]="'ps-' + lv.id" class="form-select form-select-sm" [ngModel]="choice[lv.id]" (ngModelChange)="pick(i, $event)">
            <option [ngValue]="''">Elija…</option>
            @for (n of nodes[lv.id]; track n.codigo) {<option [ngValue]="n.codigo">{{ n.codigo }} - {{ n.nombre }}</option>}
          </select>
        </div>
        }
        }
      </div>
      }

      @if (error()) {<div class="alert alert-warning py-2 small">{{ error() }}</div>}
      @if (rows().length) {
      <div class="list-group list-group-flush border rounded" style="max-height: 22rem; overflow-y: auto">
        @for (r of rows(); track r.codigo) {
        <button type="button" class="list-group-item list-group-item-action small py-2" (click)="choose(r)">
          <span class="fw-semibold erp-num me-2">{{ r.codigo }}</span>{{ r.descripcion }}
        </button>
        }
      </div>
      @if (mode() === 'search' && (page() > 1 || page() * pageSize < total())) {
      <div class="d-flex justify-content-between align-items-center mt-2 small">
        <span class="text-muted">{{ total() }} resultados · página {{ page() }}</span>
        <span>
          <button type="button" class="btn btn-sm btn-light" [disabled]="page() <= 1 || loading()" (click)="search(page() - 1)">Anterior</button>
          <button type="button" class="btn btn-sm btn-light ms-1" [disabled]="page() * pageSize >= total() || loading()" (click)="search(page() + 1)">Siguiente</button>
        </span>
      </div>
      }
      } @else if (searched() && !loading() && !error()) {
      <p class="text-muted small mb-0">Sin resultados.</p>
      }
      <p class="form-text mb-0 mt-2">Elija un producto (8 dígitos): la API no acepta códigos que terminen en 0000. Es obligatorio si la empresa está en el padrón
        de SUNAT "obligados a consignar el código de producto" y en las liquidaciones de compra.</p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="activeModal.dismiss()">Cancelar</button>
    </div>
  `
})
export class ProductSunatModalComponent implements OnInit {
  readonly activeModal = inject(NgbActiveModal);
  private service = inject(EmissionService);

  /** Texto inicial (la descripción del ítem). */
  initial = '';

  readonly levels: { id: 'segmentos' | 'familias' | 'clases' | 'productos'; name: string }[] = [
    { id: 'segmentos', name: 'Segmento' }, { id: 'familias', name: 'Familia' }, { id: 'clases', name: 'Clase' }
  ];
  readonly pageSize = PAGE_SIZE;
  q = '';
  readonly mode = signal<'search' | 'tree'>('search');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly rows = signal<ProductSunatRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly searched = signal(false);
  nodes: Record<string, ProductSunatNode[]> = { segmentos: [], familias: [], clases: [] };
  choice: Record<string, string> = { segmentos: '', familias: '', clases: '' };

  ngOnInit(): void {
    this.q = (this.initial ?? '').trim().substring(0, 100);
  }

  search(page: number): void {
    const q = this.q.trim();
    if (q.length < 2) {
      this.error.set('Escriba al menos 2 caracteres.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.service.searchProducts(q, page, PAGE_SIZE).subscribe({
      next: (resp) => {
        this.loading.set(false);
        this.searched.set(true);
        if (!resp.succeeded) {
          this.rows.set([]);
          this.error.set(serverMessages(resp, 'No se pudo buscar en el catálogo.'));
          return;
        }
        this.page.set(page);
        this.total.set(Number(resp.totalRecords) || 0);
        this.rows.set(arr(resp.data).map((x) => ({ codigo: str(x['codigo']), descripcion: str(x['descripcion']), clase: str(x['clase']) })));
      },
      error: (err) => {
        this.loading.set(false);
        this.searched.set(true);
        this.rows.set([]);
        this.error.set(serverMessages(err?.error, 'No se pudo buscar en el catálogo.'));
      }
    });
  }

  openTree(): void {
    this.mode.set('tree');
    this.rows.set([]);
    this.searched.set(false);
    this.error.set('');
    if (!this.nodes['segmentos'].length) {
      this.loadLevel('segmentos');
    }
  }

  /** Elegir un nivel carga el siguiente (en clase, sus productos). */
  pick(index: number, code: string): void {
    const lv = this.levels[index];
    this.choice[lv.id] = code ?? '';
    for (let j = index + 1; j < this.levels.length; j++) {
      this.choice[this.levels[j].id] = '';
      this.nodes[this.levels[j].id] = [];
    }
    this.rows.set([]);
    this.searched.set(false);
    if (!code) {
      return;
    }
    const next = index + 1 < this.levels.length ? this.levels[index + 1].id : 'productos';
    this.loadLevel(next, code);
  }

  private loadLevel(level: 'segmentos' | 'familias' | 'clases' | 'productos', parent?: string): void {
    this.loading.set(true);
    this.error.set('');
    this.service.productLevel(level, parent).subscribe({
      next: (resp) => {
        this.loading.set(false);
        if (!resp.succeeded) {
          this.error.set(serverMessages(resp, 'No se pudo cargar el catálogo.'));
          return;
        }
        const list = arr(resp.data);
        if (level === 'productos') {
          this.searched.set(true);
          this.rows.set(list.map((x) => ({ codigo: str(x['codigo']), descripcion: str(x['descripcion'] ?? x['nombre']) })));
        } else {
          this.nodes[level] = list.map((x) => ({ codigo: str(x['codigo']), nombre: str(x['nombre'] ?? x['descripcion']) }));
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(serverMessages(err?.error, 'No se pudo cargar el catálogo.'));
      }
    });
  }

  choose(r: ProductSunatRow): void {
    this.activeModal.close({ codigo: r.codigo, descripcion: r.descripcion } as ProductSunatChoice);
  }
}
