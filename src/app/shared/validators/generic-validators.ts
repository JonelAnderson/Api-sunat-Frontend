import { AbstractControl, FormControl, ValidatorFn } from '@angular/forms';

/**
 * Validadores de formulario compartidos. Solo los que usa la aplicación (se limpiaron los que no tenían uso).
 * Las mayúsculas ya no se aplican aquí: las pone la regla global `installUppercaseTextInputs` (shared/functions).
 */
export class GenericValidators {
  /**
   * Validar que todos los caracteres sean solo números o caracteres de alfabeto
   * @param control valor de control de formulario
   */
  static alphanumeric(control: AbstractControl): { [key: string]: boolean } | null {
    if (control.value != null && control.value.toString().trim() != '') {
      if (/^[0-9a-zA-Z, ]+$/.test(control.value)) {
        return null;
      } else {
        return { alphanumeric: true };
      }
    } else {
      return null;
    }
  }

  /**
   * Validar que todos los caracteres sean solo números, letras, espacios o puntos
   * @param control valor de control de formulario
   */
  static defaultDescription(control: AbstractControl): { [key: string]: boolean } | null {
    if (control.value != null && control.value.toString().trim() != '') {
      if (/^[0-9 a-zA-Z.ÑñÁÉÍÓÚáéíóúÄËÏÖÜäëïöü]+$/.test(control.value)) return null;
      else return { defaultDescription: true };
    } else {
      return null;
    }
  }

  /**
   * Validar que todos los caracteres sean solo letras o espacios
   * @param control valor de control de formulario
   */
  static defaultName(control: AbstractControl): { [key: string]: boolean } | null {
    if (control.value != null && control.value.toString().trim() != '') {
      if (/^[a-zA-Z ÑñÁÉÍÓÚáéíóúÄËÏÖÜäëïöü]+$/.test(control.value)) return null;
      else return { defaultName: true };
    } else {
      return null;
    }
  }

  /** Validar que no sean solo espacios en blanco */
  static notOnlyWhitespaceValidator(control: FormControl) {
    const value = control.value;
    const isWhitespace = (value ?? '').trim().length === 0;
    const isValid = !isWhitespace;
    return isValid ? null : { whitespace: true };
  }

  /** Validar que todos los caracteres sean caracteres de alfabeto (con tildes) y espacios */
  static onlyTextOrSpaceValidator(control: AbstractControl): { [key: string]: boolean } | null {
    if (control.value != null && control.value.toString().trim() != '') {
      if (/^[A-ZÁÉÍÓÚÄËÏÖÜÑa-záéíóúäëïöüñ ]+$/.test(control.value)) return null;
      else return { IsNotTextOrSpace: true };
    } else {
      return null;
    }
  }

  /**
   * Valida un email
   * @param control valor de control de formulario
   */
  static emailValidation(control: AbstractControl): { [key: string]: boolean } | null {
    if (control.value != null && control.value.toString().trim() != '') {
      if (/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/.test(control.value)) return null;
      else return { emailValidation: true };
    } else {
      return null;
    }
  }

  /**
   * Validar que todos los caracteres sean solo números
   * @param control valor de control de formulario
   */
  static onlyNumberValidator(control: AbstractControl): { [key: string]: boolean } | null {
    if (control.value != null && control.value.toString().trim() != '') {
      if (/^[0-9]+$/.test(control.value)) return null;
      else return { IsNotNumber: true };
    } else {
      return null;
    }
  }

  /**
   * Validar que todos los caracteres sean caracteres de alfabeto y espacios
   * @param control valor de control de formulario
   */
  static onlyTextAndSpaceValidator(control: AbstractControl): { [key: string]: boolean } | null {
    if (control.value != null && control.value.toString().trim() != '') {
      if (/^[A-Za-zñÑ_ ]+$/.test(control.value)) return null;
      else return { IsNotTextOrSpace: true };
    } else {
      return null;
    }
  }

  /**
   * Validar que no contenga espacios
   * @param control valor de control de formulario
   */
  static noSpacesValidator(control: AbstractControl): { [key: string]: boolean } | null {
    if (control.value != null && control.value.toString().includes(' ')) {
      return { hasSpaces: true }; // Inválido si contiene espacios
    } else {
      return null; // Válido
    }
  }

  /** Validar celular que empiece con 9 */
  static celularValidate(control: AbstractControl): { [key: string]: boolean } | null {
    if (control.value != null && control.value.toString().trim() != '') {
      if (/^(9)/.test(control.value)) {
        return null;
      } else {
        return { celularValidate: true };
      }
    } else {
      return null;
    }
  }

  /* Validar que la opcion elegida exista en el array de opciones */
  static optionExistInArray(aOptions: any): ValidatorFn {
    return function (control: AbstractControl): { [key: string]: boolean } | null {
      if (control.value != null && control.value.toString().trim() != '') {
        if (aOptions.includes(control.value)) return null;
        else return { optionInvalid: true };
      } else {
        return null;
      }
    };
  }

  /* Validar que un array no este vacio */
  static emptyArrayOptions(arrayOptions: any): ValidatorFn {
    return function (control: AbstractControl): { [key: string]: boolean } | null {
      if (!arrayOptions.length) {
        return { isEmptyArrayOptions: true };
      } else {
        return null;
      }
    };
  }
}
