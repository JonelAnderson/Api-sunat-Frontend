/**
 * Mayúsculas por defecto en todo lo que se escribe en campos de texto (input text / search sin tipo, y textarea), en toda la
 * aplicación, sin tocar cada formulario.
 *
 * Escucha `input` en fase de captura sobre el documento: corre antes que el ValueAccessor de Angular (formControl, ngModel) y
 * que los `(input)` de los componentes, así que todos reciben ya el texto en mayúsculas. Conserva la posición del cursor.
 *
 * No aplica a:
 * - números, fechas, correos, contraseñas, teléfonos, URL (otros `type`), ni a campos de solo lectura o deshabilitados;
 * - campos de credenciales o que distinguen mayúsculas, reconocidos por su `id`, `name` o `formcontrolname` (correo, usuario,
 *   contraseña, URL, token, secreto, API key, código de barras, serie / IMEI, ícono del menú) o por su `autocomplete`
 *   (username, password, one-time-code, email, url). El código de barras y la serie se buscan tal cual se guardaron;
 * - cualquier campo dentro de un elemento con el atributo `data-keep-case`. Para excluir un campo nuevo, se le agrega ese atributo.
 *
 * Solo cambia lo que el usuario escribe o pega: los valores que llegan del servidor (por ejemplo, al editar) se muestran tal cual.
 */
const TEXT_INPUT_TYPES = new Set(['text', 'search']);
const KEEP_CASE_AUTOCOMPLETE = /(username|password|one-time-code|email|url)/i;
const KEEP_CASE_NAME = /(mail|correo|user-?name|login|pass(word|wd)?|contrase|url|token|secret|api-?key|barcode|serial|imei|icon)/i;

export function shouldUppercase(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  const isTextArea = el instanceof HTMLTextAreaElement;
  if (!isTextArea && !(el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type))) {
    return false;
  }
  const field = el as HTMLInputElement | HTMLTextAreaElement;
  if (field.readOnly || field.disabled || field.closest('[data-keep-case]')) {
    return false;
  }
  if (KEEP_CASE_AUTOCOMPLETE.test(field.getAttribute('autocomplete') ?? '')) {
    return false;
  }
  const names = [field.id, field.getAttribute('name'), field.getAttribute('formcontrolname')].filter(Boolean).join(' ');
  return !KEEP_CASE_NAME.test(names);
}

/** True si cambió el texto. */
function toUppercase(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  const value = el.value;
  const upper = value.toLocaleUpperCase('es-PE');
  if (upper === value) {
    return false;
  }
  const { selectionStart, selectionEnd } = el;
  el.value = upper;
  // Misma longitud salvo casos raros (ß → SS): se recorta al largo nuevo.
  if (selectionStart !== null && selectionEnd !== null) {
    el.setSelectionRange(Math.min(selectionStart, upper.length), Math.min(selectionEnd, upper.length));
  }
  return true;
}

/** Se instala una vez al arrancar la aplicación (app-config). */
export function installUppercaseTextInputs(doc: Document): void {
  doc.addEventListener(
    'input',
    (event) => {
      // Mientras se compone un carácter (teclados con acentos muertos, IME), se espera a compositionend.
      if ((event as InputEvent).isComposing || !shouldUppercase(event.target)) {
        return;
      }
      toUppercase(event.target);
    },
    true
  );
  doc.addEventListener(
    'compositionend',
    (event) => {
      // El último `input` de una composición (p. ej. "´" + "a" → "á") llega antes de compositionend y con isComposing: el
      // formulario ya tomó la minúscula. Se vuelve a avisar con un `input` para que tome el texto en mayúsculas.
      if (shouldUppercase(event.target) && toUppercase(event.target)) {
        event.target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    true
  );
}
