import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SchemaDocumentViewComponent } from './schema-document-view.component';
import { documentOutline, rootType } from './document-outline';
import { WebsocketService } from '../../../services/websocket.service';
import { parseSchemaDescriptor } from '../../../services/projects/handlers/schema-descriptor.handler';
import { FakeRouter, FakeWebsocketService } from '../../../testing/characterization-harness';
import { Router } from '@angular/router';
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
  const PROJECT = 'c0ffee00-0000-4000-8000-000000000002';
  const recorded = (name: string) => loadFixture('config-load')[name][0];

  function create(schema: 'settings' | 'project_settings' | 'project_mappings') {
    const fixture = TestBed.createComponent(SchemaDocumentViewComponent);
    fixture.componentRef.setInput('schema', schema);
    fixture.detectChanges();
    TestBed.flushEffects();
    return fixture;
  }
  const el = (f: ComponentFixture<any>) => f.nativeElement as HTMLElement;
  const q = (f: ComponentFixture<any>, t: string) => el(f).querySelectorAll(`[data-test="${t}"]`);
  const refresh = (f: ComponentFixture<any>) => { TestBed.flushEffects(); f.detectChanges(); };

  beforeEach(() => {
    ws = new FakeWebsocketService();
    TestBed.configureTestingModule({
      imports: [SchemaDocumentViewComponent, TranslateModule.forRoot()],
      providers: [{ provide: WebsocketService, useValue: ws }, { provide: Router, useValue: new FakeRouter() }],
    });
  });

  it('settings: asks for its schema and its file on entry, and says it is read-only', () => {
    const f = create('settings');
    expect(ws.sent).toContain({ action: 'schema_descriptor', value: 'settings' });
    expect(ws.sent).toContain({ action: 'config_load', value: { schema: 'settings' } });
    expect(q(f, 'read-only-note')[0].textContent).toContain('config.read-only');
  });

  it('settings: shows the file\'s values beside the schema, and its revision', () => {
    const f = create('settings');
    ws.receive(loadFixture('schema-descriptor-settings'));
    ws.receive(recorded('settings'));
    refresh(f);
    const values = Array.from(q(f, 'value')).map(e => e.textContent!.trim());
    expect(values).toContain('= project-manager.db');
    expect(values).toContain('= 0367f391-ebf4-48b2-9f26-000000000001');
    expect(q(f, 'document-revision')[0].textContent).toContain(recorded('settings').value.revision);
  });

  it('a one-value enumeration (the NOT PROVISIONED uuid) renders as text, not as a choice', () => {
    const f = create('settings');
    ws.receive(loadFixture('schema-descriptor-settings'));
    refresh(f);
    expect(Array.from(q(f, 'enum')).some(e => e.textContent!.includes('00000000-0000-0000-0000-000000000000'))).toBeFalse();
  });

  it('project_mappings: waits for a project, then reads that project\'s file — repeated containers item by item', () => {
    const f = create('project_mappings');
    expect(ws.sent.some(m => m.action === 'config_load')).toBeFalse();
    f.componentInstance.selectProject(PROJECT);
    refresh(f);
    expect(ws.sent).toContain({ action: 'config_load', value: { schema: 'project_mappings', project_uuid: PROJECT } });
    ws.receive(loadFixture('schema-descriptor-project_mappings'));
    ws.receive(recorded('project_mappings'));
    refresh(f);
    expect(q(f, 'item').length).toBeGreaterThan(0);
    expect(Array.from(q(f, 'value')).map(e => e.textContent!.trim())).toContain('= output');
    expect(Array.from(q(f, 'enum')).some(e => e.textContent!.includes('input, output'))).toBeTrue();
  });

  it('a file that does not exist yet shows no values — the instance is not the configuration', () => {
    const f = create('project_mappings');
    f.componentInstance.selectProject(PROJECT);
    refresh(f);
    ws.receive(loadFixture('schema-descriptor-project_mappings'));
    ws.receive(recorded('project_mappings, no file yet'));
    refresh(f);
    expect(q(f, 'document-missing').length).toBe(1);
    expect(q(f, 'value').length).toBe(0);
  });

  it('project_settings: the editor\'s refusal (cuems-editor UR-7, gate G2) is shown', () => {
    const f = create('project_settings');
    f.componentInstance.selectProject(PROJECT);
    refresh(f);
    const refusal = recorded('project_settings (gate G2)');
    ws.receiveError({ action: refusal.action, message: refusal.value, raw: refusal });
    refresh(f);
    expect(q(f, 'document-failed').length).toBe(1);
    expect(el(f).textContent).toContain('cuems-editor UR-7');
  });

  it('a document the library refuses is config_load_failed, its message shown verbatim', () => {
    const f = create('settings');
    ws.receive(recorded('settings, pre-013 file (library refuses)'));
    refresh(f);
    expect(el(f).textContent).toContain('pre-013 device shape');
  });

  it('reads again when another session saves it (config_changed)', () => {
    create('settings');
    ws.receive(recorded('settings'));
    const loads = () => ws.sent.filter(m => m.action === 'config_load').length;
    const before = loads();
    ws.receive({ type: 'config_changed', value: { schema: 'settings', project_uuid: null, revision: 'x' } });
    expect(loads()).toBe(before + 1);
    ws.receive({ type: 'config_changed', value: { schema: 'project_settings', project_uuid: 'other', revision: 'y' } });
    expect(loads()).toBe(before + 1);
  });

  it('offers no editing and never sends config_save', () => {
    const f = create('settings');
    ws.receive(loadFixture('schema-descriptor-settings'));
    ws.receive(recorded('settings'));
    refresh(f);
    expect(el(f).querySelector('input, textarea')).toBeNull();
    expect(ws.sent.some(m => m.action === 'config_save')).toBeFalse();
  });
});
