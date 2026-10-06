"""Write the recorded pre-001 initial_template as a script.xml, the way the
pre-001 editor's project_new does (CuemsParser(data).parse() then
XmlReaderWriter.write_from_object). cuems-editor @ e099c92, cuemsutils 0.1.0rc14.

argv: <initial-template-pre001.json> <out script.xml>

Authored values, and only these (everything else is the recorded template):
- CuemsScript id / created / modified: assigned by project_new itself;
- each cue's id: null in the template, fixed uuids here (…a1 … …a5);
- ActionCue / FadeCue action_target: the template names a cue that does not
  exist (1f301cf8-…), which the tip library refuses to load; pointed at the
  AudioCue (…a1) instead.
"""
import json, sys
from cuemsutils.xml.XmlReaderWriter import XmlReaderWriter
from cuemsutils.xml.Parsers import CuemsParser
data = json.load(open(sys.argv[1]))['value']
ids = [f'00000000-0000-4000-8000-0000000000a{i}' for i in range(1, 6)]
for item, cue_id in zip(data['CuemsScript']['CueList']['contents'], ids):
    body = next(iter(item.values()))
    body['id'] = cue_id
    if 'action_target' in body:
        body['action_target'] = ids[0]
data['CuemsScript'].update(id='00000000-0000-4000-8000-0000000000aa', name='template as script',
                           description=None, created='2026-10-06T12:00:00', modified='2026-10-06T12:00:00')
obj = CuemsParser(data).parse()
XmlReaderWriter(schema_name='script', xmlfile=sys.argv[2]).write_from_object(obj)
print('written', sys.argv[2], file=sys.stderr)
