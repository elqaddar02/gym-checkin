/**
 * The owner signs in with an identifiant (a username), not an email address.
 * Stored lowercase, so the same rule has to run when writing and when looking up.
 */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/**
 * What a *new* identifiant may look like: 3 to 32 characters, starting with a
 * letter or a digit, then letters, digits, dot, underscore or hyphen.
 * Sign-in does not check this — an identifiant that cannot exist simply matches
 * nothing, and rejecting it early would tell an attacker which form is in use.
 */
export function isValidUsername(value: string): boolean {
  return USERNAME.test(value);
}
