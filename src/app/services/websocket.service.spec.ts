import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { WEBSOCKET_FACTORY, WebsocketService } from './websocket.service';

/** A socket the test drives: open/close/message/error on demand. */
class FakeSocket extends Subject<any> {
  sent: any[] = [];
  constructor(public config: any) { super(); }
  override next(value: any): void {
    // outgoing: what the service sends to the server
    this.sent.push(value);
  }
  open() { this.config.openObserver.next({}); }
  close() { this.config.closeObserver.next({}); }
  serverSends(frame: any) { super.next(frame); }
  fail() { this.error(new Event('error')); }
}

describe('WebsocketService', () => {
  let sockets: FakeSocket[];
  let service: WebsocketService;
  const current = () => sockets[sockets.length - 1];

  beforeEach(() => {
    jasmine.clock().install();
    sockets = [];
    TestBed.configureTestingModule({
      providers: [{ provide: WEBSOCKET_FACTORY, useValue: (config: any) => {
        const socket = new FakeSocket(config);
        sockets.push(socket);
        return socket;
      } }],
    });
    service = TestBed.inject(WebsocketService);
  });

  afterEach(() => jasmine.clock().uninstall());

  it('connects once on construction and tracks open/closed', () => {
    expect(sockets.length).toBe(1);
    expect(service.isConnected()).toBeFalse();
    current().open();
    expect(service.isConnected()).toBeTrue();
    current().close();
    expect(service.isConnected()).toBeFalse();
  });

  it('routes error frames to errors and everything else to messages', () => {
    const messages: any[] = [];
    const errors: any[] = [];
    service.messages.subscribe(m => messages.push(m));
    service.errors.subscribe(e => errors.push(e));
    current().serverSends({ type: 'payload_version', value: 1 });
    current().serverSends({ type: 'error', action: 'project_save', value: 'nope' });
    expect(messages).toEqual([{ type: 'payload_version', value: 1 }]);
    expect(errors).toEqual([{ action: 'project_save', message: 'nope',
      raw: { type: 'error', action: 'project_save', value: 'nope' } }]);
  });

  it('announces every connection as it opens, numbered', () => {
    const opened: number[] = [];
    service.connectionOpened.subscribe(n => opened.push(n));
    current().open();
    expect(opened).toEqual([1]);
  });

  describe('reconnect', () => {
    it('makes a new socket 10 s after an error, and publishes the reconnection when it opens', () => {
      const opened: number[] = [];
      const reconnected: number[] = [];
      service.connectionOpened.subscribe(n => opened.push(n));
      service.reconnected.subscribe(n => reconnected.push(n));
      current().open();
      current().fail();
      expect(service.isConnected()).toBeFalse();
      expect(sockets.length).toBe(1);
      jasmine.clock().tick(10000);
      expect(sockets.length).toBe(2);
      expect(reconnected).toEqual([]);   // not until the new one actually opens
      current().open();
      expect(opened).toEqual([1, 2]);
      expect(reconnected).toEqual([2]);
    });

    it('sends through the new socket after a reconnect, not the dead one', () => {
      current().fail();
      jasmine.clock().tick(10000);
      service.wsEmit({ action: 'project_status' });
      expect(sockets[0].sent).toEqual([]);
      expect(sockets[1].sent).toEqual([{ action: 'project_status' }]);
    });

    it('delivers the new socket\'s frames on the same messages subject', () => {
      const messages: any[] = [];
      service.messages.subscribe(m => messages.push(m));
      current().fail();
      jasmine.clock().tick(10000);
      current().serverSends({ type: 'payload_version', value: 1 });
      expect(messages).toEqual([{ type: 'payload_version', value: 1 }]);
    });

    it('keeps reconnecting after repeated errors', () => {
      current().fail();
      jasmine.clock().tick(10000);
      current().fail();
      jasmine.clock().tick(10000);
      expect(sockets.length).toBe(3);
    });
  });
});
