import { generateDate, generateSlug } from '../../../core/utils';
import { v4 as uuidv4 } from 'uuid';
import { ProjectTemplate, InitialMapping } from '../projects.service';

export interface CreateProjectParams {
  name: string;
  description: string;
}

export function safeCloneTemplate(template: ProjectTemplate | null): ProjectTemplate {
  if (!template) {
    throw new Error('No template available for project creation');
  }
  return JSON.parse(JSON.stringify(template));
}

export function prepareTemplateForNewProject(
  templateClone: ProjectTemplate,
  projectData: CreateProjectParams
): void {
  if (templateClone['CuemsScript'] && templateClone['CuemsScript']['CueList']) {
    templateClone['CuemsScript']['CueList']['contents'] = [];
    templateClone['CuemsScript']['CueList']['id'] = uuidv4();
  }

  if (templateClone['CuemsScript']) {
    templateClone['CuemsScript']['name'] = projectData.name;
    templateClone['CuemsScript']['description'] = projectData.description;
  }
}

/**
 * Create a new project using the template and custom data
 */
export function createProject(
  projectData: CreateProjectParams,
  projectTemplate: ProjectTemplate | null,
  initialMappings: InitialMapping[],
  sendMessage: (message: any) => void
): void {
  if (!projectTemplate) {
    console.error('No template available for project creation');
    return;
  }

  if (!initialMappings || initialMappings.length === 0) {
    console.error('No mappings available for project creation');
    return;
  }

  const projectUuid = uuidv4();
  const unix_name = generateSlug(projectData.name);
  const templateClone = safeCloneTemplate(projectTemplate);

  prepareTemplateForNewProject(templateClone, projectData);

  const { CuemsScript } = templateClone;
  console.log('Creating new project with data:', CuemsScript);

  templateClone['CuemsScript']['id'] = projectUuid;

  sendMessage({
    action: 'project_new',
    value: templateClone,
    unix_name
  });
}
