import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectShowVideoMixerComponent } from './video-mixer.component';
import { ProjectsService } from '../../../../services/projects/projects.service';
import { OscService } from '../../../../services/osc.service';
import { Harness, instantiate, setUpCharacterization } from '../../../../testing/characterization-harness';
import { loadFixture } from '../../../../testing/load-fixture';

/** Site 5 of 5 (T093), read through the service (T094), unknown classes ignored (T095). */
describe('ProjectShowVideoMixerComponent — mapping read', () => {
  let h: Harness;
  let mixer: any;
  const C = '0367f391-ebf4-48b2-9f26-000000000001';

  beforeEach(() => {
    h = setUpCharacterization([{ provide: OscService, useValue: { mixerStatus: signal({}) } }]);
    TestBed.inject(ProjectsService);
    mixer = instantiate(ProjectShowVideoMixerComponent);
  });

  it('builds one node per node with a video device, outputs from devices[]', () => {
    h.ws.receive(loadFixture('initial-mappings-tip'));
    const nodes = mixer.getVideoNodesFromMappings();
    expect(nodes.map((n: any) => n.uuid)).toEqual([C]);
    expect(nodes[0].outputs.map((o: any) => o.id)).toEqual([`${C}_0`, `${C}_1`, `${C}_2`]);
  });

  it('a node with no devices contributes nothing; nothing before a frame arrives', () => {
    expect(mixer.getVideoNodesFromMappings()).toEqual([]);
    const frame = loadFixture('initial-mappings-tip');
    frame.value.nodes = frame.value.new_nodes.filter((n: any) => !n.node.devices);
    h.ws.receive(frame);
    expect(mixer.getVideoNodesFromMappings()).toEqual([]);
  });
});
