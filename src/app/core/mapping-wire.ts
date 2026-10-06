/**
 * How the output mapping document sits on the wire since cuems-utils 013
 * (research R3).
 *
 *   defaults[] = { "default": { "&": "<port>", "class": "audio", "direction": "output" } }
 *   nodes[]    = { "node": { uuid, mac, devices: [...] } }
 *   devices[]  = { "device": { "class": "audio"|"video"|"dmx"|"lighting"|…, outputs, inputs? } }
 *   outputs    = [ [ {"output": {id, name, mappings[], canvas_region?}}, … ] ]   <- a list OF LISTS
 *
 * `class` is open vocabulary — `lighting` is in the recorded payload — so a
 * class nobody asked for is simply not returned, never an error. A device may
 * carry no `inputs`, and a discovered-but-unadopted node carries no `devices`.
 */

/** A node's output wrappers (`{"output": {…}}`) of one device class, flattened. */
export function deviceOutputs(node: any, cls: string): any[] {
  const devices = node?.devices;
  if (!Array.isArray(devices)) return [];
  return devices
    .map((wrapper: any) => wrapper?.device)
    .filter((device: any) => device?.class === cls && Array.isArray(device.outputs))
    .flatMap((device: any) => device.outputs.flatMap((group: any) => (Array.isArray(group) ? group : [])))
    .filter((output: any) => output?.output);
}

/**
 * The default port text for a class and direction, from `defaults[]`, or null.
 * An empty default carries no `"&"`: it yields no default, and nothing is
 * invented in its place.
 */
export function defaultPort(defaults: any, cls: string, direction: 'input' | 'output'): string | null {
  if (!Array.isArray(defaults)) return null;
  const match = defaults
    .map((wrapper: any) => wrapper?.default)
    .find((d: any) => d?.class === cls && d?.direction === direction);
  const port = match?.['&'];
  return typeof port === 'string' && port.length > 0 ? port : null;
}
