import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SchemaDocumentViewComponent } from './schema-document-view.component';
import { documentOutline, rootType } from './document-outline';
import { WebsocketService } from '../../../services/websocket.service';
import { parseSchemaDescriptor } from '../../../services/projects/handlers/schema-descriptor.handler';
import { FakeWebsocketService } from '../../../testing/characterization-harness';
import { loadFixture } from '../../../testing/load-fixture';

const descriptor = (name: 'settings' | 'project_settings' | 'project_mappings') =>
  parseSchemaDescriptor(loadFixture(`schema-descriptor-${name}`).value)!;

describe('config document outline', () => {
  it('starts at the document root', () => {
    expect(rootType(descriptor('settings'))!.key).toBe('settings:/CuemsSettings');
    expect(rootType(descriptor('project_mappings'))!.key).toBe('project_mappings:/CuemsProjectMappings');
  });

  it('follows an anonymous child type by its path key', () => {
    const [settings] = documentOutline(descriptor('settings'));
    expect(settings.name).toBe('Settings');
    expect(settings.children.map(f => f.name)).toContain('library_path');
    expect(settings.undescribed).toBeFalse();
  });

  it('carries an enumeration field\'s values', () => {
    const defaults = documentOutline(descriptor('project_mappings')).find(f => f.name === 'defaults')!;
    const direction = JSON.stringify(defaults);
    expect(direction).toContain('"enumValues":["input","output"]');
  });

  it('marks repeated and optional fields', () => {
    const [setting] = documentOutline(descriptor('project_settings'));
    expect(setting.repeated).toBeTrue();
  });

  it('a field whose type the descriptor does not describe is a simple value, not an error', () => {
    const d = descriptor('settings');
    d.types = d.types.filter(t => t.key !== 'settings:NodeConfType');
    const node = documentOutline(d)[0].children.find(f => f.name === 'node')!;
    expect(node.type).toBe('NodeConfType');
    expect(node.children).toEqual([]);
  });

  it('a field with no type at all is marked undescribed, not guessed', () => {
    const d = descriptor('settings');
    d.types = d.types.filter(t => t.key !== 'settings:/CuemsSettings/Settings');
    const [settings] = documentOutline(d);
    expect(settings.undescribed).toBeTrue();
    expect(settings.children).toEqual([]);
  });

  it('an absent root yields an empty outline', () => {
    const d = descriptor('settings');
    d.types = [];
    expect(documentOutline(d)).toEqual([]);
  });
});

describe('SchemaDocumentViewComponent', () => {
  let ws: FakeWebsocketService;
  let fixture: ComponentFixture<SchemaDocumentViewComponent>;
  const q = (t: string) => (fixture.nativeElement as HTMLElement).querySelectorAll(`[data-test="${t}"]`);

  beforeEach(() => {
    ws = new FakeWebsocketService();
    TestBed.configureTestingModule({
      imports: [SchemaDocumentViewComponent, TranslateModule.forRoot()],
      providers: [{ provide: WebsocketService, useValue: ws }],
    });
    fixture = TestBed.createComponent(SchemaDocumentViewComponent);
    fixture.componentRef.setInput('schema', 'project_mappings');
    fixture.detectChanges();
  });

  it('asks for its own schema on entry, and states that values and editing are not available', () => {
    expect(ws.sent).toContain({ action: 'schema_descriptor', value: 'project_mappings' });
    expect(q('loading').length).toBe(1);
    expect(q('read-only-note')[0].textContent).toContain('config.values.unavailable');
    expect(q('read-only-note')[0].textContent).toContain('config.editing.unavailable');
  });

  it('renders every field from the descriptor, defaults labelled as the schema\'s', () => {
    ws.receive(loadFixture('schema-descriptor-project_mappings'));
    fixture.detectChanges();
    expect(q('field').length).toBeGreaterThan(10);
    expect(Array.from(q('enum')).some(e => e.textContent!.includes('input, output'))).toBeTrue();
    expect(fixture.nativeElement.querySelector('input, select, textarea, button')).toBeNull();
  });

  it('never sends config_save', () => {
    ws.receive(loadFixture('schema-descriptor-project_mappings'));
    fixture.detectChanges();
    expect(ws.sent.some(m => m.action === 'config_save')).toBeFalse();
  });
});
