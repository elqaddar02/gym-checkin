import { phoneQueryDigits, phoneSearchKey } from "./phone";

interface Searchable {
  name: string;
  phone: string;
  /** Missing on tablet caches written before codes existed. */
  code?: number | null;
}

export type SearchMode = "code" | "phone" | "name";

export interface SearchResult<T> {
  mode: SearchMode;
  results: T[];
  /** The member whose code is exactly what was typed, if any. */
  exact: T | null;
}

function fold(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * How reception finds a member.
 *
 * - Letters: by name.
 * - Digits starting with 0 or +: by phone — a code never starts with 0, so a
 *   member who forgot their code can still be found by number.
 * - Any other digits: by code. The exact code comes first, then codes that
 *   start with what was typed ("1" → 1, 10, 11…), lowest first.
 */
export function searchMembers<T extends Searchable>(members: T[], query: string, limit = 6): SearchResult<T> {
  const q = query.trim();
  if (!q) return { mode: "code", results: [], exact: null };

  if (/\p{L}/u.test(q)) {
    const folded = fold(q);
    const results = members
      .filter((m) => fold(m.name).includes(folded))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
    return { mode: "name", results, exact: null };
  }

  if (q.startsWith("0") || q.startsWith("+")) {
    const digits = phoneQueryDigits(q);
    const results = members
      .filter((m) => digits.length > 0 && phoneSearchKey(m.phone).includes(digits))
      .sort((a, b) => {
        const pa = phoneSearchKey(a.phone).startsWith(digits) ? 0 : 1;
        const pb = phoneSearchKey(b.phone).startsWith(digits) ? 0 : 1;
        return pa - pb || a.name.localeCompare(b.name);
      })
      .slice(0, limit);
    return { mode: "phone", results, exact: null };
  }

  const digits = q.replace(/\D/g, "");
  if (!digits) return { mode: "code", results: [], exact: null };
  const results = members
    .filter((m) => m.code != null && String(m.code).startsWith(digits))
    .sort((a, b) => a.code! - b.code!)
    .slice(0, limit);
  const exact = results[0] && String(results[0].code) === digits ? results[0] : null;
  return { mode: "code", results, exact };
}
