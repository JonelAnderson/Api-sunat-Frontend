import { HttpErrorResponse } from '@angular/common/http';

/**
 * Mensaje para el usuario a partir de un error HTTP: los textos de validación del servidor (`errors` de un 400, sin los
 * repetidos), o los `messages` de un Result, o un texto genérico. Nunca devuelve detalles técnicos (códigos, trazas).
 */
export function httpErrorMessage(error: unknown, fallback = 'No se pudo guardar. Intente de nuevo; si continúa, avise al administrador.'): string {
  const body = error instanceof HttpErrorResponse ? error.error : (error as { error?: unknown })?.error;
  if (body && typeof body === 'object') {
    const validation = (body as { errors?: Record<string, unknown> }).errors;
    if (validation && typeof validation === 'object' && !Array.isArray(validation)) {
      // Cada campo trae el texto del atributo [Required] y el de FluentValidation: uno por campo basta.
      const texts = Object.values(validation)
        .map((list) => (Array.isArray(list) ? list : [list]).map(String))
        .map((list) => list.find((t) => !t.startsWith('The ')) ?? list[0])
        .filter((t): t is string => !!t);
      if (texts.length) return Array.from(new Set(texts)).join(' ');
    }
    const messages = (body as { messages?: unknown }).messages;
    if (Array.isArray(messages) && messages.length) return messages.map(String).join(' ');
    if (typeof messages === 'string' && messages) return messages;
  }
  return fallback;
}
