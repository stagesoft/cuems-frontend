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
 * PORTED (Phases 4–5): inputs swapped to the tip wire — project-013, the
 * script descriptor in place of initial_template, and template-as-script-013
 * (the same template document on the tip wire). Expectations moved only
 * where a task requires it, each marked `moved:` with its reason:
 * delta (c) wire keys (T038–T041), native `enabled` (T046), master volume
 * -> descriptor default 100 (sanctioned, FR-032), the retired template's
 * example output_name (T056/T060), no top-level key beside CuemsScript on
 * save (findings F15), and a missing descriptor reported, not defaulted
 * (FR-034a). Mappings stay on today's wire until Phase 8.
 *
 * The recorded project frame has no DMX or Fade cue, so their intake is fed
 * the recorded template's DmxCue / FadeCue entries, which carry the same
 * pre-001 keys.
 */
import { TestBed } from '@angular/core/testing';
import { ProjectEditSequenceComponent } from './sequence.component';
import { ProjectsService } from '../../../../services/projects/projects.service';
import { ProjectEditStateService } from '../../../../services/projects/project-edit-state.service';
import { NotificationService } from '../../../../services/ui/notification.service';
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
    if (template) h.ws.receive(loadFixture('schema-descriptor-script'));
    if (mappings) h.ws.receive(loadFixture('initial-mappings-pre001'));
    component = instantiate(ProjectEditSequenceComponent);
    any().loadInitialMappings();
  }

  function loadProject(frameName: 'project-013' = 'project-013') {
    const frame = loadFixture(frameName);
    component.projectData = frame.value;
    any().loadProjectCues(frame.value);
    return frame;
  }

  /** The recorded template's five cues, as a project document on the tip wire. */
  function templateContents(): any[] {
    return loadFixture('template-as-script-013').value.CuemsScript.CueList.contents;
  }

  /** The script descriptor with one type removed: a call site's structure is missing. */
  function descriptorWithout(typeKey: string) {
    const frame = loadFixture('schema-descriptor-script');
    frame.value.types = frame.value.types.filter((t: any) => t.key !== typeKey);
    return frame;
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
      contents[1].Cue.enabled = true;
      contents[2].Cue.enabled = false;
      const cues = any().transformCuesFromProject(contents);
      expect(cues.map((c: any) => c.enabled)).toEqual([false, true, false, true]);
    });

    it('takes master_vol from the cue, else the descriptor default — for every cue type', () => {
      setUp();
      loadProject();
      // moved: 20 -> 100, sanctioned (FR-032)
      expect(component.cues.map(c => c.master_vol)).toEqual([100, 100, 66, 100]);
      const contents = loadFixture('project-013').value.CuemsScript.CueList.contents;
      contents[2].Cue.master_vol = 0;
      // moved: 20 -> 100, sanctioned (FR-032)
      expect(any().transformCuesFromProject(contents)[2].master_vol).toBe(100);
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
      contents[0].Cue.outputs[0].CueOutput.output_name = `${C}_gone`;
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
      contents[2].Cue.DmxScene.DmxUniverse.dmx_channels.push({ DmxChannel: { channel: 9, value: 200 } });
      contents[2].Cue.DmxScene.DmxUniverse.universe_num = 3;
      contents[2].Cue.fadein_time = 1500;
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
    it('audio: master volume from the descriptor, first audio option as output', () => {
      setUp();
      const cue = addCue('audio');
      // moved: template value 66 -> descriptor default 100, sanctioned (FR-032, findings F2)
      expect(cue.master_vol).toBe(100);
      expect(cue.selectedAudioOutput).toBe(`${C}_0`);
      expect(cue.selectedOutputs).toEqual([`${C}_0`]);
      expect(cue.name).toBe('new.audio');
      expect(cue.enabled).toBeTrue();
      expect(cue.expanded).toBeTrue();
      expect(cue.activeTab).toBe('edit');
      expect(cue.order).toBe(1);
    });

    it('audio: with no descriptor the gap is reported, not defaulted', () => {
      setUp({ template: false });
      const notifications = TestBed.inject(NotificationService);
      spyOn(notifications, 'showError');
      addCue('audio');
      // moved: a local fallback of 20 -> none; FR-034a forbids one
      expect(notifications.showError).toHaveBeenCalled();
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
    it('audio: a fresh wire-shaped audio output, from the descriptor', () => {
      setUp();
      const structure = any().getTemplateOutputStructure('audio');
      expect(structure).toEqual({
        // moved: the retired template's example name -> none (T056/T060); set by each call site
        output_name: null,
        output_vol: 80,
        channels: [{ channel: { channel_num: 0, channel_vol: 80 } }],
      });
      structure.output_name = 'mutated';
      expect(any().getTemplateOutputStructure('audio').output_name).toBeNull();
    });

    it('video: a fresh wire-shaped video output, from the descriptor', () => {
      setUp();
      expect(any().getTemplateOutputStructure('video')).toEqual({
        // moved: the retired template's example name -> none (T056/T060)
        output_name: null,
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
    it('wraps hardware cues as Cue + class, the rest under their own key', () => {
      setUp();
      (['audio', 'video', 'action', 'dmx', 'fade'] as const).forEach(t => addCue(t));
      // moved: per-type keys -> Cue + class, delta (c) (T038, T039)
      expect(savedContents()!.map(item => Object.keys(item))).toEqual(
        [['Cue'], ['Cue'], ['ActionCue'], ['Cue'], ['FadeCue']]);
      expect(savedContents()!.filter(item => item.Cue).map(item => item.Cue.class))
        .toEqual(['audio', 'video', 'dmx']);
      // class is the last key, as the wire carries it
      expect(savedContents()!.filter(item => item.Cue).map(item => Object.keys(item.Cue).pop()))
        .toEqual(['class', 'class', 'class']);
    });

    it('writes enabled as a native boolean', () => {
      setUp();
      addCue('action');
      addCue('action');
      component.cues[1].enabled = false;
      // moved: "True"/"False" -> true/false (T046); the 014 library refuses the string
      expect(savedContents()!.map(item => item.ActionCue.enabled)).toEqual([true, false]);
    });

    it('writes master_vol from the cue, else the descriptor default', () => {
      setUp();
      addCue('audio');
      addCue('audio');
      addCue('audio');
      component.cues[1].master_vol = 0;
      component.cues[2].master_vol = undefined;
      // moved: [66, 20, 20] -> [100, 100, 100]; the creation and write-back
      // values are the descriptor default, sanctioned (FR-032, findings F2)
      expect(savedContents()!.map(item => item.Cue.master_vol)).toEqual([100, 100, 100]);
    });

    it('builds an audio cue from the template, with the selected output cloned in', () => {
      setUp();
      const cue = addCue('audio');
      const saved = savedContents()![0].Cue;
      expect(saved.id).toBe(cue.id);
      expect(saved.name).toBe('new.audio');
      expect(saved.description).toBe('');
      expect(saved.post_go).toBe('pause');
      expect(saved.offset).toEqual({ CTimecode: '00:00:00.000' });
      expect(saved.loop).toBe(1);
      expect(saved.Media).toBeUndefined();      // no media file selected
      // moved: `fade_profiles` was the template's; hardware cues have none
      // since 001 (initial_template delta (e)), and the descriptor carries none
      expect(saved.fade_profiles).toBeUndefined();
      // moved: AudioCueOutput -> CueOutput + class, delta (c) (T039)
      expect(saved.outputs).toEqual([{ CueOutput: {
        output_name: `${C}_0`, output_vol: 80,
        channels: [{ channel: { channel_num: 0, channel_vol: 80 } }],
        class: 'audio',
      } }]);
    });

    it('writes the selected media file into Media', () => {
      setUp();
      const cue = addCue('audio');
      cue.selectedMediaFile = { uuid: 'm1', file: { unix_name: 'song.wav', duration: '00:01:00.000' } };
      expect(savedContents()![0].Cue.Media).toEqual({
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
      // moved: VideoCueOutput -> CueOutput + class, delta (c) (T039)
      const outputs = savedContents()![0].Cue.outputs;
      expect(outputs.map((o: any) => o.CueOutput.output_name)).toEqual([`${C}_0`, `${C}_custom_0`]);
      expect(outputs[1].CueOutput.canvas_region).toEqual({ x: 0.2, y: 0.2, width: 0.3, height: 0.3 });
      expect(outputs[0].CueOutput.canvas_region).toBeUndefined();
      expect(outputs.map((o: any) => o.CueOutput.class)).toEqual(['video', 'video']);
    });

    it('dmx: 0-based channels, universe, fade in ms and the bare-uuid output', () => {
      setUp();
      const cue = addCue('dmx');
      cue.dmx_channels = [{ channel: 1, value: 10 }, { channel: 512, value: 255 }];
      cue.universe_num = 2;
      cue.fade_in_time = 1.25;
      const saved = savedContents()![0].Cue;
      expect(saved.DmxScene.DmxUniverse.dmx_channels).toEqual([
        { DmxChannel: { channel: 0, value: 10 } }, { DmxChannel: { channel: 511, value: 255 } }]);
      expect(saved.DmxScene.DmxUniverse.universe_num).toBe(2);
      expect(saved.fadein_time).toBe(1250);
      // moved: DmxCueOutput -> CueOutput + class, delta (c) (T039)
      expect(saved.outputs).toEqual([{ CueOutput: { output_name: C, class: 'dmx' } }]);
    });

    it('dmx: no channels empties the template scene\'s channel list', () => {
      setUp();
      const cue = addCue('dmx');
      cue.dmx_channels = [];
      cue.universe_num = 4;
      const universe = savedContents()![0].Cue.DmxScene.DmxUniverse;
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

    it('drops every cue when no descriptor is present', () => {
      setUp({ template: false });
      addCue('action');
      expect(savedContents()).toBeNull();
    });

    it('saveProject sends CuemsScript alone, with the edited contents', () => {
      setUp();
      const frame = loadProject();
      component.cues[0].name = 'renamed';
      component.projectUuid = PROJECT;
      component.checkForChanges();
      component.hasProjectChanges = true;
      component.saveProject();
      const sent = h.ws.sent.find(m => m.action === 'project_save');
      expect(sent).toBeDefined();
      // moved: top-level keys of the loaded frame plus `uuid` -> CuemsScript only;
      // the library refuses any key beside it (findings F15, T037)
      expect(Object.keys(sent.value)).toEqual(['CuemsScript']);
      expect(sent.value.CuemsScript.id).toBe(frame.value.CuemsScript.id);
      expect(sent.value.CuemsScript.CueList.contents[0].ActionCue.name).toBe('renamed');
      // moved: per-type keys -> Cue, delta (c)
      expect(sent.value.CuemsScript.CueList.contents.map((i: any) => Object.keys(i)[0]))
        .toEqual(['ActionCue', 'Cue', 'Cue', 'Cue']);
    });
  });

  describe('the three getTemplateOutputStructure call sites (T018)', () => {
    it('site 1 (custom video, inside transformCueToServerFormat): no structure, no outputs written', () => {
      setUp();
      const cue = addCue('video');
      cue.is_custom_output = true;
      h.ws.receive(descriptorWithout('script:VideoCueOutputsType'));
      // moved: the template's own outputs -> none; a new hardware cue starts with
      // no outputs, since the descriptor's example output is refused (findings F12)
      expect(savedContents()![0].Cue.outputs).toEqual([]);
    });

    it('site 2 (assignMultipleAudioOutputs, via onOutputSelectionChange): one cloned output per selection', () => {
      setUp();
      const cue = addCue('audio');
      component.projectUuid = PROJECT;
      component.onOutputSelectionChange([`${C}_0`, `${C}_1`], cue);
      const outputs = editState.getComponentData('sequence', PROJECT).contents[0].Cue.outputs;
      expect(outputs.map((o: any) => o.CueOutput.output_name)).toEqual([`${C}_0`, `${C}_1`]);
    });

    it('site 2: an output not in the mappings is replaced by the first audio option', () => {
      setUp();
      const cue = addCue('audio');
      component.projectUuid = PROJECT;
      component.onOutputSelectionChange([`${C}_gone`], cue);
      const outputs = editState.getComponentData('sequence', PROJECT).contents[0].Cue.outputs;
      expect(outputs.map((o: any) => o.CueOutput.output_name)).toEqual([`${C}_0`]);
    });

    it('site 2: no structure writes no outputs and warns', () => {
      setUp();
      const cue = addCue('audio');
      h.ws.receive(descriptorWithout('script:AudioCueOutputsType'));
      component.projectUuid = PROJECT;
      component.onOutputSelectionChange([`${C}_0`], cue);
      const saved = editState.getComponentData('sequence', PROJECT).contents[0].Cue;
      // moved: the template's own outputs -> none (findings F12)
      expect(saved.outputs).toEqual([]);
      expect(console.warn).toHaveBeenCalled();
    });

    it('site 3 (assignMultipleVideoOutputs, via onOutputSelectionChange): one cloned output per selection', () => {
      setUp();
      const cue = addCue('video');
      component.projectUuid = PROJECT;
      component.onOutputSelectionChange([`${C}_1`, `${C}_2`], cue);
      const outputs = editState.getComponentData('sequence', PROJECT).contents[0].Cue.outputs;
      expect(outputs.map((o: any) => o.CueOutput.output_name)).toEqual([`${C}_1`, `${C}_2`]);
      expect(outputs[0].CueOutput.output_geometry.x_scale).toBe(1);
    });

    it('site 3: no structure writes no outputs and warns', () => {
      setUp();
      const cue = addCue('video');
      h.ws.receive(descriptorWithout('script:VideoCueOutputsType'));
      component.projectUuid = PROJECT;
      component.onOutputSelectionChange([`${C}_0`], cue);
      // moved: the template's own outputs -> none (findings F12)
      expect(editState.getComponentData('sequence', PROJECT).contents[0].Cue.outputs).toEqual([]);
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
    it('getCueTypeKey / getCueData read Cue, ActionCue and FadeCue', () => {
      setUp();
      const frame = loadProject();
      const items = frame.value.CuemsScript.CueList.contents;
      // moved: per-type keys -> Cue, delta (c) (T040)
      expect(items.map((i: any) => component.getCueTypeKey(i)))
        .toEqual(['ActionCue', 'Cue', 'Cue', 'Cue']);
      expect(component.getCueData(items[2])).toEqual(items[2].Cue);
      expect(component.getCueTypeKey(null)).toBeNull();
      // moved: a Cue key was unknown (the defect) -> read (T040)
      expect(component.getCueTypeKey({ Cue: {} })).toBe('Cue');
      expect(component.getCueData({ Cue: {} })).toEqual({});
      expect(component.getCueTypeKey({ SomethingElse: {} })).toBeNull();
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

  // ── the port: behaviour with no characterization counterpart ──
  describe('a class this UI has no editor for (T045)', () => {
    function lightingProject() {
      const frame = loadFixture('template-as-script-013');
      const dmx = frame.value.CuemsScript.CueList.contents[2].Cue;
      dmx.class = 'lighting';   // input variation: the open vocabulary, on a recorded cue
      return frame;
    }

    it('is listed, typed `other` and identified by its class', () => {
      setUp();
      const frame = lightingProject();
      component.projectData = frame.value;
      any().loadProjectCues(frame.value);
      expect(component.cues.map(c => c.type)).toEqual(['audio', 'video', 'other', 'action', 'fade']);
      expect(component.cues[2].cue_class).toBe('lighting');
      expect(component.getCueMediaDuration(component.cues[2])).toBe('-');
      expect(component.shouldShowWarningIcon(component.cues[2])).toBeFalse();
    });

    it('survives a save unchanged', () => {
      setUp();
      const frame = lightingProject();
      const original = JSON.parse(JSON.stringify(frame.value.CuemsScript.CueList.contents[2]));
      component.projectData = frame.value;
      any().loadProjectCues(frame.value);
      expect(savedContents()![2]).toEqual(original);
    });

    it('keeps the common edits an operator makes, and nothing class-specific moves', () => {
      setUp();
      const frame = lightingProject();
      const original = frame.value.CuemsScript.CueList.contents[2].Cue;
      component.projectData = frame.value;
      any().loadProjectCues(frame.value);
      component.cues[2].name = 'Wash';
      component.cues[2].enabled = false;
      const saved = savedContents()![2].Cue;
      expect(saved.name).toBe('Wash');
      expect(saved.enabled).toBeFalse();
      expect(saved.class).toBe('lighting');
      expect(saved.DmxScene).toEqual(original.DmxScene);
      expect(saved.outputs).toEqual(original.outputs);
    });

    it('a duplicate carries its own id in what it writes back', () => {
      setUp();
      const frame = lightingProject();
      component.projectData = frame.value;
      any().loadProjectCues(frame.value);
      component.duplicateCue(2);
      const ids = savedContents()!.map(item => (item.Cue ?? item.ActionCue ?? item.FadeCue).id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(savedContents()![3].Cue.class).toBe('lighting');
    });
  });

  describe('a refused save (T049a)', () => {
    it('reaches the operator as the editor\'s own sentence, offending cue included', () => {
      setUp();
      const notifications = TestBed.inject(NotificationService);
      spyOn(notifications, 'showError');
      const refusal = loadFixture('project-save-refusals')['dangling action_target'];
      // WebsocketService's parse of this frame is pinned in websocket.service.spec.ts
      const message = '[T2] action_target_resolves at 00000000-0000-4000-8000-0000000000a4/action_target: ' +
        'action_target 11111111-1111-4111-8111-111111111111 does not resolve to a cue in this document';
      h.ws.receiveError({ action: 'project_save', message, raw: refusal });
      expect(notifications.showError).toHaveBeenCalledWith(message);
    });
  });
});
