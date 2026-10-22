import {
  FADE_CURVE_TYPES,
  findInvalidFadeCuesInContents,
  findMediaCueProblems,
  mediaBlockToSave,
  mediaResolution,
  normalizeUiWarning,
  isValidFadeDurationTc,
  normalizeFadeCurveType,
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

describe('normalizeFadeCurveType', () => {
  it('keeps every engine-implemented curve as-is', () => {
    for (const c of FADE_CURVE_TYPES) {
      expect(normalizeFadeCurveType(c)).toBe(c);
    }
  });

  it('maps the legacy editor names onto the engine curve of the same shape', () => {
    // These two were offered by the editor for years and gradient-motiond has
    // never implemented either, so the fade silently did nothing.
    expect(normalizeFadeCurveType('exponential')).toBe('ease_in');
    expect(normalizeFadeCurveType('logarithmic')).toBe('ease_out');
  });

  it('falls back to linear for anything unknown, rather than passing it through', () => {
    // Passing an unimplemented curve through is the actual bug: CurveFactory
    // returns nullopt and MotionFactory discards the whole motion.
    expect(normalizeFadeCurveType('bogus')).toBe('linear');
    expect(normalizeFadeCurveType('')).toBe('linear');
    expect(normalizeFadeCurveType(null)).toBe('linear');
    expect(normalizeFadeCurveType(undefined)).toBe('linear');
  });

  it('never emits a curve the engine would reject', () => {
    const inputs = ['linear', 'exponential', 'logarithmic', 'sigmoid', 'ease_in',
                    'ease_out', 'bogus', '', null, undefined];
    for (const i of inputs) {
      expect(FADE_CURVE_TYPES).toContain(normalizeFadeCurveType(i));
    }
  });
});

// ─── Media cues and the save payload (869fej07m) ────────────────────────

const LIB = [{ 'u-1': { unix_name: 'a.wav', name: 'A', duration: '00:00:01.000' } }];
const TRASH = [{ 'u-2': { unix_name: 'old.wav', name: 'Old' } }];
const media = (file_name: string, extra: any = {}) => ({ file_name, id: 'm-1', duration: '00:00:01.000', regions: [], ...extra });
const audio = (name: string, Media?: any) => ({ AudioCue: { name, id: `id-${name}`, ...(Media === undefined ? {} : { Media }) } });

describe('mediaResolution', () => {
  it('classifies against both lists', () => {
    expect(mediaResolution('a.wav', LIB, TRASH)).toBe('ok');
    expect(mediaResolution('old.wav', LIB, TRASH)).toBe('trashed');
    expect(mediaResolution('gone.wav', LIB, TRASH)).toBe('missing');
    expect(mediaResolution(undefined, LIB, TRASH)).toBe('none');
    expect(mediaResolution('a.wav', null, undefined)).toBe('missing');
  });
});

describe('findMediaCueProblems', () => {
  it('blocks every shape without a usable media block, naming the cue', () => {
    const r = findMediaCueProblems([
      audio('absent'),
      audio('null', null),
      audio('empty', {}),
      audio('noname', { id: 'm' }),
      audio('blank', media('')),
      audio('noid', { file_name: 'a.wav' }),
      audio('fine', media('a.wav')),
    ], LIB, TRASH);
    expect(r.blocking.map(b => b.name)).toEqual(['absent', 'null', 'empty', 'noname', 'blank', 'noid']);
    expect(r.blocking.every(b => b.reason === 'no-media')).toBeTrue();
    expect(r.trashed).toEqual([]);
  });

  it('blocks a deleted file and only warns on a trashed one', () => {
    const r = findMediaCueProblems([audio('t', media('old.wav')), audio('d', media('gone.wav'))], LIB, TRASH);
    expect(r.trashed).toEqual([{ name: 't', id: 'id-t', fileName: 'old.wav' }]);
    expect(r.blocking).toEqual([{ name: 'd', id: 'id-d', fileName: 'gone.wav', reason: 'deleted' }]);
  });

  it('walks nested CueLists and ignores non-media cues', () => {
    const nested = { CueList: { id: 'l', contents: [{ VideoCue: { name: 'deep', id: 'v', Media: null } }] } };
    const r = findMediaCueProblems([{ ActionCue: { name: 'go', id: 'x' } }, nested], LIB, TRASH);
    expect(r.blocking.map(b => b.name)).toEqual(['deep']);
  });
});

describe('mediaBlockToSave', () => {
  const original = media('old.wav', { id: 'orig', regions: [{ Region: { id: 0, loop: 3 } }] });

  it('builds the block from the picked library file', () => {
    const block = mediaBlockToSave(original, { uuid: 'u-1', file: { unix_name: 'a.wav', duration: '00:00:02.000' } });
    expect(block.file_name).toBe('a.wav');
    expect(block.id).toBe('u-1');
    expect(block.duration).toBe('00:00:02.000');
  });

  it('keeps the original block untouched when nothing could be picked', () => {
    const block = mediaBlockToSave(original, undefined);
    expect(block).toEqual(original);
    expect(block).not.toBe(original);  // a copy, not the live object
  });

  it('returns undefined only when the cue never had media', () => {
    expect(mediaBlockToSave(undefined, undefined)).toBeUndefined();
    expect(mediaBlockToSave({}, null)).toBeUndefined();
    expect(mediaBlockToSave({ file_name: '' }, null)).toBeUndefined();
  });
});

describe('normalizeUiWarning', () => {
  it('treats the XML "None" and empties as unset', () => {
    for (const v of [null, undefined, '', 'None', 'null', '  ']) expect(normalizeUiWarning(v)).toBeNull();
  });
  it('reads digits, as strings or numbers', () => {
    expect(normalizeUiWarning('0')).toBe(0);
    expect(normalizeUiWarning('2')).toBe(2);
    expect(normalizeUiWarning(1)).toBe(1);
    expect(normalizeUiWarning('abc')).toBeNull();
  });
});
