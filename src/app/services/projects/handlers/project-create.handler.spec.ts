import { createProject, newCueListFromDescriptor, newScriptFromDescriptor } from './project-create.handler';
import { parseSchemaDescriptor } from './schema-descriptor.handler';
import { loadFixture } from '../../../testing/load-fixture';

const descriptor = () => parseSchemaDescriptor(loadFixture('schema-descriptor-script').value)!;
const OPTIONS = [{ uuid: 'n_0', name: 'node1:0', type: 'audio' as const }];

describe('project-create handler', () => {
  it('builds an empty CueList from the descriptor, with zero offsets and a fresh id', () => {
    const cueList = newCueListFromDescriptor(descriptor());
    expect(cueList.contents).toEqual([]);
    expect(cueList.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(cueList.offset).toEqual({ CTimecode: '00:00:00.000' });
    expect(cueList.prewait).toEqual({ CTimecode: '00:00:00.000' });
    expect(cueList.postwait).toEqual({ CTimecode: '00:00:00.000' });
    expect(cueList.enabled).toBeTrue();          // descriptor default, native boolean
    expect(cueList.post_go).toBe('pause');
    expect(newCueListFromDescriptor(descriptor()).id).not.toBe(cueList.id);
  });

  it('builds a new script named by the operator, nothing beside CuemsScript', () => {
    const script = newScriptFromDescriptor(descriptor(), { name: 'Show', description: 'Opening night' });
    expect(Object.keys(script)).toEqual(['CuemsScript']);
    expect(script.CuemsScript.name).toBe('Show');
    expect(script.CuemsScript.description).toBe('Opening night');
    expect(script.CuemsScript.CueList.contents).toEqual([]);
    expect('schemaLocation' in script).toBeFalse();
  });

  it('sends project_new with a fresh id and the slugged unix_name', () => {
    const sent: any[] = [];
    createProject({ name: 'Opening Night', description: '' }, descriptor(), OPTIONS, m => sent.push(m));
    expect(sent.length).toBe(1);
    expect(sent[0].action).toBe('project_new');
    expect(sent[0].unix_name).toBe('opening-night');
    expect(sent[0].value.CuemsScript.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sends nothing without a descriptor or without mappings', () => {
    const sent: any[] = [];
    spyOn(console, 'error');
    createProject({ name: 'x', description: '' }, null, OPTIONS, m => sent.push(m));
    createProject({ name: 'x', description: '' }, descriptor(), [], m => sent.push(m));
    expect(sent).toEqual([]);
  });
});
