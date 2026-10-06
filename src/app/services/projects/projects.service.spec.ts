/**
 * Characterization of ProjectsService — today's behaviour, pinned before the port.
 *
 * ┌─ The rule (contracts/characterization-rules.md, FR-004a) ─────────────────┐
 * │ These expectations pin what the code does TODAY, fed recorded payloads.   │
 * │ The port re-runs them with only the INPUT FIXTURE swapped. Exactly two    │
 * │ expectation changes are sanctioned, and the pair is closed — it may not   │
 * │ be extended once the port has begun:                                      │
 * │   1. master volume 20 -> 100 (FR-032)                                     │
 * │   2. canAdopt flipping once the booleans change (FR-057)                  │
 * │ Any other divergence is a FINDING to record, never a test to edit.        │
 * │ Tests of behaviour the port deletes outright (the retired                 │
 * │ initial_template) are removed with that behaviour, by the task that       │
 * │ deletes it, and are grouped below so their removal is visible.            │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
import { TestBed } from '@angular/core/testing';
import { ProjectsService } from './projects.service';
import { NotificationService } from '../ui/notification.service';
import { FakeWebsocketService, Harness, setUpCharacterization } from '../../testing/characterization-harness';
import { loadFixture } from '../../testing/load-fixture';
import { PAYLOAD_CACHE_PREFIX, PayloadCache } from '../../core/payload-cache';
import { IMPLEMENTED_PAYLOAD_VERSION } from '../../core/payload-version.service';

const CONTROLLER = '0367f391-ebf4-48b2-9f26-000000000001';

describe('ProjectsService (characterization)', () => {
  let h: Harness;
  let ws: FakeWebsocketService;
  let service: ProjectsService;
  let notifications: NotificationService;

  function create(): ProjectsService {
    return TestBed.inject(ProjectsService);
  }

  beforeEach(() => {
    h = setUpCharacterization();
    ws = h.ws;
    notifications = TestBed.inject(NotificationService);
    spyOn(notifications, 'showError');
    spyOn(notifications, 'showSuccess');
    spyOn(console, 'error');
    spyOn(console, 'warn');
  });

  afterEach(() => {
    try { localStorage.clear(); } catch { /* blocked */ }
  });

  // initial_template (T009): retired at payload version 1. Its cache went
  // with T031 and its intake with T060 — the frame is never sent again, and
  // new cues are built from the schema descriptor instead.

  // ── initial_mappings ──
  describe('initial_mappings intake and extractMappingOptions (T010)', () => {
    const EXPECTED_OPTIONS = [
      { uuid: `${CONTROLLER}_0`, name: 'node1:system:playback_1', type: 'audio' },
      { uuid: `${CONTROLLER}_1`, name: 'node1:system:playback_2', type: 'audio' },
      { uuid: `${CONTROLLER}_0`, name: 'node1:0', type: 'video' },
      { uuid: `${CONTROLLER}_1`, name: 'node1:1', type: 'video' },
      { uuid: `${CONTROLLER}_2`, name: 'node1:custom', type: 'video' },
      // DMX: the bare node uuid, no output suffix
      { uuid: CONTROLLER, name: 'node1:0', type: 'dmx' },
    ];

    it('stores the frame as {type, value}', () => {
      service = create();
      const frame = loadFixture('initial-mappings-pre001');
      ws.receive(frame);
      expect(service.initialMappings()).toEqual({ type: 'initial_mappings', value: frame.value });
    });

    it('extracts audio and video options keyed <node uuid>_<output id>, and DMX keyed by the bare node uuid', () => {
      service = create();
      ws.receive(loadFixture('initial-mappings-pre001'));
      expect(service.mappingOptions()).toEqual(EXPECTED_OPTIONS as any);
      expect(service.getInitialMappings()).toEqual(EXPECTED_OPTIONS as any);
    });

    it('keeps one DMX entry per node however many DMX outputs the node has', () => {
      service = create();
      const frame = loadFixture('initial-mappings-pre001');
      const dmx = frame.value.nodes[0].node.dmx[0];
      dmx.outputs.push(JSON.parse(JSON.stringify(dmx.outputs[0])));
      dmx.outputs[1].output.id = 1;
      ws.receive(frame);
      expect(service.mappingOptions().filter(m => m.type === 'dmx').length).toBe(1);
    });

    it('looks an option up by uuid (first match wins)', () => {
      service = create();
      ws.receive(loadFixture('initial-mappings-pre001'));
      expect(service.getMappingByUuid(`${CONTROLLER}_0`)).toEqual(EXPECTED_OPTIONS[0] as any);
      expect(service.getMappingByUuid('nope')).toBeUndefined();
    });

    // Storage location: the payload namespace (FR-071a), not a bare key.
    // Read-back moment: when this connection's version is known and the cache
    // evicted for it (FR-075), not the constructor. The values are unchanged.
    it('writes {type, value} to the payload cache', () => {
      service = create();
      const frame = loadFixture('initial-mappings-pre001');
      ws.receive(frame);
      expect(PayloadCache.read('initial_mappings'))
        .toEqual({ type: 'initial_mappings', value: frame.value });
    });

    it('restores the cached frame and re-extracts the options when the next session starts', () => {
      const frame = loadFixture('initial-mappings-pre001');
      PayloadCache.setStoredVersion(IMPLEMENTED_PAYLOAD_VERSION);
      PayloadCache.write('initial_mappings', { type: 'initial_mappings', value: frame.value });
      service = create();
      ws.connect();
      expect(service.initialMappings()?.value).toEqual(frame.value);
      expect(service.mappingOptions()).toEqual(EXPECTED_OPTIONS as any);
    });

    it('wraps a cached bare value (no type) as an initial_mappings frame', () => {
      const frame = loadFixture('initial-mappings-pre001');
      PayloadCache.setStoredVersion(IMPLEMENTED_PAYLOAD_VERSION);
      PayloadCache.write('initial_mappings', frame.value);
      service = create();
      ws.connect();
      expect(service.initialMappings()).toEqual({ type: 'initial_mappings', value: frame.value });
      expect(service.mappingOptions().length).toBe(EXPECTED_OPTIONS.length);
    });
  });

  describe('nullable payload paths (T011)', () => {
    it('starts with null mappings and no options', () => {
      service = create();
      expect(service.initialMappings()).toBeNull();
      expect(service.mappingOptions()).toEqual([]);
    });

    it('treats an initial_mappings frame with no value wrapper as its own value', () => {
      service = create();
      const frame = loadFixture('initial-mappings-pre001');
      const unwrapped = { type: 'initial_mappings', ...frame.value };
      ws.receive(unwrapped);
      expect(service.initialMappings()).toEqual({ type: 'initial_mappings', value: unwrapped } as any);
      // extractMappingOptions reads .nodes off the whole frame, which has them at top level here
      expect(service.mappingOptions().length).toBe(6);
    });

    it('leaves mappings null when the cache entry does not parse', () => {
      PayloadCache.setStoredVersion(IMPLEMENTED_PAYLOAD_VERSION);
      localStorage.setItem(`${PAYLOAD_CACHE_PREFIX}initial_mappings`, '{not json');
      service = create();
      ws.connect();
      expect(service.initialMappings()).toBeNull();
      expect(service.mappingOptions()).toEqual([]);
    });

    it('extracts nothing from a node carrying no per-class output blocks', () => {
      service = create();
      const frame = loadFixture('initial-mappings-pre001');
      delete frame.value.nodes[0].node.audio;
      delete frame.value.nodes[0].node.video;
      delete frame.value.nodes[0].node.dmx;
      ws.receive(frame);
      expect(service.mappingOptions()).toEqual([]);
    });
  });

  describe('identity and lookup helpers (T012)', () => {
    beforeEach(() => {
      service = create();
    });

    describe('nodeLabel', () => {
      it('falls back to a short uuid when the node carries no alias, role_id or hostname', () => {
        ws.receive(loadFixture('initial-mappings-pre001'));
        expect(service.nodeLabel(CONTROLLER)).toBe('0367f391…');
      });

      it('prefers alias, then role_id, then hostname', () => {
        const frame = loadFixture('initial-mappings-pre001');
        const node = frame.value.nodes[0].node;
        node.hostname = 'host-a';
        ws.receive(JSON.parse(JSON.stringify(frame)));
        expect(service.nodeLabel(CONTROLLER)).toBe('host-a');
        node.role_id = 'role-a';
        ws.receive(JSON.parse(JSON.stringify(frame)));
        expect(service.nodeLabel(CONTROLLER)).toBe('role-a');
        node.alias = 'Stage left';
        ws.receive(JSON.parse(JSON.stringify(frame)));
        expect(service.nodeLabel(CONTROLLER)).toBe('Stage left');
      });

      it('finds a node in new_nodes too', () => {
        const frame = loadFixture('initial-mappings-pre001');
        frame.value.new_nodes[0].node.alias = 'Pending';
        ws.receive(frame);
        expect(service.nodeLabel(frame.value.new_nodes[0].node.uuid)).toBe('Pending');
      });

      it('prints a short uuid for a node it has never heard of, with no mappings at all', () => {
        expect(service.nodeLabel('abcdef12-0000-0000-0000-000000000000')).toBe('abcdef12…');
      });
    });

    describe('getNodeLabel (through the option names)', () => {
      it('uses alias, then role_id, then node<position>', () => {
        const frame = loadFixture('initial-mappings-pre001');
        frame.value.nodes[0].node.role_id = 'ctrl';
        ws.receive(JSON.parse(JSON.stringify(frame)));
        expect(service.mappingOptions()[0].name).toBe('ctrl:system:playback_1');
        frame.value.nodes[0].node.alias = 'Main';
        ws.receive(frame);
        expect(service.mappingOptions()[0].name).toBe('Main:system:playback_1');
      });

      it('names an output with no name "unknown"', () => {
        const frame = loadFixture('initial-mappings-pre001');
        delete frame.value.nodes[0].node.audio[0].outputs[0].output.name;
        ws.receive(frame);
        expect(service.mappingOptions()[0].name).toBe('node1:unknown');
      });
    });

    it('getNodeNumberByUuid is the 1-based position in nodes, else null', () => {
      expect(service.getNodeNumberByUuid(CONTROLLER)).toBeNull();
      ws.receive(loadFixture('initial-mappings-pre001'));
      expect(service.getNodeNumberByUuid(CONTROLLER)).toBe(1);
      expect(service.getNodeNumberByUuid('0367f391-ebf4-48b2-9f26-000000000003')).toBeNull();
    });

    it('parseOutputString splits <uuid>_<rest> and nothing else', () => {
      expect(service.parseOutputString(`${CONTROLLER}_system:playback_1`))
        .toEqual({ uuid: CONTROLLER, name: 'system:playback_1' });
      expect(service.parseOutputString(`${CONTROLLER}_custom_0`))
        .toEqual({ uuid: CONTROLLER, name: 'custom_0' });
      // a DMX output_name is the bare uuid: not parseable
      expect(service.parseOutputString(CONTROLLER)).toBeNull();
      expect(service.parseOutputString('')).toBeNull();
      expect(service.parseOutputString(null as any)).toBeNull();
      expect(service.parseOutputString(42 as any)).toBeNull();
    });

    it('formatOutputNameForDisplay renders <node label>:<name>, else the input unchanged', () => {
      ws.receive(loadFixture('initial-mappings-pre001'));
      expect(service.formatOutputNameForDisplay(`${CONTROLLER}_system:playback_1`))
        .toBe('node1:system:playback_1');
      const stranger = '11111111-2222-3333-4444-555555555555_x';
      expect(service.formatOutputNameForDisplay(stranger)).toBe(stranger);
      expect(service.formatOutputNameForDisplay('not-an-output')).toBe('not-an-output');
    });

    describe('findOutputInMappings', () => {
      beforeEach(() => ws.receive(loadFixture('initial-mappings-pre001')));

      it('finds an audio output by name or by id', () => {
        const byName = service.findOutputInMappings(CONTROLLER, 'system:playback_2');
        expect(byName.type).toBe('audio');
        expect(byName.output.output.id).toBe(1);
        expect(byName.node.uuid).toBe(CONTROLLER);
        expect(service.findOutputInMappings(CONTROLLER, '1').output.output.name).toBe('system:playback_2');
      });

      it('finds a video output by name', () => {
        const found = service.findOutputInMappings(CONTROLLER, 'custom');
        expect(found.type).toBe('video');
        expect(found.output.output.id).toBe(2);
      });

      it('searches audio before video, so a video output named like an audio id resolves to audio', () => {
        // video output "0" vs audio output id 0: audio wins
        expect(service.findOutputInMappings(CONTROLLER, '0').type).toBe('audio');
      });

      it('returns null for an unknown node or an unknown output', () => {
        expect(service.findOutputInMappings('11111111-2222-3333-4444-555555555555', '0')).toBeNull();
        expect(service.findOutputInMappings(CONTROLLER, 'nope')).toBeNull();
      });

      it('never matches a DMX output', () => {
        // dmx output id 0 name "0" exists, but only audio/video are walked; "0" hits audio
        const frame = loadFixture('initial-mappings-pre001');
        frame.value.nodes[0].node.dmx[0].outputs[0].output.name = 'dmx-only';
        ws.receive(frame);
        expect(service.findOutputInMappings(CONTROLLER, 'dmx-only')).toBeNull();
      });
    });
  });

  describe('project status and error relay (T013)', () => {
    beforeEach(() => {
      service = create();
    });

    it('asks for project_status once per connection, reconnects included', () => {
      ws.connect();
      expect(ws.sent.filter(m => m.action === 'project_status').length).toBe(1);
      ws.connect();
      expect(ws.sent.filter(m => m.action === 'project_status').length).toBe(2);
    });

    it('running: both uuids set', () => {
      ws.receive({ type: 'project_status', value: { status: 'running', project_uuid: 'p1' } });
      expect(service.runningProjectUuid()).toBe('p1');
      expect(service.loadedProjectUuid()).toBe('p1');
    });

    it('loaded: only the loaded uuid', () => {
      ws.receive({ type: 'project_status', value: { status: 'loaded', project_uuid: 'p2' } });
      expect(service.runningProjectUuid()).toBeNull();
      expect(service.loadedProjectUuid()).toBe('p2');
    });

    it('running or loaded with an empty project list asks for the list', () => {
      ws.receive({ type: 'project_status', value: { status: 'loaded', project_uuid: 'p2' } });
      expect(ws.sent).toContain({ action: 'project_list' });
    });

    it('neither: both cleared', () => {
      ws.receive({ type: 'project_status', value: { status: 'running', project_uuid: 'p1' } });
      ws.receive({ type: 'project_status', value: { status: 'none', project_uuid: null } });
      expect(service.runningProjectUuid()).toBeNull();
      expect(service.loadedProjectUuid()).toBeNull();
    });

    it('project_unload OK clears both', () => {
      ws.receive({ type: 'project_status', value: { status: 'running', project_uuid: 'p1' } });
      ws.receive({ type: 'project_unload', value: 'OK' });
      expect(service.runningProjectUuid()).toBeNull();
      expect(service.loadedProjectUuid()).toBeNull();
    });

    it('relays errors for the listed project actions to errorEvent and a toast', () => {
      const relayed: any[] = [];
      service.errorEvent.subscribe(e => relayed.push(e));
      for (const action of ['project_new', 'project_save', 'project_delete', 'project_restore',
        'project_trash_delete', 'project_list', 'project_trash_list', 'project_load',
        'initial_template', 'initial_mappings']) {
        ws.receiveError({ action, message: `boom ${action}`, raw: null });
      }
      expect(relayed.map(e => e.action)).toEqual(['project_new', 'project_save', 'project_delete',
        'project_restore', 'project_trash_delete', 'project_list', 'project_trash_list',
        'project_load', 'initial_mappings']);
      expect(notifications.showError).toHaveBeenCalledWith('boom project_save');
      expect(notifications.showError).toHaveBeenCalledTimes(9);
    });

    it('a failed project_new also signals "no project created"', () => {
      const created: string[] = [];
      service.newProjectCreated.subscribe(u => created.push(u));
      ws.receiveError({ action: 'project_new', message: 'x', raw: null });
      expect(created).toEqual(['']);
    });

    it('ignores errors for actions outside the list', () => {
      const relayed: any[] = [];
      service.errorEvent.subscribe(e => relayed.push(e));
      ws.receiveError({ action: 'nodelist_modify', message: 'x', raw: null });
      expect(relayed).toEqual([]);
      expect(notifications.showError).not.toHaveBeenCalled();
    });

    it('project_save success emits projectSaved and refreshes the list', () => {
      const saved: string[] = [];
      service.projectSaved.subscribe(u => saved.push(u));
      ws.receive({ type: 'project_save', value: 'p9' });
      expect(saved).toEqual(['p9']);
      expect(ws.sent).toContain({ action: 'project_list' });
    });

    it('a project frame is re-emitted on projectLoaded as its value', () => {
      const loaded: any[] = [];
      service.projectLoaded.subscribe(v => loaded.push(v));
      const frame = loadFixture('project-pre001');
      ws.receive(frame);
      expect(loaded).toEqual([frame.value]);
    });

    it('saves through project_save with the payload as value', () => {
      service.updateProject({ a: 1 });
      expect(ws.sent).toContain({ action: 'project_save', value: { a: 1 } });
    });
  });

  // ── the port, Phase 3 (session prerequisites) ──
  describe('session (T032b, T033)', () => {
    beforeEach(() => {
      service = create();
    });

    it('ignores a frame type it does not know, without error — new types do not bump the version', () => {
      const relayed: any[] = [];
      service.errorEvent.subscribe(e => relayed.push(e));
      expect(() => ws.receive({ type: 'some_future_frame', value: { x: 1 } })).not.toThrow();
      expect(relayed).toEqual([]);
      expect(notifications.showError).not.toHaveBeenCalled();
    });

    it('does not ask for project_status on a refused connection', () => {
      ws.connect(2);
      expect(ws.sent.filter(m => m.action === 'project_status')).toEqual([]);
    });

    it('keeps the once-per-connection status apart from the live one: a later broadcast does not move it', () => {
      ws.receive({ type: 'project_status', value: { status: 'loaded', project_uuid: 'p1' } });
      // a load elsewhere arrives as an engine broadcast (OscService), not here
      expect(service.loadedProjectUuid()).toBe('p1');
      ws.connect();
      ws.receive({ type: 'project_status', value: { status: 'loaded', project_uuid: 'p2' } });
      expect(service.loadedProjectUuid()).toBe('p2');
    });
  });
});
