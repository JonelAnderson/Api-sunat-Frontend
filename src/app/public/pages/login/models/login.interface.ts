/** Cuerpo de `POST admin/auth/login` (userName = correo del administrador). */
export interface Login {
  userName: string;
  password: string;
}

/**
 * `data` de `admin/auth/login`, `login/mfa`, `login/mfa/setup/confirm` y `refreshToken` (§5.1 del contrato).
 * Sin "recordar dispositivo": cada login pide el código.
 */
export interface TokenResponse {
  token?: string | null;
  refreshToken?: string | null;
  refreshTokenExpiryTime?: string | null;
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  mfaTicket?: string | null;
  recoveryCodesLeft?: number | null;
  recoveryCodes?: string[] | null;
}

/** Cuerpo de `admin/auth/login/mfa` y `login/mfa/setup/confirm`. */
export interface MfaLoginRequest {
  mfaTicket: string;
  code?: string;
  recoveryCode?: string;
}

/** `data` de `admin/auth/login/mfa/setup`. */
export interface MfaSetupResponse {
  sharedKey: string;
  authenticatorUri: string;
}

/** `data` de `GET admin/auth/mfa/status`. */
export interface MfaStatusResponse {
  enabled: boolean;
  recoveryCodesLeft: number;
}

/** `data` de `POST admin/auth/mfa/recovery-codes`. */
export interface RecoveryCodesResponse {
  recoveryCodes: string[];
}

/** Etapa del login en dos pasos. */
export type MfaStage = 'verify' | 'setup';
