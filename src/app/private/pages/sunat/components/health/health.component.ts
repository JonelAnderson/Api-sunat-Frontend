import { Component, signal } from '@angular/core';
import { SharedModule } from '@shared/shared.module';
import { PageHeaderComponent } from '@shared/components/reusables/page-header/page-header.component';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { formatNumber, serverMessages } from '@shared/functions/list-helpers';
import { HealthCard, HealthResponse, readHealth } from '../../models/sunat.models';
import { HealthService } from '../../services/sunat.services';

/** Salud de la API SUNAT (`GET health`): base de datos, Redis, cola, programador y SUNAT (beta y producción). */
@Component({
  selector: 'app-health',
  imports: [SharedModule, PageHeaderComponent],
  template: `
    <div class="row btn-page">
      <div class="col-sm-12">
        <div class="card">
          <app-page-header icon="icon-activity" title="SALUD DEL SERVICIO" [subtitle]="checkedAt() ? 'Revisado a las ' + checkedAt() : 'Estado de los componentes de la API'">
            <button headerActions type="button" class="btn btn-primary" [disabled]="loading()" (click)="load()">
              @if (loading()) {<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>}
              @else {<em class="feather icon-refresh-cw"></em>}
              ACTUALIZAR
            </button>
          </app-page-header>
          <div class="card-body">
            @if (error()) {
            <div class="alert alert-warning">{{ error() }}</div>
            }
            <div class="row g-3">
              @for (c of cards(); track c.key) {
              <div class="col-sm-6 col-xl-4">
                <div class="card h-100 mb-0 border shadow-none">
                  <div class="card-body d-flex gap-3 align-items-start">
                    <span class="f-24" [ngClass]="c.ok === true ? 'text-success' : c.ok === false ? 'text-danger' : 'text-muted'">
                      <em class="feather {{ c.icon }}"></em>
                    </span>
                    <div class="flex-grow-1">
                      <div class="d-flex align-items-center gap-2 mb-1">
                        <h6 class="mb-0">{{ c.label }}</h6>
                        <span class="badge" [ngClass]="c.ok === true ? 'badge-light-success' : c.ok === false ? 'badge-light-danger' : 'badge-light-secondary'">
                          {{ c.ok === true ? 'OK' : c.ok === false ? 'ERROR' : 'SIN DATO' }}
                        </span>
                      </div>
                      <p class="small text-muted mb-0 text-break">{{ c.message }}</p>
                      @if (c.extra) {<p class="small mb-0 mt-1">{{ c.extra }}</p>}
                    </div>
                  </div>
                </div>
              </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class HealthComponent {
  readonly loading = signal(false);
  readonly error = signal('');
  readonly cards = signal<HealthCard[]>([]);
  readonly checkedAt = signal('');

  constructor(private health: HealthService, title: CustomTitleService) {
    title.set('Salud');
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.health.get().subscribe({
      next: (resp) => {
        this.loading.set(false);
        if (resp.succeeded && resp.data) {
          this.cards.set(this.toCards(resp.data as HealthResponse));
          this.checkedAt.set(new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()));
        } else {
          this.error.set(serverMessages(resp, 'No se pudo leer la salud del servicio.'));
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(serverMessages(err?.error, 'No se pudo conectar con la API.'));
      }
    });
  }

  private toCards(h: HealthResponse): HealthCard[] {
    const card = (key: string, label: string, icon: string, value: Parameters<typeof readHealth>[0], extra?: string): HealthCard =>
      ({ key, label, icon, ...readHealth(value), extra });
    const queue = h.queue ?? null;
    const queueState = queue && (queue.status ?? queue.estado ?? queue.ok) !== undefined ? queue
      : queue ? { status: (queue.failed ?? 0) > 0 ? 'error' : 'ok', message: (queue.failed ?? 0) > 0 ? 'Hay trabajos fallidos' : 'Sin fallos' } : null;
    return [
      card('database', 'Base de datos', 'icon-database', h.database),
      card('redis', 'Redis', 'icon-zap', h.redis),
      card('queue', 'Cola de trabajos', 'icon-layers', queueState,
        queue ? `Pendientes: ${formatNumber(queue.pending ?? 0)} · Fallidos: ${formatNumber(queue.failed ?? 0)}` : undefined),
      card('scheduler', 'Programador de tareas', 'icon-clock', h.scheduler),
      card('sunat-beta', 'SUNAT beta', 'icon-cloud', h.sunat?.beta),
      card('sunat-production', 'SUNAT producción', 'icon-cloud', h.sunat?.production)
    ];
  }
}
