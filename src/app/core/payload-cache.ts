/**
 * The one place a wire payload may be cached in the browser.
 *
 * EVICTION RULE. Every cached wire payload lives under one reserved key
 * prefix, and the payload version it was written under is stored inside that
 * same namespace. When the editor announces a version different from the
 * stored one — in EITHER direction, since a rolled-back editor leaves a newer
 * cache behind — or when no version is stored at all (the state of every
 * browser that ran a build before this one), the whole namespace is cleared
 * before any screen reads from it (PayloadVersionService does the sequencing).
 *
 * WHY A PREFIX AND NOT A LIST OF KEY NAMES. A list of "keys to evict" has to
 * be kept in step with every place that caches something, and the one that is
 * forgotten is the one that renders a retired shape after an upgrade — the
 * exact failure this exists to prevent, and a silent one. With a prefix, a
 * payload cached under a new name is evicted without anyone remembering to
 * add it, and a payload cached outside the prefix is a failing test
 * (tools/wire-guards.mjs), not a stale screen.
 *
 * Operator preferences (`userLanguage`, the floating play-controls position)
 * are deliberately OUTSIDE the prefix: a wire change says nothing about them,
 * and clearing them would cost the operator their settings for no reason.
 *
 * localStorage is a cache, never a source of truth (constitution V), and a
 * browser may block it: every access is wrapped, and a blocked store reads as
 * empty and drops writes.
 */
export const PAYLOAD_CACHE_PREFIX = 'cuems.payload.';

const VERSION_KEY = `${PAYLOAD_CACHE_PREFIX}version`;

/**
 * Bare keys written by builds before the prefix existed. Nothing reads them
 * any more; they are removed with the namespace so a pre-upgrade payload is
 * not left lying at a bare key either. A closed list of RETIRED names — new
 * payloads go under the prefix, never here.
 */
const RETIRED_BARE_KEYS = ['initial_template', 'initial_mappings'];

/** Cache names in use. Each is stored as PAYLOAD_CACHE_PREFIX + name. */
export type PayloadCacheName = 'initial_mappings';

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const PayloadCache = {
  /** The parsed payload, or null when absent, unparseable or storage is blocked. */
  read<T = unknown>(name: PayloadCacheName): T | null {
    try {
      const raw = storage()?.getItem(PAYLOAD_CACHE_PREFIX + name);
      return raw == null ? null : JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  write(name: PayloadCacheName, value: unknown): void {
    try {
      storage()?.setItem(PAYLOAD_CACHE_PREFIX + name, JSON.stringify(value));
    } catch {
      // blocked or full: the cache is an optimisation, never a requirement
    }
  },

  /** The payload version the cache was written under; null when none is stored. */
  storedVersion(): number | null {
    try {
      const raw = storage()?.getItem(VERSION_KEY);
      if (raw == null) return null;
      const version = Number(raw);
      return Number.isInteger(version) ? version : null;
    } catch {
      return null;
    }
  },

  setStoredVersion(version: number): void {
    try {
      storage()?.setItem(VERSION_KEY, String(version));
    } catch {
      // blocked: the next session evicts again, which is safe
    }
  },

  /** Remove every key under the prefix, the stored version included, and the retired bare keys. */
  clear(): void {
    const store = storage();
    if (!store) return;
    try {
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key?.startsWith(PAYLOAD_CACHE_PREFIX)) doomed.push(key);
      }
      [...doomed, ...RETIRED_BARE_KEYS].forEach(key => store.removeItem(key));
    } catch {
      // blocked: nothing readable to clear
    }
  },

  /**
   * Evict when the stored version differs from `announced` (either way) or is
   * missing, then record `announced`. Returns whether anything was evicted.
   */
  evictUnless(announced: number): boolean {
    const stored = PayloadCache.storedVersion();
    const evict = stored !== announced;
    if (evict) PayloadCache.clear();
    PayloadCache.setStoredVersion(announced);
    return evict;
  },
};
