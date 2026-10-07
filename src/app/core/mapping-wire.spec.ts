import { defaultPort, deviceOutputs, hasDeviceClass } from './mapping-wire';
import { loadFixture } from '../testing/load-fixture';

describe('mapping-wire', () => {
  const tip = () => loadFixture('initial-mappings-tip').value;
  const controller = () => tip().nodes[0].node;

  it('flattens a class\'s list-of-lists outputs', () => {
    expect(deviceOutputs(controller(), 'audio').map(o => o.output.id)).toEqual([0, 1]);
    expect(deviceOutputs(controller(), 'video').map(o => o.output.name)).toEqual(['0', '1', 'custom']);
    expect(deviceOutputs(controller(), 'dmx').length).toBe(1);
  });

  it('returns a class nobody asked for only when asked — `lighting` is in the recording', () => {
    expect(hasDeviceClass(controller(), 'lighting')).toBeTrue();
    expect(deviceOutputs(controller(), 'lighting').map(o => o.output.name)).toEqual(['universe_0']);
    expect(deviceOutputs(controller(), 'midi')).toEqual([]);
  });

  it('tolerates a device without inputs, a node without devices, and a device without outputs', () => {
    const video = controller().devices.find((d: any) => d.device.class === 'video').device;
    expect('inputs' in video).toBeFalse();
    expect(deviceOutputs(tip().new_nodes[1].node, 'audio')).toEqual([]);
    expect(hasDeviceClass(tip().new_nodes[1].node, 'audio')).toBeFalse();
    expect(deviceOutputs({ devices: [{ device: { class: 'audio' } }] }, 'audio')).toEqual([]);
    expect(deviceOutputs(null, 'audio')).toEqual([]);
  });

  it('reads defaults[] by class and direction, from the "&" key', () => {
    expect(defaultPort(tip().defaults, 'audio', 'output')).toBe('0367f391-ebf4-48b2-9f26-000000000001_system:playback_1');
    expect(defaultPort(tip().defaults, 'video', 'output')).toBe('0367f391-ebf4-48b2-9f26-000000000001_0');
    expect(defaultPort(tip().defaults, 'dmx', 'output')).toBe('0367f391-ebf4-48b2-9f26-000000000001');
  });

  it('an empty default has no "&": no default, nothing invented', () => {
    expect(defaultPort(tip().defaults, 'video', 'input')).toBeNull();
    expect(defaultPort(tip().defaults, 'lighting', 'output')).toBeNull();
    expect(defaultPort(undefined, 'audio', 'output')).toBeNull();
  });
});
