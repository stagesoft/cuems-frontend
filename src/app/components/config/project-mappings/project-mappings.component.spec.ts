import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ProjectMappingsComponent } from './project-mappings.component';
import { WebsocketService } from '../../../services/websocket.service';
import { FakeWebsocketService } from '../../../testing/characterization-harness';
import { loadFixture } from '../../../testing/load-fixture';

describe('ProjectMappingsComponent', () => {
  it('shows the project_mappings document, named for it, read-only', () => {
    const ws = new FakeWebsocketService();
    TestBed.configureTestingModule({
      imports: [ProjectMappingsComponent, TranslateModule.forRoot()],
      providers: [{ provide: WebsocketService, useValue: ws }, provideRouter([])],
    });
    const fixture = TestBed.createComponent(ProjectMappingsComponent);
    fixture.detectChanges();
    expect(ws.sent).toContain({ action: 'schema_descriptor', value: 'project_mappings' });
    ws.receive(loadFixture('schema-descriptor-project_mappings'));
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('config.project_mappings.title');
    expect(fixture.nativeElement.querySelectorAll('[data-test="field"]').length).toBeGreaterThan(0);
    expect(ws.sent.some(m => m.action === 'config_save')).toBeFalse();
  });
});
