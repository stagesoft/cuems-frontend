// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
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

/**
 * FadeCue curve types the fade engine actually implements.
 *
 * These are the exact strings `CurveFactory::createCurve()` accepts in
 * gradient-motion-engine (`src/gradient/CurveFactory.cpp`). Anything else makes
 * it return `nullopt`, and `MotionFactory` then discards the WHOLE motion — the
 * cue snaps to its target instead of fading, with no error in the UI and none
 * in the engine either, because the engine→gradient OSC send is fire-and-forget.
 *
 * The editor used to offer 'exponential' and 'logarithmic', which the engine has
 * never implemented, so half the operator's choices were silently dead.
 */
export const FADE_CURVE_TYPES = [
  'linear',
  'ease_in',
  'ease_out',
  'sigmoid',
] as const;

export type FadeCurveType = (typeof FADE_CURVE_TYPES)[number];

/**
 * Legacy editor curve names → the engine curve that produces that shape.
 *
 * `ease_in`/`ease_out` take an `exponent` param (default 2.0), so `ease_in` IS
 * the accelerating "exponential" ramp an operator means, and `ease_out` is the
 * decelerating "logarithmic" one. Mapping rather than dropping keeps both
 * options working with no C++ change and no gradient-motiond release.
 */
const LEGACY_FADE_CURVES: Record<string, FadeCurveType> = {
  exponential: 'ease_in',
  logarithmic: 'ease_out',
};

/**
 * Coerce any stored curve_type to one the engine implements.
 *
 * Applied when LOADING a project so cues authored before this fix keep working
 * and are healed on the next save. Unknown values fall back to 'linear' rather
 * than being passed through, because passing an unimplemented curve through is
 * exactly what made the fade silently do nothing.
 */
export function normalizeFadeCurveType(
  value: string | null | undefined
): FadeCurveType {
  if (!value) return 'linear';
  if ((FADE_CURVE_TYPES as readonly string[]).includes(value)) {
    return value as FadeCurveType;
  }
  return LEGACY_FADE_CURVES[value] ?? 'linear';
}

// ─── Media cues and the save payload (869fej07m) ────────────────────────

export type MediaCueProblem = {
  name: string;
  id: string;
  fileName: string | null;
  reason: 'no-media' | 'deleted';
};

export type MediaCueCheck = {
  /** Cues the save must not send: no usable media block, or a file the
   *  library no longer knows (trash-deleted). */
  blocking: MediaCueProblem[];
  /** Cues whose file sits in the media trash: saved as is, worth a warning. */
  trashed: { name: string; id: string; fileName: string }[];
};

/** unix_names present in a `file_list` / `file_trash_list` payload
 *  (arrays of `{ <uuid>: { unix_name, … } }`). */
export function libraryUnixNames(list: any[] | null | undefined): Set<string> {
  const names = new Set<string>();
  if (!Array.isArray(list)) return names;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    for (const file of Object.values(entry) as any[]) {
      if (file && typeof file.unix_name === 'string') names.add(file.unix_name);
    }
  }
  return names;
}

export type MediaResolution = 'ok' | 'trashed' | 'missing' | 'none';

/** Where a cue's media file stands relative to the library lists. */
export function mediaResolution(
  fileName: string | null | undefined,
  fileList: any[] | null | undefined,
  trashList: any[] | null | undefined
): MediaResolution {
  if (!fileName) return 'none';
  if (libraryUnixNames(fileList).has(fileName)) return 'ok';
  if (libraryUnixNames(trashList).has(fileName)) return 'trashed';
  return 'missing';
}

/**
 * Walk a server-format cue tree and classify every AudioCue/VideoCue's media.
 * Recurses nested CueLists. The save paths block on `blocking` and warn on
 * `trashed`; the editor refuses the same shapes server-side.
 */
export function findMediaCueProblems(
  contents: any[] | null | undefined,
  fileList: any[] | null | undefined,
  trashList: any[] | null | undefined
): MediaCueCheck {
  const known = libraryUnixNames(fileList);
  const trashed = libraryUnixNames(trashList);
  const result: MediaCueCheck = { blocking: [], trashed: [] };
  const walk = (items: any[] | null | undefined) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      if (item.CueList) walk(item.CueList.contents);
      for (const key of ['AudioCue', 'VideoCue']) {
        const cue = item[key];
        if (!cue || typeof cue !== 'object') continue;
        const name = cue.name || 'unnamed';
        const id = cue.id || 'unknown';
        const media = cue.Media;
        if (!media || typeof media !== 'object' || !media.file_name || !('id' in media)) {
          result.blocking.push({ name, id, fileName: null, reason: 'no-media' });
        } else if (known.has(media.file_name)) {
          continue;
        } else if (trashed.has(media.file_name)) {
          result.trashed.push({ name, id, fileName: media.file_name });
        } else {
          result.blocking.push({ name, id, fileName: media.file_name, reason: 'deleted' });
        }
      }
    }
  };
  walk(contents);
  return result;
}

/**
 * The `Media` block the edit page sends for an audio/video cue.
 *
 * A file picked in the library (`selectedMediaFile`) wins. Otherwise the
 * cue's ORIGINAL block is kept untouched: the page could not match the file
 * in its library list (trashed, deleted, list not loaded yet), and dropping
 * the block here used to erase the cue's media on save. `undefined` only
 * when the cue never had media.
 */
export function mediaBlockToSave(
  originalMedia: any,
  selectedMediaFile: { uuid: string; file: any } | null | undefined
): any | undefined {
  if (selectedMediaFile?.file?.unix_name) {
    return {
      file_name: selectedMediaFile.file.unix_name,
      id: selectedMediaFile.uuid,
      // Real duration from the file_list metadata; the `||` covers legacy
      // rows with a NULL duration (the editor's safety net corrects it).
      duration: selectedMediaFile.file.duration || '00:00:00.000',
      regions: [
        {
          Region: {
            id: 0,
            loop: 1,
            in_time: { CTimecode: '00:00:00.000' },
            out_time: { CTimecode: '00:00:00.000' }
          }
        }
      ]
    };
  }
  if (originalMedia && typeof originalMedia === 'object' && originalMedia.file_name) {
    return JSON.parse(JSON.stringify(originalMedia));
  }
  return undefined;
}

/**
 * `ui_properties.warning` as a number, or null when unset.
 *
 * The XML type is `anyType`, so an absent value comes back as the string
 * "None" (every saved media cue carries it) and digits come back as strings;
 * comparing against `null`/`2` never matched and the warning icon never
 * rendered for a saved cue.
 */
export function normalizeUiWarning(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === 'None' || trimmed === 'null') return null;
    const n = Number(trimmed);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof value === 'number') return value;
  return null;
}

/**
 * Copy `text` to the system clipboard; resolves to whether it worked.
 *
 * The UI is served over plain http on the cluster LAN (`http://<host>/`),
 * which is not a secure context, so `navigator.clipboard` is undefined there.
 * Fall back to the legacy hidden-textarea + `execCommand('copy')` path, which
 * still works from a click handler.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // permission denied / document not focused: try the legacy path
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
