import { generateSlug } from '../../../core/utils';
import { v4 as uuidv4 } from 'uuid';
import { InitialMapping } from '../projects.service';
import { SCRIPT_TYPES, SchemaDescriptor, toWireShape } from './schema-descriptor.handler';

export interface CreateProjectParams {
  name: string;
  description: string;
}

const ZERO_TC = '00:00:00.000';

/**
 * An empty CueList built from the script descriptor: no contents, a fresh
 * id, and zero offsets — the timecodes are the caller's, since the
 * descriptor's CTimecode has no default.
 */
export function newCueListFromDescriptor(descriptor: SchemaDescriptor): any {
  const cueList = toWireShape(descriptor, SCRIPT_TYPES.cueList);
  cueList.id = uuidv4();
  cueList.offset = { CTimecode: ZERO_TC };
  cueList.prewait = { CTimecode: ZERO_TC };
  cueList.postwait = { CTimecode: ZERO_TC };
  cueList.contents = [];
  return cueList;
}

/**
 * A new project's script, built from the schema descriptor (it replaces the
 * retired `initial_template`). `created` / `modified` are the editor's:
 * `project_new` assigns them.
 */
export function newScriptFromDescriptor(
  descriptor: SchemaDescriptor,
  projectData: CreateProjectParams
): { CuemsScript: any } {
  const script = toWireShape(descriptor, SCRIPT_TYPES.script);
  script.CueList = newCueListFromDescriptor(descriptor);
  script.name = projectData.name;
  script.description = projectData.description;
  return { CuemsScript: script };
}

/**
 * Create a new project from the script descriptor and custom data.
 */
export function createProject(
  projectData: CreateProjectParams,
  descriptor: SchemaDescriptor | null,
  initialMappings: InitialMapping[],
  sendMessage: (message: any) => void
): void {
  if (!descriptor) {
    console.error('No schema descriptor available for project creation');
    return;
  }

  if (!initialMappings || initialMappings.length === 0) {
    console.error('No mappings available for project creation');
    return;
  }

  const unix_name = generateSlug(projectData.name);
  const script = newScriptFromDescriptor(descriptor, projectData);
  script.CuemsScript.id = uuidv4();

  sendMessage({
    action: 'project_new',
    value: script,
    unix_name
  });
}
