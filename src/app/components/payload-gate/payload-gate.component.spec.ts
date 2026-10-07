import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PayloadGateComponent } from './payload-gate.component';
import { AppComponent } from '../../app.component';
import { WebsocketService } from '../../services/websocket.service';
import { SchemaDescriptorService } from '../../services/projects/handlers/schema-descriptor.handler';
import { FakeWebsocketService } from '../../testing/characterization-harness';
import { loadFixture } from '../../testing/load-fixture';

/** User Story 7: one refusal surface for both prerequisites (T098–T102). */
describe('payload gate', () => {
  let ws: FakeWebsocketService;

  function configure(component: any) {
    localStorage.clear();
    ws = new FakeWebsocketService();
    TestBed.configureTestingModule({
      imports: [component, TranslateModule.forRoot()],
      providers: [{ provide: WebsocketService, useValue: ws }, provideRouter([])],
    });
    TestBed.inject(SchemaDescriptorService);   // the second prerequisite
  }

  afterEach(() => localStorage.clear());

  describe('the surface', () => {
    let fixture: ComponentFixture<PayloadGateComponent>;
    const el = () => fixture.nativeElement as HTMLElement;
    const q = (t: string) => el().querySelector(`[data-test="${t}"]`);
    const render = () => { TestBed.flushEffects(); fixture.detectChanges(); };

    beforeEach(() => {
      configure(PayloadGateComponent);
      fixture = TestBed.createComponent(PayloadGateComponent);
    });

    it('says it is connecting before the first frame', () => {
      render();
      expect(q('gate-pending')).not.toBeNull();
    });

    it('a mismatch names both versions and what to do', () => {
      ws.connect(2);
      render();
      expect(q('gate-refused')?.textContent).toContain('gate.version.title');
      expect(q('gate-versions')?.textContent).toContain('gate.version.versions');
      expect(fixture.componentInstance.detail()).toEqual({ announced: 2, implemented: 1 });
    });

    it('a silent peer is refused as version 0, and said to be older', () => {
      ws.open();
      ws.receiveRaw({ type: 'initial_mappings', value: {} });
      render();
      expect(fixture.componentInstance.detail()['announced']).toBe(0);
      expect(q('gate-refused')?.textContent).toContain('gate.version.silent');
    });

    it('the descriptor failure goes through the same surface, its reason named', () => {
      ws.connect();
      const frame = loadFixture('schema-descriptor-script');
      frame.value.types = frame.value.types.filter((t: any) => t.key !== 'script:FadeCueType');
      ws.receiveRaw(frame);
      render();
      expect(q('gate-reason')?.textContent).toContain('gate.descriptor.descriptor_unusable');
      expect(q('gate-gaps')?.textContent).toContain('script:FadeCueType.(type)');
    });

    it('shows nothing once open, and a notice — not a blank — while a reconnect re-checks', () => {
      ws.connect();
      ws.receiveRaw(loadFixture('schema-descriptor-script'));
      render();
      expect(el().textContent!.trim()).toBe('');
      ws.open();
      render();
      expect(q('gate-reconnecting')).not.toBeNull();
    });
  });

  describe('the shell', () => {
    let fixture: ComponentFixture<AppComponent>;
    const outlet = () => fixture.nativeElement.querySelector('router-outlet');
    const render = () => { TestBed.flushEffects(); fixture.detectChanges(); };

    beforeEach(() => {
      configure(AppComponent);
      spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      fixture = TestBed.createComponent(AppComponent);
    });

    it('creates no routed screen before the gate opens, and none on a refusal', () => {
      render();
      expect(outlet()).toBeNull();
      ws.connect(2);
      render();
      expect(outlet()).toBeNull();
      expect(fixture.nativeElement.querySelector('app-header')).not.toBeNull();   // the shell stays usable
    });

    it('creates the outlet once open; hides it, without destroying it, on a later refusal', () => {
      ws.connect();
      ws.receiveRaw(loadFixture('schema-descriptor-script'));
      render();
      const first = outlet();
      expect(first).not.toBeNull();
      expect(first.parentElement.hidden).toBeFalse();
      ws.connect(2);
      render();
      expect(outlet()).toBe(first);
      expect(first.parentElement.hidden).toBeTrue();
    });
  });
});
