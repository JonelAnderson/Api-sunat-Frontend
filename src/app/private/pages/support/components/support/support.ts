import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { SharedModule } from '@shared/shared.module';
import { CustomTitleService } from '@shared/service/custom-title.service';
import { MenuNavService } from '@shared/service/menu-nav.service';
import { NavigationItem } from '@shared/models/navigation-item.interface';
import {
  HELP_FAQ,
  HELP_MODULES,
  HELP_STEPS,
  HelpFaq,
  HelpModule,
  HELP_SHORTCUTS,
  SUPPORT_CONTACT
} from '../../models/help-content';

/** Sin tildes y en minúsculas, para buscar "contrasena" o "Contraseña" igual. */
function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Todas las URL del menú del usuario (grupos → desplegables → ítems). */
function collectUrls(items: NavigationItem[] | null | undefined, into = new Set<string>()): Set<string> {
  for (const item of items ?? []) {
    if (item.url) into.add(item.url);
    if (item.children?.length) collectUrls(item.children, into);
  }
  return into;
}

/**
 * Centro de ayuda (/private/help): primeros pasos, guías por módulo, preguntas frecuentes y contacto.
 * El contenido vive en `models/help-content.ts`. Solo se enlazan las pantallas que el usuario tiene en su menú, y un módulo
 * sin ninguna pantalla visible para él no se muestra. El buscador filtra guías y preguntas sin distinguir tildes.
 */
@Component({
  selector: 'app-support',
  imports: [SharedModule, RouterLink],
  templateUrl: './support.html',
  styleUrl: './support.scss'
})
export class Support {
  private readonly menu = inject(MenuNavService);

  readonly steps = HELP_STEPS;
  readonly shortcuts = HELP_SHORTCUTS;
  readonly contact = SUPPORT_CONTACT;
  readonly hasContact = !!(SUPPORT_CONTACT.email || SUPPORT_CONTACT.phone);
  readonly suggestions = ['Suspender', 'Plan', 'Certificado', 'Rechazo', 'ZIP', 'Consulta CPE', 'Reintentar', 'Contraseña'];

  readonly query = signal('');

  private readonly navigation = toSignal(this.menu.navigation$, { initialValue: [] as NavigationItem[] });
  private readonly allowedUrls = computed(() => collectUrls(this.navigation()));
  /** Mientras el menú no cargó no se ocultan módulos (pero tampoco se enlazan pantallas). */
  private readonly menuLoaded = computed(() => this.allowedUrls().size > 0);

  /** Módulos que el usuario puede usar y que coinciden con la búsqueda (con solo las tareas que coinciden). */
  readonly modules = computed<HelpModule[]>(() => {
    const q = normalize(this.query());
    return HELP_MODULES.filter((m) => !this.menuLoaded() || m.tasks.some((t) => this.canOpen(t.url)))
      .map((m) => {
        if (!q) return m;
        const moduleMatches = normalize(`${m.title} ${m.summary}`).includes(q);
        const tasks = moduleMatches ? m.tasks : m.tasks.filter((t) => normalize(`${t.title} ${t.hint}`).includes(q));
        return { ...m, tasks };
      })
      .filter((m) => m.tasks.length > 0);
  });

  readonly faq = computed<HelpFaq[]>(() => {
    const q = normalize(this.query());
    return q ? HELP_FAQ.filter((f) => normalize(`${f.question} ${f.answer}`).includes(q)) : HELP_FAQ;
  });

  readonly searching = computed(() => normalize(this.query()).length > 0);
  readonly hasResults = computed(() => this.modules().length > 0 || this.faq().length > 0);

  constructor(customTitle: CustomTitleService) {
    customTitle.set('Ayuda');
  }

  /** La pantalla está en el menú del usuario (si no, la guía se muestra sin enlace). */
  canOpen(url: string | undefined): boolean {
    return !!url && this.allowedUrls().has(url);
  }

  onSearch(value: string): void {
    this.query.set(value);
  }

  /** Clic en un frecuente: lo busca; otro clic sobre el mismo (ya activo) limpia la búsqueda. */
  suggest(term: string): void {
    this.query.set(this.isActive(term) ? '' : term);
  }

  /** El frecuente es la búsqueda actual (sin distinguir tildes ni mayúsculas): queda resaltado. */
  isActive(term: string): boolean {
    return normalize(this.query()) === normalize(term);
  }

  clear(): void {
    this.query.set('');
  }
}
