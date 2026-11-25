import { ApplicationConfig, ErrorHandler, importProvidersFrom, inject, provideAppInitializer } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { installUppercaseTextInputs } from '@shared/functions/uppercase-text-inputs';
import { removeLegacyStorageKeys } from '@shared/functions/legacy-storage-cleanup';
import { provideRouter } from '@angular/router';
import { DatePipe, LocationStrategy, PathLocationStrategy } from '@angular/common';

import { provideHttpClient, withInterceptors, withInterceptorsFromDi, HttpClient } from '@angular/common/http';
import { provideToastr, ToastrModule } from 'ngx-toastr';
import { InactivityService } from '@shared/service/inactivity.service';
import { AuthInterceptor } from '@shared/interceptors/auth.interceptor';

import { GlobalErrorHandler } from '@shared/service/global-error-handler.service';
import { NgxSpinnerModule } from 'ngx-spinner';
import { AlertModalService } from '@shared/service/alert-modal.service';
import { routes } from './app.routes';
import { BrowserModule } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideTranslateService, TranslateLoader } from '@ngx-translate/core';
import { CustomTranslateLoader } from '@shared/custom-translate-loader';


export const appConfig: ApplicationConfig = {

  providers: [
    importProvidersFrom(BrowserModule,NgxSpinnerModule,ToastrModule.forRoot()),
    
    provideHttpClient(withInterceptors([AuthInterceptor])), 
    provideRouter(routes), 
    provideToastr({
      timeOut: 5000,
      positionClass: 'toast-bottom-right',
      closeButton: true,
      progressBar: true,
      preventDuplicates: true,
    }),
    InactivityService, 
    AlertModalService,
    DatePipe,
    { provide: LocationStrategy, useClass: PathLocationStrategy }, 
    { provide: ErrorHandler, useClass: GlobalErrorHandler},
    // Todo lo que se escribe en campos de texto va en mayúsculas (salvo correos, usuarios, contraseñas, URL, tokens, códigos).
    provideAppInitializer(() => installUppercaseTextInputs(inject(DOCUMENT))),
    // Borra lo que versiones anteriores dejaban en localStorage (permisos, menú, foto, datos de plantilla).
    provideAppInitializer(removeLegacyStorageKeys),
    provideHttpClient(withInterceptorsFromDi()),
     provideAnimations(),
    provideTranslateService({
      loader: { provide: TranslateLoader, useClass: CustomTranslateLoader },
      lang: 'es',
      fallbackLang: 'en'
    }),

  ]

};
