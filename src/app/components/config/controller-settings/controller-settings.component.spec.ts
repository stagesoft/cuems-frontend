import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ControllerSettingsComponent } from './controller-settings.component';
import { WebsocketService } from '../../../services/websocket.service';
import { FakeWebsocketService } from '../../../testing/characterization-harness';
import { loadFixture } from '../../../testing/load-fixture';

describe('ControllerSettingsComponent', () => {
  it('shows the settings document, named for it, read-only', () => {
    const ws = new FakeWebsocketService();
    TestBed.configureTestingModule({
      imports: [ControllerSettingsComponent, TranslateModule.forRoot()],
      providers: [{ provide: WebsocketService, useValue: ws }, provideRouter([])],
    });
    const fixture = TestBed.createComponent(ControllerSettingsComponent);
    fixture.detectChanges();
    expect(ws.sent).toContain({ action: 'schema_descriptor', value: 'settings' });
    ws.receive(loadFixture('schema-descriptor-settings'));
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('config.settings.title');
    expect(fixture.nativeElement.querySelectorAll('[data-test="field"]').length).toBeGreaterThan(0);
    expect(ws.sent.some(m => m.action === 'config_save')).toBeFalse();
  });
});
