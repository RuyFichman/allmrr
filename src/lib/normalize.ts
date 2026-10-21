const MAX_SLUG_LENGTH = 60;
const X_HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

// "Café Ops!" -> "cafe-ops". Falls back to "startup" when nothing usable is left.
export function slugify(input: string) {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
  return slug || "startup";
}

// Returns `base`, or the first free `base-2`, `base-3`, … not in `taken`.
export function uniqueSlug(base: string, taken: Iterable<string>) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// Adds https:// when missing. Returns null for anything that is not a plausible web URL.
export function normalizeUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".") || url.hostname.startsWith(".") || url.hostname.endsWith(".")) {
    return null;
  }

  const href = url.href;
  return url.pathname === "/" && !url.search && !url.hash ? href.replace(/\/$/, "") : href;
}

// Accepts "@acme", "acme", "x.com/acme" or "https://twitter.com/acme?s=20". Returns null if invalid.
export function normalizeXHandle(input: string) {
  const handle = input
    .trim()
    .replace(/^(https?:\/\/)?(www\.|mobile\.)?(x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  return X_HANDLE_PATTERN.test(handle) ? handle : null;
}
