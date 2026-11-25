/** Utilidades de las impresiones A4 (logo de la empresa). */

/** Ruta del archivo subido sin el host (o null si no hay): el servidor guarda la URL con el host de la subida; con la ruta
 * relativa sale del mismo origen (proxy en desarrollo, nginx en producción) y la CSP lo permite. */
export function relativeAssetPath(url: string | null | undefined): string | null {
  const value = url?.trim();
  if (!value) return null;
  try {
    return new URL(value, window.location.origin).pathname;
  } catch {
    return null;
  }
}

/** Espera a que carguen las imágenes del documento (logo) antes de abrir la impresión; como mucho 3 s. */
export async function imagesReady(host: HTMLElement, timeoutMs = 3000): Promise<void> {
  const pending = Array.from(host.querySelectorAll('img'))
    .filter((img) => !img.complete)
    .map((img) => img.decode().catch(() => undefined));
  if (!pending.length) return;
  await Promise.race([Promise.all(pending), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
