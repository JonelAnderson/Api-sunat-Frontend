import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FileDownloadService } from '@shared/service/file-download.service';
import { DocKind, PDF_FORMATS } from '../../models/tenant-views.models';
import { TenantViewsService } from '../../services/tenant-views.service';

/**
 * Vista previa del PDF de un documento (§10.3: `…/pdf?formato=&inline=1`). El PDF se pide como blob con el bearer (nunca una
 * URL externa ni de `/api/v1`) y se muestra en un `<iframe>` desde una URL `blob:` creada con `URL.createObjectURL`, que se
 * revoca al cambiar de formato y al cerrar. "Descargar" guarda el mismo blob, sin volver a pedirlo.
 */
@Component({
  selector: 'app-pdf-preview',
  imports: [FormsModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title color-modal-title"><em class="feather icon-file"></em>Vista previa del PDF @if (title) {<span class="ms-1">· {{ title }}</span>}</h5>
      <button type="button" class="btn-close" aria-label="Cerrar" (click)="activeModal.dismiss()"></button>
    </div>
    <div class="modal-body p-2">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
        <label class="small text-muted" for="pdf-preview-format">Formato</label>
        <select id="pdf-preview-format" class="form-select form-select-sm w-auto" [(ngModel)]="format" (ngModelChange)="load()" [disabled]="loading()">
          @for (f of formats; track f.id) {<option [value]="f.id">{{ f.name }}</option>}
        </select>
        <button type="button" class="btn btn-sm btn-outline-primary" [disabled]="!url() || loading()" (click)="save()">
          <em class="feather icon-download me-1"></em>Descargar
        </button>
        @if (loading()) {<span class="spinner-border spinner-border-sm text-primary" role="status" aria-label="Cargando"></span>}
      </div>
      @if (error()) {
      <div class="alert alert-warning mb-0">{{ error() }}</div>
      } @else if (url(); as u) {
      <iframe class="w-100 border rounded" style="height: 75vh" [src]="u" [title]="'PDF ' + title"></iframe>
      } @else if (!loading()) {
      <p class="small text-muted mb-0">Sin vista previa.</p>
      }
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" (click)="activeModal.dismiss()">Cerrar</button>
    </div>
  `
})
export class PdfPreviewComponent implements OnInit, OnDestroy {
  readonly activeModal = inject(NgbActiveModal);
  private views = inject(TenantViewsService);
  private files = inject(FileDownloadService);
  private sanitizer = inject(DomSanitizer);

  tenantId!: number;
  kind!: DocKind;
  docId!: number;
  /** Número del documento (título y nombre del archivo si la API no manda `Content-Disposition`). */
  title = '';
  format = 'a4';

  readonly formats = PDF_FORMATS;
  readonly loading = signal(false);
  readonly error = signal('');
  readonly url = signal<SafeResourceUrl | null>(null);
  private objectUrl: string | null = null;
  private blob: Blob | null = null;
  private fileName = '';
  private request = 0;

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    this.release();
    const result = await this.views.pdfPreview(this.tenantId, this.kind, this.docId, this.format);
    if (request !== this.request) {
      return;
    }
    this.loading.set(false);
    if ('error' in result) {
      if (result.status === -1) {
        this.activeModal.dismiss();
        return;
      }
      this.error.set(result.error);
      return;
    }
    // Siempre como PDF (el iframe lo muestra con el visor del navegador).
    this.blob = result.type.includes('pdf') ? result.blob : new Blob([result.blob], { type: 'application/pdf' });
    this.fileName = result.name ?? `${this.title || `documento-${this.docId}`}.pdf`;
    this.objectUrl = URL.createObjectURL(this.blob);
    // Seguro: es una URL `blob:` creada aquí con los bytes de la API, nunca una URL que llegue de afuera.
    this.url.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
  }

  save(): void {
    if (this.blob) {
      this.files.saveBlob(this.blob, this.fileName);
    }
  }

  private release(): void {
    this.url.set(null);
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.blob = null;
  }

  ngOnDestroy(): void {
    this.request++;
    this.release();
  }
}

/** Abre la vista previa del PDF de un documento (vistas con PDF: comprobantes, guías, retenciones, percepciones y liquidaciones). */
export function openPdfPreview(modal: NgbModal, tenantId: number, kind: DocKind, docId: number, title?: string, format = 'a4'): void {
  const ref = modal.open(PdfPreviewComponent, { backdrop: 'static', keyboard: true, centered: true, size: 'xl', scrollable: true });
  Object.assign(ref.componentInstance, { tenantId, kind, docId, title: title ?? '', format });
  ref.result.catch(() => undefined);
}
