import { TestBed } from '@angular/core/testing';
import { ProjectEditComponent } from './project-edit.component';
import { ProjectEditStateService } from '../../../services/projects/project-edit-state.service';
import { ProjectsService } from '../../../services/projects/projects.service';
import { ProjectWorkspaceService } from '../../../services/project-workspace.service';
import { NotificationService } from '../../../services/ui/notification.service';
import { Harness, instantiate, setUpCharacterization } from '../../../testing/characterization-harness';
import { loadFixture } from '../../../testing/load-fixture';

/** Covers the parent save path: the descriptor CueList (T059) and CuemsScript alone (findings F15). */
describe('ProjectEditComponent — save', () => {
  let h: Harness;
  let component: ProjectEditComponent;
  let editState: ProjectEditStateService;
  const PROJECT = 'ddba3000-7894-4a60-a6c1-e73b9bbed8c0';

  function sent() {
    return h.ws.sent.filter(m => m.action === 'project_save');
  }

  beforeEach(() => {
    h = setUpCharacterization([{ provide: ProjectWorkspaceService, useValue: {
      openInEdit() {}, updateName() {}, markDirty() {}, markSaved() {}, requestClose() {},
    } }]);
    TestBed.inject(ProjectsService);
    editState = TestBed.inject(ProjectEditStateService);
    h.ws.receive(loadFixture('schema-descriptor-script'));
    component = instantiate(ProjectEditComponent);
    component.projectUuid = PROJECT;
  });

  it('sends CuemsScript alone, leaving out the keys it keeps for display', async () => {
    const project = loadFixture('project-013').value;
    Object.assign(project, { uuid: PROJECT, name: 'Shown', unix_name: 'shown', description: 'd' });
    component.project = project;
    const contents = loadFixture('template-as-script-013').value.CuemsScript.CueList.contents;
    editState.markComponentAsChanged('sequence', PROJECT, { contents });
    await component.saveAllChanges();
    expect(sent().length).toBe(1);
    expect(Object.keys(sent()[0].value)).toEqual(['CuemsScript']);
    expect(sent()[0].value.CuemsScript.CueList.contents).toEqual(contents);
  });

  it('builds a missing CueList from the descriptor', async () => {
    const project = loadFixture('project-013').value;
    delete project.CuemsScript.CueList;
    component.project = project;
    editState.markComponentAsChanged('sequence', PROJECT, { contents: [] });
    await component.saveAllChanges();
    const cueList = sent()[0].value.CuemsScript.CueList;
    expect(cueList.contents).toBeNull();          // empty sequences are sent as null, as before
    expect(cueList.offset).toEqual({ CTimecode: '00:00:00.000' });
    expect(cueList.enabled).toBeTrue();
  });

  it('applies a metadata edit to CuemsScript', async () => {
    component.project = loadFixture('project-013').value;
    editState.markComponentAsChanged('metadata', PROJECT, { name: 'Renamed', description: 'New' });
    await component.saveAllChanges();
    expect(sent()[0].value.CuemsScript.name).toBe('Renamed');
    expect(sent()[0].value.CuemsScript.description).toBe('New');
  });

  it('without a descriptor, a missing CueList is reported and nothing is sent', async () => {
    h.ws.connect();   // a new connection forgets the descriptor
    const notifications = TestBed.inject(NotificationService);
    spyOn(notifications, 'showError');
    const project = loadFixture('project-013').value;
    delete project.CuemsScript.CueList;
    component.project = project;
    editState.markComponentAsChanged('sequence', PROJECT, { contents: [] });
    await component.saveAllChanges();
    expect(sent()).toEqual([]);
    expect(notifications.showError).toHaveBeenCalled();
  });
});
