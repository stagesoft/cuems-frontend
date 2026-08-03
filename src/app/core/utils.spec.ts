import {
  findInvalidFadeCuesInContents,
  isValidFadeDurationTc,
  normalizeFadeDurationTc,
  timecodeToMs,
} from './utils';

describe('timecodeToMs', () => {
  it('parses canonical timecodes', () => {
    expect(timecodeToMs('00:00:00.300')).toBe(300);
    expect(timecodeToMs('01:02:03.004')).toBe(3723004);
  });

  it('returns 0 for the zero timecode', () => {
    expect(timecodeToMs('00:00:00.000')).toBe(0);
  });

  it('rejects malformed strings', () => {
    expect(timecodeToMs('0:0:3:0')).toBeNull();
    expect(timecodeToMs('00:00:03')).toBeNull();
    expect(timecodeToMs('garbage')).toBeNull();
    expect(timecodeToMs('')).toBeNull();
    expect(timecodeToMs(null)).toBeNull();
    expect(timecodeToMs(undefined)).toBeNull();
  });
});

describe('normalizeFadeDurationTc', () => {
  it('keeps canonical values as-is', () => {
    expect(normalizeFadeDurationTc('00:00:00.300')).toBe('00:00:00.300');
  });

  it('converts legacy frames shape at 25 fps', () => {
    expect(normalizeFadeDurationTc('0:0:3:0')).toBe('00:00:03.000');
    expect(normalizeFadeDurationTc('0:0:1:5')).toBe('00:00:01.200');
  });

  it('handles the frames shape with a spurious .mmm suffix (formatTimecode)', () => {
    expect(normalizeFadeDurationTc('0:0:3:0.000')).toBe('00:00:03.000');
  });

  it('treats short ms digits literally, mirroring CTimecode (.3 is 3 ms)', () => {
    expect(normalizeFadeDurationTc('00:00:00.3')).toBe('00:00:00.003');
    expect(normalizeFadeDurationTc('00:00:00.30')).toBe('00:00:00.030');
  });

  it('rejects unparseable values', () => {
    expect(normalizeFadeDurationTc('garbage')).toBeNull();
    expect(normalizeFadeDurationTc('00:00:03')).toBeNull();
    expect(normalizeFadeDurationTc('')).toBeNull();
    expect(normalizeFadeDurationTc(null)).toBeNull();
  });
});

describe('isValidFadeDurationTc', () => {
  it('accepts positive durations, canonical or legacy', () => {
    expect(isValidFadeDurationTc('00:00:00.300')).toBeTrue();
    expect(isValidFadeDurationTc('0:0:3:0')).toBeTrue();
    expect(isValidFadeDurationTc('00:00:00.3')).toBeTrue();
  });

  it('rejects zero in any shape', () => {
    expect(isValidFadeDurationTc('00:00:00.000')).toBeFalse();
    expect(isValidFadeDurationTc('0:0:0:0')).toBeFalse();
  });

  it('rejects missing/unparseable values', () => {
    expect(isValidFadeDurationTc(undefined)).toBeFalse();
    expect(isValidFadeDurationTc('garbage')).toBeFalse();
  });
});

describe('findInvalidFadeCuesInContents', () => {
  const fade = (duration: any, name = 'Fade', id = 'f1') => ({
    FadeCue: { name, id, duration },
  });

  it('flags zero and missing durations with name and id', () => {
    const offenders = findInvalidFadeCuesInContents([
      fade({ CTimecode: '00:00:00.000' }, 'Fade A', 'id-a'),
      fade(undefined, 'Fade B', 'id-b'),
    ]);
    expect(offenders).toEqual([
      { name: 'Fade A', id: 'id-a' },
      { name: 'Fade B', id: 'id-b' },
    ]);
  });

  it('recurses nested CueLists', () => {
    const contents = [
      { CueList: { contents: [fade({ CTimecode: '00:00:00.000' }, 'Inner', 'deep')] } },
    ];
    expect(findInvalidFadeCuesInContents(contents)).toEqual([
      { name: 'Inner', id: 'deep' },
    ]);
  });

  it('ignores non-fade items and accepts valid fades', () => {
    const contents = [
      { AudioCue: { name: 'a', Media: { duration: '00:00:00.000' } } },
      'not a dict' as any,
      fade({ CTimecode: '00:00:00.300' }),
    ];
    expect(findInvalidFadeCuesInContents(contents)).toEqual([]);
  });

  it('handles empty/absent contents', () => {
    expect(findInvalidFadeCuesInContents([])).toEqual([]);
    expect(findInvalidFadeCuesInContents(null)).toEqual([]);
    expect(findInvalidFadeCuesInContents(undefined)).toEqual([]);
  });
});
