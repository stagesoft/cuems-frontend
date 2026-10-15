import { Injectable, inject, signal } from '@angular/core';
import { WebsocketService } from '../../websocket.service';
import { PayloadVersionService, PrerequisiteState, SessionPrerequisite } from '../../../core/payload-version.service';

/**
 * The library's schema descriptor, as cuems-editor serves it
 * (`{"action": "schema_descriptor", "value": <schema name>}`).
 *
 * It replaces the retired `initial_template`: a new cue, a new output and a
 * new project are built from it. For `script` it is a hard prerequisite of
 * the project domain (FR-034a) — there is no local fallback and no cached
 * copy. The read-only config views ask for their own schemas on entry.
 *
 * Note: a field's `default` is null when the default is a factory OR absent.
 * Null does not mean "no default".
 */
export type SchemaName =
  | 'script' | 'settings' | 'network_map' | 'project_mappings' | 'project_settings' | 'hardware_outputs';

export interface DescriptorField {
  name: string;
  xsd_type: string | null;
  required: boolean;
  repeated: boolean;
  order: number;
  kind: string;
  enum_values: unknown[] | null;
  default: unknown;
  repairability: unknown;
}

export interface DescriptorType {
  key: string;
  fields: DescriptorField[];
  instance: any;
}

export interface SchemaDescriptor {
  schema: string;
  types: DescriptorType[];
}

/** Descriptor type keys the project domain builds from. */
export const SCRIPT_TYPES = {
  script: 'script:/CuemsProject/CuemsScript',
  cueList: 'script:CueListType',
  audio: 'script:AudioCueType',
  video: 'script:VideoCueType',
  dmx: 'script:DmxCueType',
  action: 'script:ActionCueType',
  fade: 'script:FadeCueType',
  audioOutput: 'script:AudioCueOutputsType',
  videoOutput: 'script:VideoCueOutputsType',
  dmxOutput: 'script:DmxCueOutputsType',
} as const;

export function requestSchemaDescriptor(send: (message: any) => void, schema: SchemaName): void {
  send({ action: 'schema_descriptor', value: schema });
}

/** The frame's value as a descriptor, or null when it is not one. */
export function parseSchemaDescriptor(value: any): SchemaDescriptor | null {
  if (!value || typeof value.schema !== 'string' || !Array.isArray(value.types)) return null;
  const wellFormed = value.types.every((t: any) =>
    t && typeof t.key === 'string' && Array.isArray(t.fields) && 'instance' in t);
  return wellFormed ? value as SchemaDescriptor : null;
}

export function descriptorType(descriptor: SchemaDescriptor, key: string): DescriptorType | null {
  return descriptor.types.find(t => t.key === key) ?? null;
}

/**
 * A field's descriptor default. Throws DescriptorGapError when the type or
 * field is missing, or the default is null — for a call site that needs a
 * value, a null default is a gap to report, not a value to use (FR-034).
 */
export function descriptorDefault(descriptor: SchemaDescriptor | null, typeKey: string, field: string): unknown {
  const type = descriptor ? descriptorType(descriptor, typeKey) : null;
  const value = type?.fields.find(f => f.name === field)?.default;
  if (value === null || value === undefined) throw new DescriptorGapError(typeKey, field);
  return value;
}

/** A field whose problem is that the descriptor gives no usable value. */
export class DescriptorGapError extends Error {
  constructor(public readonly typeKey: string, public readonly field: string) {
    super(`schema descriptor has no value for ${typeKey}.${field}`);
  }
}

/**
 * A type's `instance`, as the library serves it, ready to fill in: a fresh
 * deep copy, with the one wire wrapper a type reached through a container
 * carries (`{"CueOutput": …}`, `{"CueList": …}`) peeled off. Nothing else is
 * done to it.
 *
 * Since cuems-utils 015 (gate G3, which closed UR-1) the instance is already in
 * `to_wire()` shape and every required leaf carries a value its type accepts,
 * including the starting values a new output needs (`output_vol` 80,
 * `channel_vol` 80, `x_scale`/`y_scale` 1, declared in `script.xsd` and seeded
 * by the library). So this UI hand-authors no value: what used to be
 * `toWireShape` and `UR1_UI_STARTING_VALUES` is gone.
 *
 * The peel is by shape, not by name: a single key that is not one of the
 * type's own fields is a wrapper. A document-body type (`CuemsScript`) is
 * served unwrapped, its keys are its fields, and is returned as it is.
 */
export function descriptorInstance(descriptor: SchemaDescriptor, typeKey: string): any {
  const type = descriptorType(descriptor, typeKey);
  if (!type) throw new DescriptorGapError(typeKey, '(type)');
  const instance = JSON.parse(JSON.stringify(type.instance));
  const keys = instance && typeof instance === 'object' && !Array.isArray(instance) ? Object.keys(instance) : [];
  if (keys.length === 1 && !type.fields.some(f => f.name === keys[0])) return instance[keys[0]];
  return instance;
}

/**
 * Required fields that stay empty in `descriptorInstance(typeKey)` and that a
 * call site does not fill itself. A non-empty answer is a descriptor gap the
 * UI must report rather than absorb (FR-034).
 */
export function unfilledRequired(descriptor: SchemaDescriptor, typeKey: string, filledByCaller: string[]): string[] {
  const type = descriptorType(descriptor, typeKey);
  if (!type) return ['(type)'];
  const shaped = descriptorInstance(descriptor, typeKey);
  return type.fields
    .filter(f => f.required && !filledByCaller.includes(f.name))
    .filter(f => !(f.name in shaped) || containsNull(shaped[f.name]))
    .map(f => f.name);
}

function containsNull(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsNull);
  if (typeof value === 'object') return Object.values(value as object).some(containsNull);
  return false;
}

/**
 * What the project domain needs from the script descriptor, and what each
 * call site fills in itself (ids, names, timecodes, targets, media, outputs).
 * Anything else left empty is a gap.
 */
const SCRIPT_REQUIREMENTS: Array<{ key: string; filledByCaller: string[] }> = [
  { key: SCRIPT_TYPES.script, filledByCaller: ['id', 'name', 'description', 'created', 'modified', 'CueList'] },
  { key: SCRIPT_TYPES.cueList, filledByCaller: ['id', 'description', 'offset', 'prewait', 'postwait', 'target', 'contents'] },
  ...(['audio', 'video'] as const).map(kind => ({ key: SCRIPT_TYPES[kind],
    filledByCaller: ['id', 'description', 'offset', 'prewait', 'postwait', 'target', 'Media', 'outputs'] })),
  { key: SCRIPT_TYPES.dmx, filledByCaller: ['id', 'description', 'offset', 'prewait', 'postwait', 'target', 'outputs'] },
  { key: SCRIPT_TYPES.action, filledByCaller: ['id', 'description', 'offset', 'prewait', 'postwait', 'target', 'action_target'] },
  { key: SCRIPT_TYPES.fade, filledByCaller: ['id', 'description', 'offset', 'prewait', 'postwait', 'target', 'action_target', 'duration'] },
  { key: SCRIPT_TYPES.audioOutput, filledByCaller: ['output_name'] },
  { key: SCRIPT_TYPES.videoOutput, filledByCaller: ['output_name'] },
  { key: SCRIPT_TYPES.dmxOutput, filledByCaller: ['output_name'] },
];

/** Every gap in a script descriptor, as `TypeKey.field`. Empty means usable. */
export function scriptDescriptorGaps(descriptor: SchemaDescriptor): string[] {
  return SCRIPT_REQUIREMENTS.flatMap(({ key, filledByCaller }) => {
    try {
      return unfilledRequired(descriptor, key, filledByCaller).map(field => `${key}.${field}`);
    } catch {
      return [`${key}.(type)`];
    }
  });
}

/** How long the script descriptor may stay unanswered before the gate refuses. */
export const DESCRIPTOR_TIMEOUT_MS = 10000;

/**
 * Holds the descriptors received this session, keyed by schema name, and is
 * the `schema_descriptor` prerequisite of the session gate.
 */
@Injectable({ providedIn: 'root' })
export class SchemaDescriptorService {
  private ws = inject(WebsocketService);
  private gate = inject(PayloadVersionService);

  readonly descriptors = signal<Partial<Record<string, SchemaDescriptor>>>({});

  private readonly scriptState = signal<PrerequisiteState>({ status: 'pending' });
  private timeout: ReturnType<typeof setTimeout> | null = null;

  readonly prerequisite: SessionPrerequisite = {
    name: 'schema_descriptor',
    state: this.scriptState.asReadonly(),
    start: () => {
      this.clearTimeout();
      this.timeout = setTimeout(() => this.fail('descriptor_unanswered'), DESCRIPTOR_TIMEOUT_MS);
      this.request('script');
    },
    reset: () => {
      this.clearTimeout();
      this.scriptState.set({ status: 'pending' });
      // descriptors belong to a connection: a reconnect may be a different editor
      this.descriptors.set({});
    },
  };

  constructor() {
    this.ws.messages.subscribe(frame => {
      if (frame?.type === 'schema_descriptor') this.onDescriptor(frame.value);
    });
    this.ws.errors.subscribe(error => {
      if (error?.action === 'schema_descriptor' && this.scriptState().status === 'pending') {
        this.fail('descriptor_refused', { message: error.message });
      }
    });
    this.gate.register(this.prerequisite);
  }

  request(schema: SchemaName): void {
    requestSchemaDescriptor(message => this.ws.wsEmit(message), schema);
  }

  descriptor(schema: SchemaName): SchemaDescriptor | null {
    return this.descriptors()[schema] ?? null;
  }

  /** The script descriptor; the gate guarantees it once the project domain renders. */
  script(): SchemaDescriptor | null {
    return this.descriptor('script');
  }

  private onDescriptor(value: any): void {
    const descriptor = parseSchemaDescriptor(value);
    if (!descriptor) {
      if (value?.schema === 'script' || value?.schema === undefined) this.fail('descriptor_unusable', { gaps: ['(frame)'] });
      return;
    }
    this.descriptors.update(all => ({ ...all, [descriptor.schema]: descriptor }));
    if (descriptor.schema !== 'script') return;

    const gaps = scriptDescriptorGaps(descriptor);
    this.clearTimeout();
    if (gaps.length > 0) {
      this.fail('descriptor_unusable', { gaps });
    } else {
      this.scriptState.set({ status: 'met' });
      this.gate.notifyResolved();
    }
  }

  private fail(reason: string, detail?: Record<string, unknown>): void {
    this.clearTimeout();
    this.scriptState.set({ status: 'failed', reason, detail });
  }

  private clearTimeout(): void {
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}
