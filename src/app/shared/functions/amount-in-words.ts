// Monto en letras para la representación impresa de comprobantes: "SON: CIENTO VEINTE CON 50/100 SOLES".

const UNITS = [
  '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE',
  'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS',
  'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'
];
const TENS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const HUNDREDS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function below1000(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest) {
    parts.push(rest < 30 ? UNITS[rest] : TENS[Math.floor(rest / 10)] + (rest % 10 ? ` Y ${UNITS[rest % 10]}` : ''));
  }
  return parts.join(' ');
}

/** "UNO" delante de MIL / MILLONES se apocopa: "UN MIL…", "VEINTIÚN MIL", "TREINTA Y UN MILLONES". */
function apocope(words: string): string {
  return words.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');
}

/** Entero (0 a 999 999 999) en letras mayúsculas. */
export function integerInWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return 'CERO';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? 'UN MILLÓN' : `${apocope(integerInWords(millions))} MILLONES`);
  if (thousands) parts.push(thousands === 1 ? 'MIL' : `${apocope(below1000(thousands))} MIL`);
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}

/** "SON: CIENTO VEINTE CON 50/100 SOLES" (PEN) o "… DÓLARES AMERICANOS" (USD). */
export function amountInWords(amount: number, currencyCode = 'PEN'): string {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const integer = Math.floor(rounded);
  const cents = Math.round((rounded - integer) * 100);
  const currency = currencyCode === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES';
  return `SON: ${integerInWords(integer)} CON ${String(cents).padStart(2, '0')}/100 ${currency}`;
}
