import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { IMPLEMENTED_PAYLOAD_VERSION, PayloadVersionService, PrerequisiteState, SessionPrerequisite } from './payload-version.service';
import { PayloadCache } from './payload-cache';
import { FakeWebsocketService, setUpCharacterization } from '../testing/characterization-harness';

describe('PayloadVersionService', () => {
  let ws: FakeWebsocketService;
  let gate: PayloadVersionService;

  function fakePrerequisite(name: string) {
    const state = signal<PrerequisiteState>({ status: 'pending' });
    const started: number[] = [];
    const prerequisite: SessionPrerequisite = {
      name,
      state: state.asReadonly(),
      start: () => started.push(Date.now()),
      reset: () => state.set({ status: 'pending' }),
    };
    return { prerequisite, state, started };
  }

  beforeEach(() => {
    ws = setUpCharacterization().ws;
    gate = TestBed.inject(PayloadVersionService);
  });

  afterEach(() => localStorage.clear());

  it('implements payload version 1', () => {
    expect(IMPLEMENTED_PAYLOAD_VERSION).toBe(1);
  });

  it('is pending until the first frame of a connection', () => {
    expect(gate.gate()).toEqual({ status: 'pending', prerequisite: 'payload_version' });
    ws.open();
    expect(gate.announced()).toBeNull();
    expect(gate.gate().status).toBe('pending');
  });

  it('opens on a matching announcement', () => {
    ws.connect(1);
    expect(gate.announced()).toBe(1);
    expect(gate.gate()).toEqual({ status: 'open' });
  });

  it('refuses a mismatch, naming both versions', () => {
    ws.connect(2);
    expect(gate.gate()).toEqual({
      status: 'refused', prerequisite: 'payload_version', reason: 'version_mismatch',
      detail: { announced: 2, implemented: 1 },
    });
  });

  it('infers version 0 from a peer whose first frame is not payload_version, and refuses it', () => {
    ws.open();
    ws.receiveRaw({ type: 'initial_mappings', value: {} });
    expect(gate.announced()).toBe(0);
    expect(gate.gate()).toEqual(jasmine.objectContaining({
      status: 'refused', detail: { announced: 0, implemented: 1 } }));
  });

  it('reads only the first frame of a connection as the announcement', () => {
    ws.connect(1);
    ws.receiveRaw({ type: 'payload_version', value: 7 });
    expect(gate.announced()).toBe(1);
    expect(gate.gate().status).toBe('open');
  });

  describe('eviction runs as soon as the version is known', () => {
    beforeEach(() => {
      PayloadCache.write('initial_mappings', { stale: true });
      localStorage.setItem('userLanguage', 'es');
    });

    it('a browser with no stored version is evicted', () => {
      ws.connect(1);
      expect(PayloadCache.read('initial_mappings')).toBeNull();
      expect(PayloadCache.storedVersion()).toBe(1);
      expect(localStorage.getItem('userLanguage')).toBe('es');
    });

    it('a matching stored version keeps the cache', () => {
      PayloadCache.setStoredVersion(1);
      ws.connect(1);
      expect(PayloadCache.read('initial_mappings')).toEqual({ stale: true });
    });

    it('a refused connection still evicts, so its own writes are tagged with its version', () => {
      PayloadCache.setStoredVersion(1);
      ws.connect(2);
      expect(PayloadCache.read('initial_mappings')).toBeNull();
      expect(PayloadCache.storedVersion()).toBe(2);
    });

    it('cacheReady turns true only once eviction has run', () => {
      ws.open();
      expect(gate.cacheReady()).toBeFalse();
      ws.receiveRaw({ type: 'payload_version', value: 1 });
      expect(gate.cacheReady()).toBeTrue();
    });
  });

  describe('ordered prerequisites — one mechanism', () => {
    it('starts a registered prerequisite only after the version is met', () => {
      const p = fakePrerequisite('schema_descriptor');
      gate.register(p.prerequisite);
      expect(gate.prerequisiteNames()).toEqual(['payload_version', 'schema_descriptor']);
      ws.open();
      expect(p.started.length).toBe(0);
      ws.receiveRaw({ type: 'payload_version', value: 1 });
      expect(p.started.length).toBe(1);
      expect(gate.gate()).toEqual({ status: 'pending', prerequisite: 'schema_descriptor' });
      p.state.set({ status: 'met' });
      expect(gate.gate()).toEqual({ status: 'open' });
    });

    it('never starts a later prerequisite after a version refusal', () => {
      const p = fakePrerequisite('schema_descriptor');
      gate.register(p.prerequisite);
      ws.connect(3);
      expect(p.started.length).toBe(0);
      expect(gate.gate().status).toBe('refused');
    });

    it('a failed later prerequisite refuses with its own name and reason', () => {
      const p = fakePrerequisite('schema_descriptor');
      gate.register(p.prerequisite);
      ws.connect(1);
      p.state.set({ status: 'failed', reason: 'descriptor_unusable' });
      expect(gate.gate()).toEqual({ status: 'refused', prerequisite: 'schema_descriptor',
        reason: 'descriptor_unusable', detail: undefined });
    });

    it('starts the third only once the second is met, when told', () => {
      const second = fakePrerequisite('second');
      const third = fakePrerequisite('third');
      gate.register(second.prerequisite);
      gate.register(third.prerequisite);
      ws.connect(1);
      expect(third.started.length).toBe(0);
      second.state.set({ status: 'met' });
      gate.notifyResolved();
      expect(third.started.length).toBe(1);
    });

    it('registering the same name twice is a no-op', () => {
      const p = fakePrerequisite('schema_descriptor');
      gate.register(p.prerequisite);
      gate.register(fakePrerequisite('schema_descriptor').prerequisite);
      expect(gate.prerequisiteNames()).toEqual(['payload_version', 'schema_descriptor']);
    });

    it('a prerequisite registered mid-session starts at once if its predecessors are met', () => {
      ws.connect(1);
      const p = fakePrerequisite('late');
      gate.register(p.prerequisite);
      expect(p.started.length).toBe(1);
    });
  });

  describe('the single reconnect owner', () => {
    it('re-runs the whole sequence on every connection', () => {
      const p = fakePrerequisite('schema_descriptor');
      gate.register(p.prerequisite);
      ws.connect(1);
      p.state.set({ status: 'met' });
      expect(gate.gate().status).toBe('open');

      ws.open();
      expect(gate.gate()).toEqual({ status: 'pending', prerequisite: 'payload_version' });
      expect(p.state().status).toBe('pending');
      ws.receiveRaw({ type: 'payload_version', value: 1 });
      expect(p.started.length).toBe(2);
    });

    it('announces each matched session, and restarts apart', () => {
      const started: number[] = [];
      const restarted: number[] = [];
      gate.sessionStarted.subscribe(n => started.push(n));
      gate.sessionRestarted.subscribe(n => restarted.push(n));
      ws.connect(1);
      ws.connect(1);
      ws.connect(2);   // refused: not a session
      expect(started).toEqual([1, 2]);
      expect(restarted).toEqual([2]);
    });
  });
});
