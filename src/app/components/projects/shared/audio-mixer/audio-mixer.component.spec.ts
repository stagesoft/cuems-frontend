import { SharedAudioMixerComponent } from './audio-mixer.component';
import { loadFixture } from '../../../../testing/load-fixture';

/** Covers the CueOutput port of the output and channel volume writes (T044). */
describe('SharedAudioMixerComponent', () => {
  let mixer: SharedAudioMixerComponent;
  const audioCue = () => loadFixture('template-as-script-013').value.CuemsScript.CueList.contents[0].Cue;

  beforeEach(() => {
    spyOn(console, 'log');
    mixer = new SharedAudioMixerComponent();
  });

  it('writes an output volume into the CueOutput and reports old and new', () => {
    const cue = audioCue();
    const output = cue.outputs[0];
    const events: any[] = [];
    mixer.outputVolumeChange.subscribe(e => events.push(e));
    mixer.onOutputVolumeChange(cue, output, 55);
    expect(output.CueOutput.output_vol).toBe(55);
    expect(output.CueOutput.class).toBe('audio');
    expect(events[0]).toEqual(jasmine.objectContaining({ type: 'output', oldValue: 80, newValue: 55 }));
  });

  it('writes a channel volume and the master volume', () => {
    const cue = audioCue();
    const output = cue.outputs[0];
    const channel = output.CueOutput.channels[0];
    mixer.onChannelVolumeChange(cue, output, channel, 30);
    expect(channel.channel.channel_vol).toBe(30);
    mixer.onMasterVolumeChange(cue, 90);
    expect(cue.master_vol).toBe(90);
  });

  it('shows an output name without its node uuid', () => {
    expect(mixer.getOutputDisplayName('0367f391-ebf4-48b2-9f26-000000000001_system:playback_1'))
      .toBe('system:playback_1');
  });
});
