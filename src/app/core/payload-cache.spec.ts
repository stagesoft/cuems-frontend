import { PAYLOAD_CACHE_PREFIX, PayloadCache } from './payload-cache';

// The source sweep that pairs with these (no wire payload cached at a bare
// key anywhere in src/app, *.ts and *.html) is tools/wire-guards.mjs, run by
// `npm run test:ci` before Karma: a browser cannot read the source tree.
describe('PayloadCache', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('round-trips a payload under the reserved prefix', () => {
    PayloadCache.write('initial_mappings', { type: 'initial_mappings', value: { a: 1 } });
    expect(localStorage.getItem(`${PAYLOAD_CACHE_PREFIX}initial_mappings`)).not.toBeNull();
    expect(localStorage.getItem('initial_mappings')).toBeNull();
    expect(PayloadCache.read('initial_mappings')).toEqual({ type: 'initial_mappings', value: { a: 1 } });
  });

  it('reads an absent or unparseable entry as null', () => {
    expect(PayloadCache.read('initial_mappings')).toBeNull();
    localStorage.setItem(`${PAYLOAD_CACHE_PREFIX}initial_mappings`, '{not json');
    expect(PayloadCache.read('initial_mappings')).toBeNull();
  });

  it('stores the payload version inside the namespace', () => {
    expect(PayloadCache.storedVersion()).toBeNull();
    PayloadCache.setStoredVersion(1);
    expect(PayloadCache.storedVersion()).toBe(1);
    expect(localStorage.getItem(`${PAYLOAD_CACHE_PREFIX}version`)).toBe('1');
  });

  it('reads a garbled stored version as missing', () => {
    localStorage.setItem(`${PAYLOAD_CACHE_PREFIX}version`, 'one');
    expect(PayloadCache.storedVersion()).toBeNull();
  });

  describe('evictUnless', () => {
    function seed(version: number | null) {
      if (version !== null) PayloadCache.setStoredVersion(version);
      PayloadCache.write('initial_mappings', { cached: true });
      localStorage.setItem(`${PAYLOAD_CACHE_PREFIX}some_future_payload`, '{}');
      localStorage.setItem('userLanguage', 'ca');
      localStorage.setItem('cuems.playControls.position', '{"x":1}');
    }

    it('keeps the cache when the stored version matches', () => {
      seed(1);
      expect(PayloadCache.evictUnless(1)).toBeFalse();
      expect(PayloadCache.read('initial_mappings')).toEqual({ cached: true });
    });

    it('clears the whole namespace when the editor is newer', () => {
      seed(1);
      expect(PayloadCache.evictUnless(2)).toBeTrue();
      expect(PayloadCache.read('initial_mappings')).toBeNull();
      expect(localStorage.getItem(`${PAYLOAD_CACHE_PREFIX}some_future_payload`)).toBeNull();
      expect(PayloadCache.storedVersion()).toBe(2);
    });

    it('clears the whole namespace when the editor is older (a rollback)', () => {
      seed(2);
      expect(PayloadCache.evictUnless(1)).toBeTrue();
      expect(PayloadCache.read('initial_mappings')).toBeNull();
      expect(PayloadCache.storedVersion()).toBe(1);
    });

    it('treats a missing stored version as a difference — every browser in the field today', () => {
      seed(null);
      expect(PayloadCache.evictUnless(1)).toBeTrue();
      expect(PayloadCache.read('initial_mappings')).toBeNull();
    });

    it('removes the retired bare keys a pre-upgrade build left behind', () => {
      localStorage.setItem('initial_template', '{}');
      localStorage.setItem('initial_mappings', '{}');
      PayloadCache.evictUnless(1);
      expect(localStorage.getItem('initial_template')).toBeNull();
      expect(localStorage.getItem('initial_mappings')).toBeNull();
    });

    it('never touches operator preferences', () => {
      seed(0);
      PayloadCache.evictUnless(1);
      expect(localStorage.getItem('userLanguage')).toBe('ca');
      expect(localStorage.getItem('cuems.playControls.position')).toBe('{"x":1}');
    });
  });

  it('works, as a no-op, when storage is blocked', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    expect(() => PayloadCache.write('initial_mappings', {})).not.toThrow();
    expect(PayloadCache.read('initial_mappings')).toBeNull();
    expect(PayloadCache.storedVersion()).toBeNull();
    expect(() => PayloadCache.evictUnless(1)).not.toThrow();
  });
});
