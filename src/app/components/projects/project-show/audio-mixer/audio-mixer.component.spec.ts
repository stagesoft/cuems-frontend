import { ChangeDetectorRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectShowAudioMixerComponent } from './audio-mixer.component';
import { ProjectsService } from '../../../../services/projects/projects.service';
import { OscService } from '../../../../services/osc.service';
import { Harness, instantiate, setUpCharacterization } from '../../../../testing/characterization-harness';
import { loadFixture } from '../../../../testing/load-fixture';

/** Site 4 of 5 (T092), read through the service (T094), unknown classes ignored (T095). */
describe('ProjectShowAudioMixerComponent — mapping read', () => {
  let h: Harness;
  let mixer: any;
  const C = '0367f391-ebf4-48b2-9f26-000000000001';

  beforeEach(() => {
    h = setUpCharacterization([
      { provide: OscService, useValue: { mixerStatus: signal({}), getMasterVolume: () => undefined, getChannelVolume: () => undefined } },
      { provide: ChangeDetectorRef, useValue: { markForCheck() {}, detectChanges() {} } },
    ]);
    TestBed.inject(ProjectsService);
    mixer = instantiate(ProjectShowAudioMixerComponent);
  });

  it('builds one node per node with an audio device, outputs from devices[]', () => {
    h.ws.receive(loadFixture('initial-mappings-tip'));
    const nodes = mixer.getAudioNodesFromMappings();
    expect(nodes.length).toBe(1);
    expect(nodes[0].uuid).toBe(C);
    expect(nodes[0].outputs.map((o: any) => [o.id, o.name, o.index])).toEqual([
      [`${C}_0`, 'system:playback_1', 0], [`${C}_1`, 'system:playback_2', 1]]);
  });

  it('ignores the video, dmx and lighting devices, and a node with no devices', () => {
    const frame = loadFixture('initial-mappings-tip');
    frame.value.nodes.push(...frame.value.new_nodes);   // includes a node with no devices
    h.ws.receive(frame);
    const nodes = mixer.getAudioNodesFromMappings();
    expect(nodes.map((n: any) => n.uuid)).toEqual([C, '0367f391-ebf4-48b2-9f26-000000000002']);
  });

  it('reads the service, not storage: nothing before a mapping frame arrives', () => {
    expect(mixer.getAudioNodesFromMappings()).toEqual([]);
  });
});
