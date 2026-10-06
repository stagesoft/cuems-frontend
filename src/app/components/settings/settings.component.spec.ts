/**
 * Characterization of SettingsComponent (the adoption/liveness tier) — today's
 * behaviour, pinned before the port.
 *
 * ┌─ The rule (contracts/characterization-rules.md, FR-004a) ─────────────────┐
 * │ These expectations pin what the code does TODAY, fed recorded payloads.   │
 * │ The port re-runs them with only the INPUT FIXTURE swapped. Exactly two    │
 * │ expectation changes are sanctioned, and the pair is closed — it may not   │
 * │ be extended once the port has begun:                                      │
 * │   1. master volume 20 -> 100 (FR-032)                                     │
 * │   2. canAdopt flipping once the booleans change (FR-057)                  │
 * │ Any other divergence is a FINDING to record, never a test to edit.        │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Today the node arrays and nodeconf_available ride `initial_mappings`, so the
 * recorded today-wire mapping frame is the input. It carries JSON booleans and
 * `node_type` (cuems-editor before 001 on cuemsutils rc14).
 */
import { TestBed } from '@angular/core/testing';
import { SettingsComponent } from './settings.component';
import { ProjectsService } from '../../services/projects/projects.service';
import { NotificationService } from '../../services/ui/notification.service';
import { Harness, instantiate, setUpCharacterization } from '../../testing/characterization-harness';
import { loadFixture } from '../../testing/load-fixture';

const CONTROLLER = '0367f391-ebf4-48b2-9f26-000000000001';
const NEW_NODE = '0367f391-ebf4-48b2-9f26-000000000003';

describe('SettingsComponent (characterization)', () => {
  let h: Harness;
  let component: SettingsComponent;
  let notifications: NotificationService;

  function setUp(mutate?: (value: any) => void) {
    TestBed.inject(ProjectsService);
    const frame = loadFixture('initial-mappings-pre001');
    mutate?.(frame.value);
    h.ws.receive(frame);
    component = instantiate(SettingsComponent);
  }

  const controller = () => component.activeNodes()[0];
  const newNode = () => component.newNodes()[0];

  beforeEach(() => {
    jasmine.clock().install();
    h = setUpCharacterization();
    notifications = TestBed.inject(NotificationService);
    spyOn(notifications, 'showError');
    spyOn(notifications, 'showSuccess');
    spyOn(console, 'log');
  });

  afterEach(() => {
    component?.ngOnDestroy();
    jasmine.clock().uninstall();
    try { localStorage.clear(); } catch { /* blocked */ }
  });

  it('reads the node arrays off the mapping frame', () => {
    setUp();
    expect(component.activeNodes().map((n: any) => n.node.uuid)).toEqual([CONTROLLER]);
    expect(component.newNodes().map((n: any) => n.node.uuid)).toEqual([NEW_NODE]);
  });

  describe('presence predicates (T020)', () => {
    it('isAlive is unknown until a node_status arrives', () => {
      setUp();
      expect(component.isAlive(controller())).toBe('unknown');
      expect(component.livenessAge()).toBeNull();
    });

    it('isAlive: alive / absent from the engine\'s alive list, with its age', () => {
      setUp();
      h.ws.receive({ type: 'node_status', value: { alive: [CONTROLLER], age_s: 0.4 } });
      expect(component.isAlive(controller())).toBe('alive');
      expect(component.isAlive(newNode())).toBe('absent');
      expect(component.livenessAge()).toBe(0.4);
    });

    it('isAlive: a value with no alive array, a null value, or a failed poll is unknown — never dead', () => {
      setUp();
      h.ws.receive({ type: 'node_status', value: { age_s: 1 } });
      expect(component.isAlive(controller())).toBe('unknown');
      h.ws.receive({ type: 'node_status', value: { alive: [CONTROLLER], age_s: 0.1 } });
      h.ws.receive({ type: 'node_status', value: null });
      expect(component.isAlive(controller())).toBe('unknown');
      h.ws.receive({ type: 'node_status', value: { alive: [CONTROLLER], age_s: 0.1 } });
      h.ws.receiveError({ action: 'node_status', message: 'timeout', raw: null });
      expect(component.isAlive(controller())).toBe('unknown');
      expect(notifications.showError).not.toHaveBeenCalled();
    });

    it('isSeenByDiscovery is online === true: true / false on the recorded JSON booleans', () => {
      setUp();
      expect(component.isSeenByDiscovery(controller())).toBeTrue();
      expect(component.isSeenByDiscovery(newNode())).toBeFalse();
    });

    it('isSeenByDiscovery is false for the string "True"', () => {
      setUp(v => { v.nodes[0].node.online = 'True'; });
      expect(component.isSeenByDiscovery(controller())).toBeFalse();
    });

    it('the unusable-nodes banner lists missing and unreachable apart, by label', () => {
      setUp();
      expect(component.unusableNodes()).toBeNull();
      h.ws.receive({ type: 'node_status', value: {
        alive: [], age_s: 0, missing: [NEW_NODE], unreachable: [CONTROLLER] } });
      expect(component.unusableNodes()).toEqual({
        missing: ['0367f391…'], unreachable: ['0367f391…'], total: 2 });
    });
  });

  describe('canAdopt / canUnadopt (T021)', () => {
    it('canAdopt: nodeconf available and seen by discovery', () => {
      setUp();
      expect(component.canAdopt(newNode())).toBeFalse();     // recorded offline
      expect(component.canAdopt(controller())).toBeTrue();   // recorded online
    });

    it('canAdopt is false for every node when online is the string "True"', () => {
      setUp(v => {
        v.nodes[0].node.online = 'True';
        v.new_nodes[0].node.online = 'True';
      });
      expect(component.canAdopt(controller())).toBeFalse();
      expect(component.canAdopt(newNode())).toBeFalse();
    });

    it('canUnadopt: refused for node_type NodeType.master, offered otherwise', () => {
      setUp();
      expect(component.canUnadopt(controller())).toBeFalse();
      expect(component.canUnadopt(newNode())).toBeTrue();
    });

    it('canUnadopt is offered for every node when node_type is absent', () => {
      setUp(v => { delete v.nodes[0].node.node_type; });
      expect(component.canUnadopt(controller())).toBeTrue();
    });

    it('both are false when nodeconf is reported unavailable', () => {
      setUp(v => { v.nodeconf_available = false; });
      expect(component.nodeconfAvailable()).toBeFalse();
      expect(component.canAdopt(controller())).toBeFalse();
      expect(component.canUnadopt(newNode())).toBeFalse();
    });
  });

  describe('adoption emit, responses and the poll (T022)', () => {
    it('nodeconfAvailable reads only an explicit false as unavailable — absent means available', () => {
      setUp(v => { delete v.nodeconf_available; });
      expect(component.nodeconfAvailable()).toBeTrue();
    });

    it('confirmAddNode emits nodelist_modify ADD for the chosen node and closes the dialog', () => {
      setUp();
      component.openAddNodeConfirmation(NEW_NODE);
      expect(component.isConfirmAddNodeOpen).toBeTrue();
      component.confirmAddNode();
      expect(h.ws.sent).toContain({ action: 'nodelist_modify', modify_action: 'ADD', value: NEW_NODE });
      expect(component.isConfirmAddNodeOpen).toBeFalse();
    });

    it('confirmRemoveNode emits nodelist_modify REMOVE for the chosen node and closes the dialog', () => {
      setUp();
      component.openRemoveNodeConfirmation(CONTROLLER);
      component.confirmRemoveNode();
      expect(h.ws.sent).toContain({ action: 'nodelist_modify', modify_action: 'REMOVE', value: CONTROLLER });
      expect(component.isConfirmRemoveNodeOpen).toBeFalse();
    });

    it('a nodelist_modify OK clears the last error and confirms', () => {
      setUp();
      component.lastNodeError.set('previous');
      h.ws.receive({ type: 'nodelist_modify', value: 'OK' });
      expect(component.lastNodeError()).toBeNull();
      expect(notifications.showSuccess).toHaveBeenCalled();
    });

    it('a nodelist_modify refusal is relayed verbatim and closes both dialogs', () => {
      setUp();
      component.openAddNodeConfirmation(NEW_NODE);
      component.openRemoveNodeConfirmation(CONTROLLER);
      h.ws.receiveError({ action: 'nodelist_modify', message: 'unload the project first', raw: null });
      expect(component.lastNodeError()).toBe('unload the project first');
      expect(notifications.showError).toHaveBeenCalledWith('unload the project first');
      expect(component.isConfirmAddNodeOpen).toBeFalse();
      expect(component.isConfirmRemoveNodeOpen).toBeFalse();
    });

    it('polls node_status on init and every 5 s, and stops on destroy', () => {
      setUp();
      component.ngOnInit();
      const polls = () => h.ws.sent.filter(m => m.action === 'node_status').length;
      expect(polls()).toBe(1);
      jasmine.clock().tick(5000);
      expect(polls()).toBe(2);
      component.ngOnDestroy();
      jasmine.clock().tick(15000);
      expect(polls()).toBe(2);
    });
  });

  describe('names and outputs (T023)', () => {
    it('getNodeName: alias, then role_id, then "Node NN"', () => {
      setUp();
      expect(component.getNodeName(controller(), 0)).toBe('Node 01');
      expect(component.getNodeName({ node: { role_id: 'ctrl' } }, 0)).toBe('ctrl');
      expect(component.getNodeName({ node: { role_id: 'ctrl', alias: 'Main' } }, 0)).toBe('Main');
      expect(component.getNodeName(undefined, 11)).toBe('Node 12');
    });

    it('getAudioOutputs / getVideoOutputs flatten the per-class groups (site 3 of 5)', () => {
      setUp();
      const node = controller().node;
      expect(component.getAudioOutputs(node).map(o => o.output.name))
        .toEqual(['system:playback_1', 'system:playback_2']);
      expect(component.getVideoOutputs(node).map(o => o.output.name)).toEqual(['0', '1', 'custom']);
    });

    it('a node with no per-class blocks has no outputs', () => {
      setUp();
      expect(component.getAudioOutputs(newNode().node)).toEqual([]);
      expect(component.getVideoOutputs(newNode().node)).toEqual([]);
    });

    it('getMappedName is the output name, else "Sin nombre"', () => {
      setUp();
      expect(component.getMappedName(component.getAudioOutputs(controller().node)[0])).toBe('system:playback_1');
      expect(component.getMappedName({ output: {} })).toBe('Sin nombre');
    });
  });
});
