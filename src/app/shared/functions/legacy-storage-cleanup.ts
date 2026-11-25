/**
 * Claves que versiones anteriores dejaban en localStorage y ya no se usan: permisos y menú (ahora en memoria), la foto
 * y los datos de "préstamo" de la plantilla, y el Id elegido (ahora en sessionStorage). Se borran al arrancar la app.
 */
const LEGACY_KEYS = [
  'userPermissions',
  'userMenu',
  'pictureUrl',
  'selectedIdKey',
  'loanUserData',
  'loanClientData',
  'loanLookupType',
  'loanDocumentNumber'
];

export function removeLegacyStorageKeys(): void {
  try {
    for (const key of LEGACY_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // sin acceso a localStorage (modo privado estricto): nada que limpiar
  }
}
