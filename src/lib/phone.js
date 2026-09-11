// Phone numbers are stored in E.164 (+1XXXXXXXXXX) and shown as (819) 208-5721.

/** Normalize any North-American input to E.164, or return null if invalid. */
export function normalizePhone(input) {
  if (!input) return null;
  let digits = String(input).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  // NANP: area code and exchange cannot start with 0 or 1.
  if (/^[01]/.test(digits) || /^[01]/.test(digits.slice(3, 4))) return null;
  return '+1' + digits;
}

/** (819) 208-5721 */
export function formatPhone(e164) {
  const d = String(e164 || '').replace(/\D/g, '').replace(/^1/, '');
  if (d.length !== 10) return e164 || '';
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** 819-208-5721 — the compact form used in the organisation's public texts. */
export function formatPhoneDash(e164) {
  const d = String(e164 || '').replace(/\D/g, '').replace(/^1/, '');
  if (d.length !== 10) return e164 || '';
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}
