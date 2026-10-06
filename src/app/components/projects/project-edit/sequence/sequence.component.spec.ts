/**
 * Characterization of ProjectEditSequenceComponent — today's behaviour, pinned before the port.
 *
 * ┌─ The rule (contracts/characterization-rules.md, FR-004a) ─────────────────┐
 * │ These expectations pin what the code does TODAY, fed recorded payloads.   │
 * │ The port re-runs them with only the INPUT FIXTURE swapped. Exactly two    │
 * │ expectation changes are sanctioned, and the pair is closed — it may not   │
 * │ be extended once the port has begun:                                      │
 * │   1. master volume 20 -> 100 (FR-032)                                     │
 * │   2. canAdopt flipping once the booleans change (FR-057)                  │
 * │ Any other divergence is a FINDING to record, never a test to edit.        │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Private methods are reached through their public entry where one exists
 * (checkForChanges -> prepareCueListForSaving -> transformCueToServerFormat;
 * onOutputSelectionChange -> the two assign* call sites), otherwise by cast:
 * the unit under characterization is today's behaviour, not today's API.
 *
 * The recorded project frame has no DMX or Fade cue, so their intake is fed
 * the recorded template's DmxCue / FadeCue entries, which carry the same
 * pre-001 keys.
 */
import { TestBed } from '@angular/core/testing';
import { ProjectEditSequenceComponent } from './sequence.component';
import { ProjectsService } from '../../../../services/projects/projects.service';
import { ProjectEditStateService } from '../../../../services/projects/project-edit-state.service';
import { Harness, instantiate, setUpCharacterization } from '../../../../testing/characterization-harness';
import { loadFixture } from '../../../../testing/load-fixture';

const C = '0367f391-ebf4-48b2-9f26-000000000001';
const PROJECT = 'project-uuid';

describe('ProjectEditSequenceComponent (characterization)', () => {
  let h: Harness;
  let component: ProjectEditSequenceComponent;
  let projects: ProjectsService;
  let editState: ProjectEditStateService;
  const any = () => component as any;

  /** Deliver the recorded frames the way a connect does, then build the component. */
  function setUp(opts: { template?: boolean; mappings?: boolean } = {}) {
    const { template = true, mappings = true } = opts;
    projects = TestBed.inject(ProjectsService);
    editState = TestBed.inject(ProjectEditStateService);
    if (template) h.ws.receive(loadFixture('initial-template-pre001'));
    if (mappings) h.ws.receive(loadFixture('initial-mappings-pre001'));
    component = instantiate(ProjectEditSequenceComponent);
    any().loadInitialMappings();
  }

  function loadProject(frameName: 'project-pre001' | 'project-013' = 'project-pre001') {
    const frame = loadFixture(frameName);
    component.projectData = frame.value;
    any().loadProjectCues(frame.value);
    return frame;
  }

  function templateContents(): any[] {
    return loadFixture('initial-template-pre001').value.CuemsScript.CueList.contents;
  }

  /** What the save path would send for the current cues (public route). */
  function savedContents(): any[] | null {
    component.projectUuid = PROJECT;
    component.originalCues = [];
    component.checkForChanges();
    return editState.getComponentData('sequence', PROJECT)?.contents ?? null;
  }

  function addCue(type: 'action' | 'audio' | 'video' | 'dmx' | 'fade') {
    component.addCue(type);
    return component.cues[component.cues.length - 1];
  }

  beforeEach(() => {
    jasmine.clock().install();   // addCue schedules a scroll; keep it off the DOM
    h = setUpCharacterization();
    spyOn(console, 'warn');
    spyOn(console, 'error');
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    try { localStorage.clear(); } catch { /* blocked */ }
  });

  describe('transformCuesFromProject (T014)', () => {
    it('resolves one cue per recorded item, typed by its key', () => {
      setUp();
      loadProject();
      expect(component.cues.map(c => c.type)).toEqual(['action', 'video', 'audio', 'video']);
      expect(component.cues.map(c => c.id)).toEqual([
        '58763af8-462c-4831-bd08-d3e978dc4a0a',
        '1f301cf8-dd03-4b40-ac17-ef0e5e7988be',
        'bb391e70-e65e-47ca-8b29-5a7076bbd250',
        '96d6e5de-c29b-4ab2-b828-297d84293304',
      ]);
      expect(component.cues.map(c => c.order)).toEqual([1, 2, 3, 4]);
    });

    it('reads enabled as true for the string "True" (and for JSON true)', () => {
      setUp();
      const frame = loadProject();
      expect(component.cues.every(c => c.enabled === true)).toBeTrue();
      const contents = frame.value.CuemsScript.CueList.contents;
      contents[0].ActionCue.enabled = 'False';
      contents[1].VideoCue.enabled = true;
      contents[2].AudioCue.enabled = false;
      const cues = any().transformCuesFromProject(contents);
      expect(cues.map((c: any) => c.enabled)).toEqual([false, true, false, true]);
    });

    it('takes master_vol from the cue, else 20 — for every cue type', () => {
      setUp();
      loadProject();
      expect(component.cues.map(c => c.master_vol)).toEqual([20, 20, 66, 20]);
      const contents = loadFixture('project-pre001').value.CuemsScript.CueList.contents;
      contents[2].AudioCue.master_vol = 0;
      expect(any().transformCuesFromProject(contents)[2].master_vol).toBe(20);
    });

    it('maps the timing, loop and notes fields', () => {
      setUp();
      loadProject();
      const [action, video, audio] = component.cues;
      expect(action.time).toBe('00:00:00.000');
      expect(action.prewait).toBe('00:00:00.000');
      expect(action.postwait).toBe('00:00:00.000');
      expect(action.post_go).toBe('pause');
      expect(action.actionType).toBe('noContinue');
      expect(action.loop).toBe('inf');          // loop 0
      expect(action.loop_times).toBe(-1);
      expect(audio.loop).toBe('loop');          // loop 1
      expect(audio.loop_times).toBe(1);
      expect(action.notes).toBe('');
      expect(video.name).toBe('empty');
      expect(action.action_target).toBe('1f301cf8-dd03-4b40-ac17-ef0e5e7988be');
      expect(action.action_type).toBe('play');
      expect(audio.action_target).toBeUndefined();
    });

    it('keeps the original item as originalData', () => {
      setUp();
      const frame = loadProject();
      expect(component.cues[2].originalData).toEqual(frame.value.CuemsScript.CueList.contents[2]);
    });

    it('selects no output for a recorded cue whose outputs are null', () => {
      setUp();
      loadProject();
      expect(component.cues.map(c => c.selectedOutputs)).toEqual([[], [], [], []]);
      expect(component.cues[2].selectedAudioOutput).toBeUndefined();
      expect(component.cues[1].selectedVideoOutput).toBeUndefined();
    });

    it('validates recorded audio outputs against the mappings', () => {
      setUp();
      const cues = any().transformCuesFromProject(templateContents());
      const audio = cues.find((c: any) => c.type === 'audio');
      expect(audio.selectedOutputs).toEqual([`${C}_system:playback_1`]);
      expect(audio.selectedAudioOutput).toBe(`${C}_system:playback_1`);
    });

    it('falls back to the first audio option when no recorded output is in the mappings', () => {
      setUp();
      const contents = templateContents();
      contents[0].AudioCue.outputs[0].AudioCueOutput.output_name = `${C}_gone`;
      const audio = any().transformCuesFromProject(contents)[0];
      expect(audio.selectedOutputs).toEqual([`${C}_0`]);
      expect(audio.selectedAudioOutput).toBe(`${C}_0`);
    });

    it('splits a recorded video custom output from its alias and reads the canvas region', () => {
      setUp();
      const video = any().transformCuesFromProject(templateContents())[1];
      expect(video.type).toBe('video');
      expect(video.selectedOutputs).toEqual([`${C}_0`]);
      expect(video.selectedVideoOutput).toBe(`${C}_0`);
      expect(video.is_custom_output).toBeTrue();
      expect(video.canvas_region).toEqual({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 });
    });

    it('defaults is_custom_output false and a full-frame canvas region', () => {
      setUp();
      loadProject();
      expect(component.cues[1].is_custom_output).toBeFalse();
      expect(component.cues[1].canvas_region).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    });

    it('unwraps DMX channels to 1-based numbers and reads the DMX output', () => {
      setUp();
      const contents = templateContents();
      contents[2].DmxCue.DmxScene.DmxUniverse.dmx_channels.push({ DmxChannel: { channel: 9, value: 200 } });
      contents[2].DmxCue.DmxScene.DmxUniverse.universe_num = 3;
      contents[2].DmxCue.fadein_time = 1500;
      const dmx = any().transformCuesFromProject(contents)[2];
      expect(dmx.type).toBe('dmx');
      expect(dmx.dmx_channels).toEqual([{ channel: 1, value: 0 }, { channel: 10, value: 200 }]);
      expect(dmx.universe_num).toBe(3);
      expect(dmx.fade_in_time).toBe(1.5);
      expect(dmx.selectedOutputs).toEqual([C]);
    });

    it('unwraps the fade duration from its CTimecode wrapper', () => {
      setUp();
      const fade = any().transformCuesFromProject(templateContents())[4];
      expect(fade.type).toBe('fade');
      expect(fade.fade_duration).toBe('00:00:02.000');
      expect(fade.fade_curve_type).toBe('linear');
      expect(fade.fade_target_value).toBe(0);
      expect(fade.action_type).toBe('fade_action');
    });

    it('drops an item whose key is not one of the five it knows', () => {
      setUp();
      const cues = any().transformCuesFromProject([{ SomethingElse: { id: 'x' } }]);
      expect(cues).toEqual([]);
    });
  });

  describe('addCue (T015)', () => {
    it('audio: master volume from the cached template, first audio option as output', () => {
      setUp();
      const cue = addCue('audio');
      expect(cue.master_vol).toBe(66);
      expect(cue.selectedAudioOutput).toBe(`${C}_0`);
      expect(cue.selectedOutputs).toEqual([`${C}_0`]);
      expect(cue.name).toBe('new.audio');
      expect(cue.enabled).toBeTrue();
      expect(cue.expanded).toBeTrue();
      expect(cue.activeTab).toBe('edit');
      expect(cue.order).toBe(1);
    });

    it('audio: master volume 20 when no template is present', () => {
      setUp({ template: false });
      expect(addCue('audio').master_vol).toBe(20);
    });

    it('audio: the mapping default when there are no options, else nothing', () => {
      setUp({ mappings: false });
      expect(addCue('audio').selectedOutputs).toEqual([]);
      const frame = loadFixture('initial-mappings-pre001');
      delete frame.value.nodes[0].node.audio;
      delete frame.value.nodes[0].node.video;
      h.ws.receive(frame);
      const cue = addCue('audio');
      expect(cue.selectedAudioOutput).toBe(`${C}_system:playback_1`);
      expect(cue.selectedOutputs).toEqual([`${C}_system:playback_1`]);
    });

    it('video: first video option, not custom, full-frame region', () => {
      setUp();
      const cue = addCue('video');
      expect(cue.selectedVideoOutput).toBe(`${C}_0`);
      expect(cue.selectedOutputs).toEqual([`${C}_0`]);
      expect(cue.is_custom_output).toBeFalse();
      expect(cue.canvas_region).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    });

    it('dmx: one channel seed, zero fade, the mapping default as output', () => {
      setUp();
      const cue = addCue('dmx');
      expect(cue.dmx_channels).toEqual([{ channel: 1, value: 0 }]);
      expect(cue.fade_in_time).toBe(0);
      expect(cue.selectedOutputs).toEqual([C]);
    });

    it('dmx: the same seed with no template', () => {
      setUp({ template: false });
      expect(addCue('dmx').dmx_channels).toEqual([{ channel: 1, value: 0 }]);
    });

    it('action and fade: no outputs, their own defaults', () => {
      setUp();
      const action = addCue('action');
      expect(action.selectedOutputs).toEqual([]);
      expect(action.action_target).toBeNull();
      expect(action.action_type).toBe('play');
      const fade = addCue('fade');
      expect(fade.selectedOutputs).toEqual([]);
      expect(fade.fade_curve_type).toBe('linear');
      expect(fade.fade_duration).toBe('00:00:01.000');
      expect(fade.fade_target_value).toBe(0);
      expect(fade.action_type).toBe('fade_action');
      expect(component.cues.map(c => c.order)).toEqual([1, 2]);
    });
  });

  describe('getTemplateOutputStructure (T016)', () => {
    it('audio: a clone of the template AudioCue\'s first AudioCueOutput', () => {
      setUp();
      const structure = any().getTemplateOutputStructure('audio');
      expect(structure).toEqual({
        output_name: `${C}_system:playback_1`,
        output_vol: 80,
        channels: [{ channel: { channel_num: 0, channel_vol: 80 } }],
      });
      structure.output_name = 'mutated';
      expect(any().getTemplateOutputStructure('audio').output_name).toBe(`${C}_system:playback_1`);
    });

    it('video: a clone of the template VideoCue\'s first VideoCueOutput', () => {
      setUp();
      expect(any().getTemplateOutputStructure('video')).toEqual({
        output_name: `${C}_0`,
        output_geometry: {
          x_scale: 1, y_scale: 1,
          corners: {
            top_left: { x: 0, y: 0 }, top_right: { x: 0, y: 0 },
            bottom_left: { x: 0, y: 0 }, bottom_right: { x: 0, y: 0 },
          },
        },
      });
    });

    it('null with no template', () => {
      setUp({ template: false });
      expect(any().getTemplateOutputStructure('audio')).toBeNull();
      expect(any().getTemplateOutputStructure('video')).toBeNull();
    });
  });

  describe('transformCueToServerFormat and the save wrapper (T017)', () => {
    it('wraps each cue under its per-type key', () => {
      setUp();
      (['audio', 'video', 'action', 'dmx', 'fade'] as const).forEach(t => addCue(t));
      expect(savedContents()!.map(item => Object.keys(item))).toEqual(
        [['AudioCue'], ['VideoCue'], ['ActionCue'], ['DmxCue'], ['FadeCue']]);
    });

    it('writes enabled as the string "True" / "False"', () => {
      setUp();
      addCue('action');
      addCue('action');
      component.cues[1].enabled = false;
      expect(savedContents()!.map(item => item.ActionCue.enabled)).toEqual(['True', 'False']);
    });

    it('writes master_vol from the cue, else 20', () => {
      setUp();
      addCue('audio');
      addCue('audio');
      addCue('audio');
      component.cues[1].master_vol = 0;
      component.cues[2].master_vol = undefined;
      expect(savedContents()!.map(item => item.AudioCue.master_vol)).toEqual([66, 20, 20]);
    });

    it('builds an audio cue from the template, with the selected output cloned in', () => {
      setUp();
      const cue = addCue('audio');
      const saved = savedContents()![0].AudioCue;
      expect(saved.id).toBe(cue.id);
      expect(saved.name).toBe('new.audio');
      expect(saved.description).toBe('');
      expect(saved.post_go).toBe('pause');
      expect(saved.offset).toEqual({ CTimecode: '00:00:00.000' });
      expect(saved.loop).toBe(1);
      expect(saved.Media).toBeUndefined();      // no media file selected
      expect(saved.fade_profiles).toBeNull();   // carried from the template
      expect(saved.outputs).toEqual([{ AudioCueOutput: {
        output_name: `${C}_0`, output_vol: 80,
        channels: [{ channel: { channel_num: 0, channel_vol: 80 } }],
      } }]);
    });

    it('writes the selected media file into Media', () => {
      setUp();
      const cue = addCue('audio');
      cue.selectedMediaFile = { uuid: 'm1', file: { unix_name: 'song.wav', duration: '00:01:00.000' } };
      expect(savedContents()![0].AudioCue.Media).toEqual({
        file_name: 'song.wav', id: 'm1', duration: '00:01:00.000',
        regions: [{ Region: { id: 0, loop: 1,
          in_time: { CTimecode: '00:00:00.000' }, out_time: { CTimecode: '00:00:00.000' } } }],
      });
    });

    it('infinite loop is written as -1', () => {
      setUp();
      const cue = addCue('action');
      cue.loop = 'inf';
      expect(savedContents()![0].ActionCue.loop).toBe(-1);
    });

    it('a non-uuid id is replaced by a fresh one', () => {
      setUp();
      const cue = addCue('action');
      cue.id = 7;
      const id = savedContents()![0].ActionCue.id;
      expect(typeof id).toBe('string');
      expect(id).toContain('-');
    });

    it('video custom output: alias outputs then one custom output with the region', () => {
      setUp();
      const cue = addCue('video');
      cue.is_custom_output = true;
      cue.canvas_region = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };
      const outputs = savedContents()![0].VideoCue.outputs;
      expect(outputs.map((o: any) => o.VideoCueOutput.output_name)).toEqual([`${C}_0`, `${C}_custom_0`]);
      expect(outputs[1].VideoCueOutput.canvas_region).toEqual({ x: 0.2, y: 0.2, width: 0.3, height: 0.3 });
      expect(outputs[0].VideoCueOutput.canvas_region).toBeUndefined();
    });

    it('dmx: 0-based channels, universe, fade in ms and the bare-uuid output', () => {
      setUp();
      const cue = addCue('dmx');
      cue.dmx_channels = [{ channel: 1, value: 10 }, { channel: 512, value: 255 }];
      cue.universe_num = 2;
      cue.fade_in_time = 1.25;
      const saved = savedContents()![0].DmxCue;
      expect(saved.DmxScene.DmxUniverse.dmx_channels).toEqual([
        { DmxChannel: { channel: 0, value: 10 } }, { DmxChannel: { channel: 511, value: 255 } }]);
      expect(saved.DmxScene.DmxUniverse.universe_num).toBe(2);
      expect(saved.fadein_time).toBe(1250);
      expect(saved.outputs).toEqual([{ DmxCueOutput: { output_name: C } }]);
    });

    it('dmx: no channels empties the template scene\'s channel list', () => {
      setUp();
      const cue = addCue('dmx');
      cue.dmx_channels = [];
      cue.universe_num = 4;
      const universe = savedContents()![0].DmxCue.DmxScene.DmxUniverse;
      expect(universe.dmx_channels).toEqual([]);
      expect(universe.universe_num).toBe(4);
    });

    it('fade: curve, canonical duration, target and action type', () => {
      setUp();
      const cue = addCue('fade');
      cue.fade_duration = '00:00:03.500';
      cue.fade_target_value = 40;
      cue.action_target = 'target-cue';
      const saved = savedContents()![0].FadeCue;
      expect(saved.curve_type).toBe('linear');
      expect(saved.duration).toEqual({ CTimecode: '00:00:03.500' });
      expect(saved.target_value).toBe(40);
      expect(saved.action_target).toBe('target-cue');
      expect(saved.action_type).toBe('fade_action');
    });

    it('drops every cue when no template is present', () => {
      setUp({ template: false });
      addCue('action');
      expect(savedContents()).toBeNull();
    });

    it('saveProject sends the loaded project back with the edited contents, top-level keys included', () => {
      setUp();
      const frame = loadProject();
      component.cues[0].name = 'renamed';
      component.projectUuid = PROJECT;
      component.checkForChanges();
      component.hasProjectChanges = true;
      component.saveProject();
      const sent = h.ws.sent.find(m => m.action === 'project_save');
      expect(sent).toBeDefined();
      expect(Object.keys(sent.value)).toEqual([...Object.keys(frame.value), 'uuid']);
      expect(sent.value.uuid).toBe(PROJECT);
      expect(sent.value.CuemsScript.CueList.contents[0].ActionCue.name).toBe('renamed');
      expect(sent.value.CuemsScript.CueList.contents.map((i: any) => Object.keys(i)[0]))
        .toEqual(['ActionCue', 'VideoCue', 'AudioCue', 'VideoCue']);
    });
  });

  describe('the three getTemplateOutputStructure call sites (T018)', () => {
    it('site 1 (custom video, inside transformCueToServerFormat): no structure, no outputs written', () => {
      setUp();
      const cue = addCue('video');
      cue.is_custom_output = true;
      const template = loadFixture('initial-template-pre001');
      delete template.value.CuemsScript.CueList.contents[1].VideoCue.outputs;
      h.ws.receive(template);
      expect(savedContents()![0].VideoCue.outputs).toBeUndefined();
    });

    it('site 2 (assignMultipleAudioOutputs, via onOutputSelectionChange): one cloned output per selection', () => {
      setUp();
      const cue = addCue('audio');
      component.projectUuid = PROJECT;
      component.onOutputSelectionChange([`${C}_0`, `${C}_1`], cue);
      const outputs = editState.getComponentData('sequence', PROJECT).contents[0].AudioCue.outputs;
      expect(outputs.map((o: any) => o.AudioCueOutput.output_name)).toEqual([`${C}_0`, `${C}_1`]);
    });

    it('site 2: an output not in the mappings is replaced by the first audio option', () => {
      setUp();
      const cue = addCue('audio');
      component.projectUuid = PROJECT;
      component.onOutputSelectionChange([`${C}_gone`], cue);
      const outputs = editState.getComponentData('sequence', PROJECT).contents[0].AudioCue.outputs;
      expect(outputs.map((o: any) => o.AudioCueOutput.output_name)).toEqual([`${C}_0`]);
    });

    it('site 2: no structure leaves the template\'s own outputs untouched and warns', () => {
      setUp();
      const cue = addCue('audio');
      const template = loadFixture('initial-template-pre001');
      delete template.value.CuemsScript.CueList.contents[0].AudioCue.outputs;
      h.ws.receive(template);
      component.projectUuid = PROJECT;
      component.onOutputSelectionChange([`${C}_0`], cue);
      const saved = editState.getComponentData('sequence', PROJECT).contents[0].AudioCue;
      expect(saved.outputs).toBeUndefined();
      expect(console.warn).toHaveBeenCalled();
    });

    it('site 3 (assignMultipleVideoOutputs, via onOutputSelectionChange): one cloned output per selection', () => {
      setUp();
      const cue = addCue('video');
      component.projectUuid = PROJECT;
      component.onOutputSelectionChange([`${C}_1`, `${C}_2`], cue);
      const outputs = editState.getComponentData('sequence', PROJECT).contents[0].VideoCue.outputs;
      expect(outputs.map((o: any) => o.VideoCueOutput.output_name)).toEqual([`${C}_1`, `${C}_2`]);
      expect(outputs[0].VideoCueOutput.output_geometry.x_scale).toBe(1);
    });

    it('site 3: no structure leaves the template\'s own outputs in place and warns', () => {
      setUp();
      const cue = addCue('video');
      const template = loadFixture('initial-template-pre001');
      delete template.value.CuemsScript.CueList.contents[1].VideoCue.outputs;
      h.ws.receive(template);
      component.projectUuid = PROJECT;
      component.onOutputSelectionChange([`${C}_0`], cue);
      expect(editState.getComponentData('sequence', PROJECT).contents[0].VideoCue.outputs).toBeUndefined();
      expect(console.warn).toHaveBeenCalled();
    });

    it('an empty selection falls back to the first option of the cue\'s type', () => {
      setUp();
      const cue = addCue('video');
      component.onOutputSelectionChange([], cue);
      expect(cue.selectedOutputs).toEqual([`${C}_0`]);
      expect(cue.selectedVideoOutput).toBe(`${C}_0`);
    });
  });

  describe('read side and the duration display (T019)', () => {
    it('getCueTypeKey / getCueData recognise the five per-type keys only', () => {
      setUp();
      const frame = loadProject();
      const items = frame.value.CuemsScript.CueList.contents;
      expect(items.map((i: any) => component.getCueTypeKey(i)))
        .toEqual(['ActionCue', 'VideoCue', 'AudioCue', 'VideoCue']);
      expect(component.getCueData(items[2])).toEqual(items[2].AudioCue);
      expect(component.getCueTypeKey(null)).toBeNull();
      expect(component.getCueTypeKey({ Cue: {} })).toBeNull();
      expect(component.getCueData({ Cue: {} })).toBeNull();
    });

    it('getCueMediaDuration: no media file selected -> the recorded Media.duration as it arrived', () => {
      setUp();
      loadProject();
      expect(component.getCueMediaDuration(component.cues[2])).toBe('00:00:00.000');
      expect(component.getCueMediaDuration(component.cues[1])).toBe('00:00:00.000');
    });

    it('getCueMediaDuration: the selected file\'s duration wins', () => {
      setUp();
      loadProject();
      component.cues[2].selectedMediaFile = { uuid: 'm', file: { duration: '00:02:00.000' } };
      expect(component.getCueMediaDuration(component.cues[2])).toBe('00:02:00.000');
    });

    it('getCueMediaDuration: "-" for action and dmx, the fade duration for fade', () => {
      setUp();
      loadProject();
      expect(component.getCueMediaDuration(component.cues[0])).toBe('-');
      const fade = addCue('fade');
      expect(component.getCueMediaDuration(fade)).toBe('00:00:01.000');
      fade.fade_duration = '';
      expect(component.getCueMediaDuration(fade)).toBe('-');
      expect(component.getCueMediaDuration(addCue('dmx'))).toBe('-');
    });
  });
});
