import { DescriptorField, DescriptorType, SchemaDescriptor } from '../../../services/projects/handlers/schema-descriptor.handler';

/** One field of a config document, as its schema describes it. */
export interface OutlineField {
  name: string;
  /** The schema type name, or null when the descriptor gives none. */
  type: string | null;
  required: boolean;
  repeated: boolean;
  enumValues: unknown[] | null;
  /** The schema default; `null` means a factory default OR none — not "no default". */
  defaultValue: unknown;
  /** Fields of a complex type, in schema order. */
  children: OutlineField[];
  /** The descriptor names a type for it that it does not describe, or none at all. */
  undescribed: boolean;
}

/** The document's root type: the shortest `schema:/…` key. */
export function rootType(descriptor: SchemaDescriptor): DescriptorType | null {
  return descriptor.types
    .filter(t => t.key.startsWith(`${descriptor.schema}:/`))
    .sort((a, b) => a.key.length - b.key.length)[0] ?? null;
}

/**
 * The document's fields as a tree, from the descriptor alone — no
 * hand-maintained form (FR-080). A field's type is the named type when the
 * descriptor has it, else the anonymous type at `<parent key>/<field>`; a
 * named type the descriptor does not describe is a simple value. A field with
 * no type at all is marked undescribed rather than guessed.
 */
export function documentOutline(descriptor: SchemaDescriptor): OutlineField[] {
  const root = rootType(descriptor);
  return root ? fieldsOf(descriptor, root, new Set([root.key])) : [];
}

function fieldsOf(descriptor: SchemaDescriptor, type: DescriptorType, seen: Set<string>): OutlineField[] {
  return [...type.fields]
    .filter(f => f.kind !== 'wildcard')
    .sort((a, b) => a.order - b.order)
    .map(field => outlineField(descriptor, type, field, seen));
}

function outlineField(descriptor: SchemaDescriptor, parent: DescriptorType, field: DescriptorField, seen: Set<string>): OutlineField {
  const named = field.xsd_type ? descriptor.types.find(t => t.key === `${descriptor.schema}:${field.xsd_type}`) : undefined;
  const anonymous = descriptor.types.find(t => t.key === `${parent.key}/${field.name}`);
  const complex = named ?? anonymous ?? null;
  const children = complex && !seen.has(complex.key)
    ? fieldsOf(descriptor, complex, new Set([...seen, complex.key]))
    : [];
  return {
    name: field.name,
    type: field.xsd_type,
    required: field.required,
    repeated: field.repeated,
    enumValues: field.enum_values,
    defaultValue: field.default,
    children,
    undescribed: !field.xsd_type && !anonymous,
  };
}
