import { ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProjectShowSequenceComponent } from './sequence.component';
import { OscService } from '../../../../services/osc.service';
import { ProjectsService } from '../../../../services/projects/projects.service';
import { instantiate, setUpCharacterization } from '../../../../testing/characterization-harness';
import { loadFixture } from '../../../../testing/load-fixture';

/** Covers the ported cue ladder (T042) and the duration unwrap (T047). */
describe('ProjectShowSequenceComponent', () => {
  let component: ProjectShowSequenceComponent;
  let osc: { nextCue: any; cueNames: any; getCueStatus: () => null };

  const tipProject = (): any[] => loadFixture('project-013').value.CuemsScript.CueList.contents;
  const templateAsScript = (): any[] => loadFixture('template-as-script-013').value.CuemsScript.CueList.contents;

  beforeEach(() => {
    osc = { nextCue: signal(null), cueNames: signal({}), getCueStatus: () => null };
    setUpCharacterization([
      { provide: OscService, useValue: osc },
      { provide: ElementRef, useValue: new ElementRef(document.createElement('div')) },
    ]);
    component = instantiate(ProjectShowSequenceComponent);
  });

  it('identifies, names and types every cue of the tip frame', () => {
    const items = templateAsScript();
    expect(items.map(i => component.getCueId(i))).toEqual([
      '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2',
      '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a4',
      '00000000-0000-4000-8000-0000000000a5']);
    expect(items.map(i => component.getCueName(i))).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
    expect(items.map(i => component.getCueTypeIcon(i))).toEqual(['audio', 'video', 'dmx', 'action', 'fade']);
    expect(items.map(i => component.getCueActionIcon(i))).toEqual(Array(5).fill('post_go_pause'));
    expect(component.getCuePrewait(items[0])).toBe('00:00:00.000');
    expect(component.getCuePostwait(items[0])).toBe('00:00:00.000');
  });

  it('names an unnamed cue by its kind, and an unknown class by the class', () => {
    expect(component.getCueName({ Cue: { id: 'a', class: 'audio' } })).toBe('Unnamed Audio Cue');
    expect(component.getCueName({ FadeCue: { id: 'f' } })).toBe('Unnamed Fade Cue');
    expect(component.getCueName({ Cue: { id: 'l', class: 'lighting' } })).toBe('Unnamed Lighting Cue');
  });

  it('lists a cue of an unknown class as `other`, never an error', () => {
    const item = { Cue: { id: 'l1', name: 'Wash', class: 'lighting' } };
    expect(component.getCueId(item)).toBe('l1');
    expect(component.getCueTypeIcon(item)).toBe('other');
    expect(component.getCueDuration(item)).toBe('-');
  });

  it('does not list a nested CueList or an unknown key', () => {
    expect(component.getCueId({ CueList: { id: 'nested' } })).toBe('unknown');
    expect(component.getCueName({ AudioCue: { id: 'old' } })).toBe('Unknown Cue');
  });

  describe('getCueDuration (T047)', () => {
    it('unwraps the media duration — never `[object Object]`', () => {
      const [, video, audio] = tipProject();
      expect(component.getCueDuration(audio)).toBe('00:00:00.000');
      expect(component.getCueDuration(video)).toBe('00:00:00.000');
    });

    it('reads a fade\'s own duration', () => {
      expect(component.getCueDuration(templateAsScript()[4])).toBe('00:00:02.000');
    });

    it('"-" with no media, and for action and dmx', () => {
      const [, , dmx, action] = templateAsScript();
      expect(component.getCueDuration(action)).toBe('-');
      expect(component.getCueDuration(dmx)).toBe('-');
      expect(component.getCueDuration({ Cue: { class: 'audio', Media: null } })).toBe('-');
    });
  });

  it('publishes the cue names of a loaded project to the OSC service', () => {
    component.ngOnInit();
    TestBed.inject(ProjectsService).projectLoaded.emit(loadFixture('template-as-script-013').value);
    expect(Object.keys(osc.cueNames()).length).toBe(5);
    expect(osc.cueNames()['00000000-0000-4000-8000-0000000000a1']).toBe('empty');
  });
});
