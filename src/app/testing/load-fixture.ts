/**
 * Recorded wire payloads for the characterization and port specs.
 *
 * Every file comes from a real cuems-editor run or the editor's own evidence
 * directory; provenance is in the fixtures README. No spec inlines a payload
 * literal: it loads one of these, so a test can only ever be fed a frame the
 * editor actually sent.
 *
 * Each call returns a fresh deep copy, so a test that mutates its input can
 * never leak into the next one.
 */
import projectPre001 from '../../../specs/001-schema-descriptor-migration/fixtures/project-pre001.frame.json';
import project013 from '../../../specs/001-schema-descriptor-migration/fixtures/project-013.frame.json';
import templateAsScript013 from '../../../specs/001-schema-descriptor-migration/fixtures/template-as-script-013.frame.json';
import projectSaveRefusals from '../../../specs/001-schema-descriptor-migration/fixtures/project-save-refusals.json';
import loadRepaired from '../../../specs/001-schema-descriptor-migration/fixtures/load-repaired.frame.json';
import loadFailed from '../../../specs/001-schema-descriptor-migration/fixtures/load-failed.frame.json';
import configLoad from '../../../specs/001-schema-descriptor-migration/fixtures/config-load.frames.json';
import repairGateMediaOnly from '../../../specs/001-schema-descriptor-migration/fixtures/repair-gate-media-only.frames.json';
import project013LoadReport from '../../../specs/001-schema-descriptor-migration/fixtures/project-013.load-report.frame.json';
import initialTemplatePre001 from '../../../specs/001-schema-descriptor-migration/fixtures/initial-template-pre001.json';
import initialMappingsPre001 from '../../../specs/001-schema-descriptor-migration/fixtures/initial-mappings-pre001.frame.json';
import initialMappings013 from '../../../specs/001-schema-descriptor-migration/fixtures/initial-mappings-013.json';
import initialMappingsTip from '../../../specs/001-schema-descriptor-migration/fixtures/initial-mappings-tip.frame.json';
import nodeList from '../../../specs/001-schema-descriptor-migration/fixtures/node-list.frame.json';
import descriptorScript from '../../../specs/001-schema-descriptor-migration/fixtures/schema-descriptor-script.json';
import descriptorSettings from '../../../specs/001-schema-descriptor-migration/fixtures/schema-descriptor-settings.json';
import descriptorProjectSettings from '../../../specs/001-schema-descriptor-migration/fixtures/schema-descriptor-project_settings.json';
import descriptorProjectMappings from '../../../specs/001-schema-descriptor-migration/fixtures/schema-descriptor-project_mappings.json';

const FIXTURES = {
  /** today's wire: cuems-editor before 001, cuemsutils 0.1.0rc14 */
  'project-pre001': projectPre001,
  'initial-template-pre001': initialTemplatePre001,
  'initial-mappings-pre001': initialMappingsPre001,
  /** the merged pre-001 frame on the 013 library: device shape only, never a node_list */
  'initial-mappings-013': initialMappings013,
  /** the editor tip (payload version 1) */
  'project-013': project013,
  'project-013-load-report': project013LoadReport,
  /** after cuems-editor 002: config_load replies (keyed by case) and a media-only repair gate run (steps) */
  'config-load': configLoad,
  'repair-gate-media-only': repairGateMediaOnly,
  /** document_load_report, outcome repaired; and document_load_failed */
  'load-repaired': loadRepaired,
  'load-failed': loadFailed,
  /** project_save error frames, keyed by the refused change */
  'project-save-refusals': projectSaveRefusals,
  /** the recorded pre-001 template as a project document on the tip wire */
  'template-as-script-013': templateAsScript013,
  'initial-mappings-tip': initialMappingsTip,
  'node-list': nodeList,
  'schema-descriptor-script': descriptorScript,
  'schema-descriptor-settings': descriptorSettings,
  'schema-descriptor-project_settings': descriptorProjectSettings,
  'schema-descriptor-project_mappings': descriptorProjectMappings,
} as const;

export type FixtureName = keyof typeof FIXTURES;

/** The whole recorded frame, `{type, value}`. */
export function loadFixture(name: FixtureName): any {
  return JSON.parse(JSON.stringify(FIXTURES[name]));
}
