import { TestBed } from '@angular/core/testing';
import {
  DESCRIPTOR_TIMEOUT_MS, DescriptorGapError, SCRIPT_TYPES, SchemaDescriptorService,
  descriptorDefault, descriptorInstance, parseSchemaDescriptor, requestSchemaDescriptor, scriptDescriptorGaps,
} from './schema-descriptor.handler';
import { PayloadVersionService } from '../../../core/payload-version.service';
import { FakeWebsocketService, setUpCharacterization } from '../../../testing/characterization-harness';
import { loadFixture } from '../../../testing/load-fixture';

const script = () => parseSchemaDescriptor(loadFixture('schema-descriptor-script').value)!;

describe('schema descriptor', () => {
  describe('request and parse', () => {
    it('requests by schema name, not hard-coded to script', () => {
      const sent: any[] = [];
      requestSchemaDescriptor(m => sent.push(m), 'script');
      requestSchemaDescriptor(m => sent.push(m), 'project_settings');
      expect(sent).toEqual([
        { action: 'schema_descriptor', value: 'script' },
        { action: 'schema_descriptor', value: 'project_settings' },
      ]);
    });

    it('parses the recorded descriptors', () => {
      for (const name of ['script', 'settings', 'project_settings', 'project_mappings'] as const) {
        const parsed = parseSchemaDescriptor(loadFixture(`schema-descriptor-${name}`).value);
        expect(parsed?.schema).toBe(name);
      }
    });

    it('rejects a value that is not a descriptor', () => {
      expect(parseSchemaDescriptor(null)).toBeNull();
      expect(parseSchemaDescriptor({ schema: 'script' })).toBeNull();
      expect(parseSchemaDescriptor({ schema: 'script', types: [{ key: 'k' }] })).toBeNull();
    });

    it('reads a field default, and reports a null default as a gap', () => {
      expect(descriptorDefault(script(), SCRIPT_TYPES.audio, 'master_vol')).toBe(100);
      expect(descriptorDefault(script(), SCRIPT_TYPES.video, 'opacity')).toBe(100);
      expect(() => descriptorDefault(script(), 'script:DmxUniverseType', 'dmx_channels'))
        .toThrowError(DescriptorGapError);
      expect(() => descriptorDefault(null, SCRIPT_TYPES.audio, 'master_vol')).toThrowError(DescriptorGapError);
    });
  });

  describe('descriptorInstance — the library\'s instance as served (G3; UR-1 closed)', () => {
    const pre015 = () => parseSchemaDescriptor(loadFixture('schema-descriptor-script-pre015').value)!;

    it('repeated containers arrive as the wire carries them, where they used to need inverting', () => {
      const before = pre015().types.find(t => t.key === SCRIPT_TYPES.audioOutput)!.instance;
      expect(before.channels).toEqual({ channel: [{ channel_num: null, channel_vol: null }] });
      expect(descriptorInstance(script(), SCRIPT_TYPES.audioOutput).channels)
        .toEqual([{ channel: { channel_num: 0, channel_vol: 80 } }]);

      const audio = descriptorInstance(script(), SCRIPT_TYPES.audio);
      expect(Object.keys(audio.Media.regions[0])).toEqual(['Region']);
      expect(Object.keys(audio.outputs[0])).toEqual(['CueOutput']);
      expect(descriptorInstance(script(), SCRIPT_TYPES.dmx).DmxScene.DmxUniverse.dmx_channels)
        .toEqual([{ DmxChannel: { channel: 0, value: 0 } }]);
    });

    it('the starting values a new output needs are the library\'s, so this UI authors none', () => {
      const audio = descriptorInstance(script(), SCRIPT_TYPES.audioOutput);
      expect(audio.output_vol).toBe(80);
      expect(descriptorInstance(script(), SCRIPT_TYPES.videoOutput).output_geometry).toEqual({
        x_scale: 1, y_scale: 1,
        corners: {
          top_left: { x: 0, y: 0 }, top_right: { x: 0, y: 0 },
          bottom_left: { x: 0, y: 0 }, bottom_right: { x: 0, y: 0 },
        },
      });
      expect(descriptorInstance(script(), SCRIPT_TYPES.audio).master_vol).toBe(100);
      expect(descriptorInstance(script(), SCRIPT_TYPES.action).action_type).toBe('play');
      expect(descriptorInstance(script(), SCRIPT_TYPES.fade).curve_type).toBe('linear');
    });

    it('peels the one wire wrapper a contained type carries, and only that', () => {
      const output = script().types.find(t => t.key === SCRIPT_TYPES.audioOutput)!.instance;
      expect(Object.keys(output)).toEqual(['CueOutput']);
      expect(descriptorInstance(script(), SCRIPT_TYPES.audioOutput).class).toBe('audio');
      // a document body is served unwrapped: its single-looking first key is a field
      expect('CueList' in descriptorInstance(script(), SCRIPT_TYPES.script)).toBeTrue();
      expect('name' in descriptorInstance(script(), SCRIPT_TYPES.script)).toBeTrue();
    });

    it('returns a copy: neither the result nor the descriptor leaks into the other', () => {
      const descriptor = script();
      const before = JSON.stringify(descriptor);
      descriptorInstance(descriptor, SCRIPT_TYPES.audio).master_vol = 0;
      expect(JSON.stringify(descriptor)).toBe(before);
    });

    it('throws a gap for a type the descriptor does not have', () => {
      expect(() => descriptorInstance(script(), 'script:NoSuchType')).toThrowError(DescriptorGapError);
    });
  });

  describe('usability', () => {
    it('the recorded script descriptor has no gaps', () => {
      expect(scriptDescriptorGaps(script())).toEqual([]);
    });

    it('a missing type is a gap, named', () => {
      const descriptor = script();
      descriptor.types = descriptor.types.filter(t => t.key !== SCRIPT_TYPES.videoOutput);
      expect(scriptDescriptorGaps(descriptor)).toContain('script:VideoCueOutputsType.(type)');
    });

    it('a required field with no value is a gap, named', () => {
      const descriptor = script();
      const type = descriptor.types.find(t => t.key === SCRIPT_TYPES.fade)!;
      type.fields.find(f => f.name === 'curve_type')!.default = null;
      type.instance.curve_type = null;
      expect(scriptDescriptorGaps(descriptor)).toEqual(['script:FadeCueType.curve_type']);
    });
  });

  describe('SchemaDescriptorService — the gate\'s second prerequisite', () => {
    let ws: FakeWebsocketService;
    let gate: PayloadVersionService;
    let service: SchemaDescriptorService;

    beforeEach(() => {
      jasmine.clock().install();
      ws = setUpCharacterization().ws;
      gate = TestBed.inject(PayloadVersionService);
      service = TestBed.inject(SchemaDescriptorService);
    });

    afterEach(() => jasmine.clock().uninstall());

    it('registers after payload_version and requests script once the version matches', () => {
      expect(gate.prerequisiteNames()).toEqual(['payload_version', 'schema_descriptor']);
      ws.open();
      expect(ws.sent).toEqual([]);
      ws.receiveRaw({ type: 'payload_version', value: 1 });
      expect(ws.sent).toContain({ action: 'schema_descriptor', value: 'script' });
      expect(gate.gate()).toEqual({ status: 'pending', prerequisite: 'schema_descriptor' });
    });

    it('opens the gate on a usable descriptor', () => {
      ws.connect();
      ws.receiveRaw(loadFixture('schema-descriptor-script'));
      expect(gate.gate()).toEqual({ status: 'open' });
      expect(service.script()?.schema).toBe('script');
    });

    it('refuses an unusable descriptor, naming the gaps', () => {
      ws.connect();
      const frame = loadFixture('schema-descriptor-script');
      frame.value.types = frame.value.types.filter((t: any) => t.key !== SCRIPT_TYPES.audio);
      ws.receiveRaw(frame);
      const state = gate.gate();
      expect(state.status).toBe('refused');
      expect(state).toEqual(jasmine.objectContaining({ prerequisite: 'schema_descriptor', reason: 'descriptor_unusable' }));
      expect((state as any).detail.gaps).toContain('script:AudioCueType.(type)');
    });

    it('refuses a descriptor the editor refuses to send', () => {
      ws.connect();
      ws.receiveError({ action: 'schema_descriptor', message: 'unknown schema', raw: null });
      expect(gate.gate()).toEqual(jasmine.objectContaining({ reason: 'descriptor_refused', detail: { message: 'unknown schema' } }));
    });

    it('refuses a descriptor that never arrives', () => {
      ws.connect();
      jasmine.clock().tick(DESCRIPTOR_TIMEOUT_MS + 1);
      expect(gate.gate()).toEqual(jasmine.objectContaining({ reason: 'descriptor_unanswered' }));
    });

    it('keeps other schemas apart without touching the gate', () => {
      ws.connect();
      ws.receiveRaw(loadFixture('schema-descriptor-script'));
      service.request('project_settings');
      expect(ws.sent).toContain({ action: 'schema_descriptor', value: 'project_settings' });
      ws.receiveRaw(loadFixture('schema-descriptor-project_settings'));
      expect(service.descriptor('project_settings')?.schema).toBe('project_settings');
      expect(gate.gate().status).toBe('open');
    });

    it('forgets the descriptor on reconnect and asks again', () => {
      ws.connect();
      ws.receiveRaw(loadFixture('schema-descriptor-script'));
      ws.connect();
      expect(service.script()).toBeNull();
      expect(ws.sent.filter(m => m.action === 'schema_descriptor').length).toBe(2);
      expect(gate.gate().status).toBe('pending');
    });
  });
});
