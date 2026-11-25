import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment as env } from '@envs/environment';
import { endpoint } from '@shared/apis/endpoint';
import { BaseResponse } from '@shared/models/base-api-response.interface';

export interface ChangePasswordRequest {
  password: string;
  newPassword: string;
  confirmNewPassword: string;
}

/** `PUT admin/auth/me` (§10.4): `password` es la contraseña actual (un fallo cuenta para el bloqueo de 5 intentos). */
export interface UpdateProfileRequest {
  name: string;
  email: string;
  password: string;
}

/** Mi cuenta: perfil, verificación en dos pasos y contraseña del administrador conectado (§5.1 y §10.4 del contrato). */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private http = inject(HttpClient);

  /** `data`: lo mismo que `GET auth/me`. Las sesiones no se cierran (el JWT no lleva datos personales). */
  updateProfile(body: UpdateProfileRequest): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(`${env.apiUrl}${endpoint.ACCOUNT_ME}`, body);
  }

  /** `data`: `{ enabled, recoveryCodesLeft }`. */
  mfaStatus(): Observable<BaseResponse> {
    return this.http.get<BaseResponse>(`${env.apiUrl}${endpoint.MFA_STATUS}`);
  }

  /** Pide el código actual de la app; `data`: `{ recoveryCodes: [10] }` (los anteriores dejan de servir). */
  regenerateRecoveryCodes(code: string): Observable<BaseResponse> {
    return this.http.post<BaseResponse>(`${env.apiUrl}${endpoint.MFA_RECOVERY_CODES}`, { code });
  }

  /** `PUT admin/auth/password`: incrementa session_version, así que todas las sesiones (también esta) quedan cerradas. */
  changePassword(body: ChangePasswordRequest): Observable<BaseResponse> {
    return this.http.put<BaseResponse>(`${env.apiUrl}${endpoint.CHANGE_PASSWORD}`, body);
  }
}
