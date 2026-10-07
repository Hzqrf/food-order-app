/** Mirrors the server's normalize_my_phone: Malaysian numbers to +60 format, or null. */
export function normalizeMyPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("60")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length < 8 || digits.length > 10 || digits.startsWith("0")) return null;
  return `+60${digits}`;
}

/** "+60123456789" -> "+60 12-345 6789", so a customer can spot a mistyped digit. */
export function formatMyPhone(e164: string): string {
  const d = e164.replace(/^\+60/, "");
  if (d.startsWith("1")) {
    const rest = d.slice(2);
    const split = rest.length === 8 ? 4 : 3;
    return `+60 ${d.slice(0, 2)}-${rest.slice(0, split)} ${rest.slice(split)}`;
  }
  return `+60 ${d.slice(0, 1)}-${d.slice(1, 5)} ${d.slice(5)}`;
}
