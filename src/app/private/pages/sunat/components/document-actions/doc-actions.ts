/**
 * Arranque de las acciones de la fase D (§11.8) desde cualquier listado o detalle: abre el modal que corresponde (confirmar
 * reenviar / anular / refrescar, o el formulario de corrección), avisa el resultado con los `messages` del sobre y devuelve
 * `true` si la API hizo el cambio (el llamador recarga la fila o el detalle). También arma las acciones del menú de
 * `app-list-table` (prefijo `doc:`), visibles y habilitadas según `docActions`.
 */
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { MODAL_OPTIONS } from '@shared/functions/list-helpers';
import { TableAction } from '@shared/models/table-action.interface';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { ActionPerms, ActionTarget, DocAction, actionSuccessText, anyActionPerm, docActions } from '../../models/document-actions.models';
import { DocActionModalComponent, DocActionResult } from './doc-action-modal.component';
import { GuideFixFormComponent } from './guide-fix-form.component';
import { SaleFixFormComponent } from './sale-fix-form.component';

const OK_TEXT: Record<DocAction, string> = {
  resend: 'Documento enviado a SUNAT.',
  void: 'Anulación encolada para envío a SUNAT.',
  refresh: 'Estado consultado en SUNAT.',
  fix: 'Documento corregido.'
};

/** Abre la acción y, si la API la hizo, avisa (sin esperar el OK) y devuelve `true`. */
export async function runDocAction(modal: NgbModal, alerts: AlertModalService, target: ActionTarget, action: DocAction): Promise<boolean> {
  const fix = action === 'fix';
  const component = fix ? (target.kind === 'guias-remision' ? GuideFixFormComponent : SaleFixFormComponent) : DocActionModalComponent;
  const ref = modal.open(component, { ...MODAL_OPTIONS, size: fix ? 'xl' : undefined });
  Object.assign(ref.componentInstance, fix ? { target } : { target, action });
  try {
    const result = (await ref.result) as DocActionResult | undefined;
    if (!result?.resp) {
      return false;
    }
    void alerts.showNotification('Listo', actionSuccessText(result.action, result.resp, OK_TEXT[result.action]), 'success');
    return true;
  } catch {
    return false;
  }
}

const TABLE_PREFIX = 'doc:';
const TABLE_ORDER: DocAction[] = ['fix', 'resend', 'refresh', 'void'];

/** La acción de la fase D de un id del menú (`doc:resend`…), o null si es otra acción. */
export function tableDocAction(actionId: string): DocAction | null {
  const id = actionId.startsWith(TABLE_PREFIX) ? actionId.substring(TABLE_PREFIX.length) : '';
  return (TABLE_ORDER as string[]).includes(id) ? (id as DocAction) : null;
}

/**
 * Acciones de la fase D para el menú de cada fila (vacío sin ningún permiso de la fase D, p. ej. `lectura`). Las que no
 * corresponden al documento no se muestran; las que no se pueden hacer ahora (plazo vencido, empresa suspendida) se ven
 * deshabilitadas con el motivo corto en el texto.
 */
export function docTableActions<R>(targetOf: (row: R) => ActionTarget | null, perms: ActionPerms): TableAction[] {
  if (!anyActionPerm(perms)) {
    return [];
  }
  return TABLE_ORDER.map((id) => {
    const state = (row: R) => docActions(targetOf(row), perms).find((a) => a.id === id);
    return {
      id: `${TABLE_PREFIX}${id}`,
      label: (row: R) => {
        const s = state(row);
        return s ? (s.enabled ? s.label : `${s.label} (${s.short})`) : '';
      },
      icon: (row: R) => state(row)?.icon ?? 'more_horiz',
      color: id === 'void' ? 'warn' : 'primary',
      tooltip: (row: R) => state(row)?.reason || state(row)?.label || '',
      visible: (row: R) => !!state(row),
      disabled: (row: R) => !state(row)?.enabled
    } as TableAction;
  });
}
