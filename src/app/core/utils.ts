/**
 * Generate a slug from a string using hyphens instead of underscores
 * @param text The text to convert to a slug
 * @returns A slugified string with hyphens
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')        // Replace spaces with hyphens
    .replace(/[^\w\-]+/g, '')    // Remove all non-word chars
    .replace(/\-\-+/g, '-')      // Replace multiple hyphens with single hyphen
    .replace(/^-+/, '')          // Trim hyphen from start
    .replace(/-+$/, '');         // Trim hyphen from end
}

/**
 * Generate a current date string in ISO format
 */
export function generateDate(): string {
  return new Date().toISOString();
}

/**
 * Parse a canonical `HH:MM:SS.mmm` timecode string to milliseconds.
 * @returns milliseconds, or null if the string is not canonical
 */
export function timecodeToMs(tc: string | null | undefined): number | null {
  if (!tc) return null;
  const m = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(tc);
  if (!m) return null;
  return (
    parseInt(m[1], 10) * 3600000 +
    parseInt(m[2], 10) * 60000 +
    parseInt(m[3], 10) * 1000 +
    parseInt(m[4], 10)
  );
}

/**
 * Normalize a FadeCue duration string to canonical `HH:MM:SS.mmm`.
 *
 * Project XML round-trips reach the UI unnormalized, so legacy-but-valid
 * shapes must not be flagged invalid (they would block saving the whole
 * project). Accepted inputs, mirroring cuemsutils CTimecode semantics:
 * - canonical `HH:MM:SS.mmm` → returned as-is
 * - frames `H:M:S:F` (25 fps → ms = F × 40), including the `H:M:S:F.mmm`
 *   shape produced when formatTimecode appends `.000` to a frames value
 * - short ms digits are LITERAL, not scaled: `.3` is 3 ms, not 300
 *   (CTimecode parses fraction digits verbatim)
 * @returns canonical string, or null if unparseable
 */
export function normalizeFadeDurationTc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const tc = raw.trim();
  if (/^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(tc)) return tc;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const render = (h: number, min: number, s: number, ms: number): string | null => {
    if (min > 59 || s > 59 || ms > 999) return null;
    return `${pad2(h)}:${pad2(min)}:${pad2(s)}.${String(ms).padStart(3, '0')}`;
  };

  // Frames shape H:M:S:F (optionally with a spurious ".mmm" appended by
  // formatTimecode). 25 fps → 40 ms per frame.
  const frames = /^(\d{1,2}):(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/.exec(tc);
  if (frames) {
    const f = parseInt(frames[4], 10);
    if (f > 24) return null;
    const extraMs = frames[5] ? parseInt(frames[5], 10) : 0;
    const ms = f * 40 + extraMs;
    return render(
      parseInt(frames[1], 10), parseInt(frames[2], 10),
      parseInt(frames[3], 10), ms
    );
  }

  // Lenient HH:MM:SS with optional short ms digits (literal, CTimecode-style).
  const lenient = /^(\d{1,2}):(\d{1,2}):(\d{1,2})\.(\d{1,3})$/.exec(tc);
  if (lenient) {
    return render(
      parseInt(lenient[1], 10), parseInt(lenient[2], 10),
      parseInt(lenient[3], 10), parseInt(lenient[4], 10)
    );
  }
  return null;
}

/**
 * A FadeCue duration is valid when it normalizes and is strictly > 0 ms.
 * Zero-duration fades are forbidden: gradient-motiond drops them and the
 * fade would silently never happen.
 */
export function isValidFadeDurationTc(tc: string | null | undefined): boolean {
  const normalized = normalizeFadeDurationTc(tc);
  if (normalized === null) return false;
  const ms = timecodeToMs(normalized);
  return ms !== null && ms > 0;
}

/**
 * Walk server-format CueList contents and collect FadeCues whose duration
 * is missing, unparseable, or zero. Recurses nested CueLists.
 */
export function findInvalidFadeCuesInContents(
  contents: any[] | null | undefined
): { name: string; id: string }[] {
  const offenders: { name: string; id: string }[] = [];
  const walk = (items: any[] | null | undefined) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      if (item.CueList) walk(item.CueList.contents);
      if (item.FadeCue) {
        const tc = item.FadeCue.duration?.CTimecode;
        if (!isValidFadeDurationTc(tc)) {
          offenders.push({
            name: item.FadeCue.name || 'unnamed',
            id: item.FadeCue.id || 'unknown',
          });
        }
      }
    }
  };
  walk(contents);
  return offenders;
}
