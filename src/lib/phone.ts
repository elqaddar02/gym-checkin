/**
 * Normalize a Moroccan phone number to +212XXXXXXXXX.
 * Accepts 0612345678, 612345678, 212612345678, 00212612345678, +212 6 12 34 56 78.
 * Returns null if it doesn't look like a valid number.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (raw.startsWith("+") && !digits.startsWith("212")) {
    // Foreign number: keep as-is in E.164 form.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.startsWith("00212")) digits = digits.slice(5);
  else if (digits.startsWith("212")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);

  return /^[5-7]\d{8}$/.test(digits) ? `+212${digits}` : null;
}

/** +212612345678 -> 06 12 34 56 78 */
export function formatPhone(phone: string): string {
  if (!phone.startsWith("+212")) return phone;
  const local = `0${phone.slice(4)}`;
  return local.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

/** Digits a receptionist would type for this number, for substring search. */
export function phoneSearchKey(phone: string): string {
  return phone.startsWith("+212") ? `0${phone.slice(4)}` : phone.replace(/\D/g, "");
}

/** Turn a typed query into digits comparable with phoneSearchKey. */
export function phoneQueryDigits(query: string): string {
  let digits = query.replace(/\D/g, "");
  if (digits.startsWith("00212")) digits = `0${digits.slice(5)}`;
  else if (digits.startsWith("212")) digits = `0${digits.slice(3)}`;
  return digits;
}
