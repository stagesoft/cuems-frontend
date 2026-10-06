/**
 * How a cue sits on the wire, at payload version 1 (project delta (c)).
 *
 * A hardware cue is `{"Cue": {…, "class": "audio" | "video" | "dmx" | …}}` and
 * each of its outputs `{"CueOutput": {…, "class": …}}`, with `class` as the last
 * key. ActionCue, FadeCue and CueList keep their own keys and carry no class.
 *
 * `class` is OPEN vocabulary: the document may carry a class this UI has no
 * editor for. Such a cue is kind `other` — listed, identified by its class,
 * written back exactly as it arrived, and never an error (FR-012).
 *
 * The words audio / video / dmx stay in the internal vocabulary (type
 * unions, icons, translation keys, routes). They are not wire keys.
 */
export const HARDWARE_CUE_KEY = 'Cue';
export const CUE_OUTPUT_KEY = 'CueOutput';

/** Cue keys this UI reads. Anything else in a CueList is not a cue it lists. */
const CUE_KEYS = [HARDWARE_CUE_KEY, 'ActionCue', 'FadeCue', 'CueList'] as const;
export type CueKey = typeof CUE_KEYS[number];

/** Hardware classes this UI has an editor for. */
export const EDITABLE_CLASSES = ['audio', 'video', 'dmx'] as const;
export type EditableClass = typeof EDITABLE_CLASSES[number];

export type CueKind = EditableClass | 'action' | 'fade' | 'cuelist' | 'other';

export function cueKeyOf(item: any): CueKey | null {
  if (!item || typeof item !== 'object') return null;
  return CUE_KEYS.find(key => key in item) ?? null;
}

export function cueDataOf(item: any): any {
  const key = cueKeyOf(item);
  return key ? item[key] : null;
}

/** The hardware class, or null for a cue that has none (and for a non-cue). */
export function cueClassOf(item: any): string | null {
  if (cueKeyOf(item) !== HARDWARE_CUE_KEY) return null;
  const cls = item[HARDWARE_CUE_KEY]?.class;
  return typeof cls === 'string' && cls.length > 0 ? cls : null;
}

export function isEditableClass(cls: string | null | undefined): cls is EditableClass {
  return (EDITABLE_CLASSES as readonly string[]).includes(cls as string);
}

export function cueKindOf(item: any): CueKind | null {
  switch (cueKeyOf(item)) {
    case HARDWARE_CUE_KEY: {
      const cls = cueClassOf(item);
      return isEditableClass(cls) ? cls : 'other';
    }
    case 'ActionCue': return 'action';
    case 'FadeCue': return 'fade';
    case 'CueList': return 'cuelist';
    default: return null;
  }
}

/** `obj` with `class` set to `cls` as its last key, as the wire carries it. */
export function withClassLast<T extends Record<string, any>>(obj: T, cls: string): T & { class: string } {
  const { class: _drop, ...rest } = obj;
  return { ...rest, class: cls } as T & { class: string };
}

export function wrapHardwareCue(cls: string, data: Record<string, any>): { Cue: any } {
  return { [HARDWARE_CUE_KEY]: withClassLast(data, cls) } as { Cue: any };
}

export function wrapCueOutput(cls: string, data: Record<string, any>): { CueOutput: any } {
  return { [CUE_OUTPUT_KEY]: withClassLast(data, cls) } as { CueOutput: any };
}

/** A cue's output bodies (unwrapped), optionally only those of one class. */
export function cueOutputsOf(cueData: any, cls?: string): any[] {
  const outputs = cueData?.outputs;
  if (!Array.isArray(outputs)) return [];
  return outputs
    .map((wrapper: any) => wrapper?.[CUE_OUTPUT_KEY])
    .filter((output: any) => output && (cls === undefined || output.class === cls));
}

/**
 * A `{"CTimecode": "…"}` wrapper read as its string (project delta (b)); null
 * for anything else. The wrapper object is truthy, so `duration || '-'` would
 * not fall through — it would render as `[object Object]`.
 */
export function timecodeText(value: any): string | null {
  return value && typeof value === 'object' && typeof value.CTimecode === 'string'
    ? value.CTimecode
    : null;
}
