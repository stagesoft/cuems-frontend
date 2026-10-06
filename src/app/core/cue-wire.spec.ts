import {
  cueClassOf, cueDataOf, cueKeyOf, cueKindOf, cueOutputsOf, isEditableClass,
  timecodeText, withClassLast, wrapCueOutput, wrapHardwareCue,
} from './cue-wire';
import { loadFixture } from '../testing/load-fixture';

describe('cue-wire', () => {
  const contents = () => loadFixture('template-as-script-013').value.CuemsScript.CueList.contents;

  it('reads the kind of each recorded tip cue', () => {
    expect(contents().map(cueKindOf)).toEqual(['audio', 'video', 'dmx', 'action', 'fade']);
    expect(contents().map(cueKeyOf)).toEqual(['Cue', 'Cue', 'Cue', 'ActionCue', 'FadeCue']);
    expect(contents().map(cueClassOf)).toEqual(['audio', 'video', 'dmx', null, null]);
  });

  it('treats an unknown class as `other` — open vocabulary, never an error', () => {
    const item = { Cue: { id: 'x', class: 'lighting' } };
    expect(cueKindOf(item)).toBe('other');
    expect(cueClassOf(item)).toBe('lighting');
    expect(isEditableClass('lighting')).toBeFalse();
  });

  it('a Cue with no class is `other` with no class', () => {
    expect(cueKindOf({ Cue: {} })).toBe('other');
    expect(cueClassOf({ Cue: {} })).toBeNull();
  });

  it('a nested CueList is `cuelist`; an unknown key is no cue', () => {
    expect(cueKindOf({ CueList: {} })).toBe('cuelist');
    expect(cueKindOf({ AudioCue: {} })).toBeNull();
    expect(cueKindOf(null)).toBeNull();
    expect(cueDataOf({ AudioCue: { id: 1 } })).toBeNull();
  });

  it('wraps a hardware cue and an output with class as the last key', () => {
    const cue = wrapHardwareCue('audio', { class: 'stale', id: 'c', name: 'n' });
    expect(Object.keys(cue)).toEqual(['Cue']);
    expect(Object.keys(cue.Cue)).toEqual(['id', 'name', 'class']);
    expect(cue.Cue.class).toBe('audio');
    const output = wrapCueOutput('video', { output_name: 'o' });
    expect(output).toEqual({ CueOutput: { output_name: 'o', class: 'video' } });
    expect(withClassLast({ a: 1 }, 'dmx')).toEqual({ a: 1, class: 'dmx' });
  });

  it('lists a cue\'s outputs, by class', () => {
    const [audio, video] = contents();
    expect(cueOutputsOf(audio.Cue).map(o => o.output_name))
      .toEqual(['0367f391-ebf4-48b2-9f26-000000000001_system:playback_1']);
    expect(cueOutputsOf(video.Cue, 'video').length).toBe(2);
    expect(cueOutputsOf(video.Cue, 'audio')).toEqual([]);
    expect(cueOutputsOf({ outputs: null })).toEqual([]);
  });

  it('reads a CTimecode wrapper, and nothing else, as its text', () => {
    expect(timecodeText({ CTimecode: '00:00:01.500' })).toBe('00:00:01.500');
    expect(timecodeText('00:00:01.500')).toBeNull();
    expect(timecodeText(null)).toBeNull();
    expect(timecodeText({ CTimecode: null })).toBeNull();
  });
});
