"""Record document_load_report (repaired) and document_load_failed from the tip library.

argv: <template_013.xml> <out dir>
Each variant is the template-as-script document with ONE change, loaded as
CuemsDBProject.open does (CuemsScript.load_with_report; a ValidationError is
DocumentLoadFailed) and rendered with the editor's own load_report_value /
load_failed_value:
- repaired: the audio cue's <target/> names a cue that does not exist
  (the library repairs a dangling target on load);
- failed:   the ActionCue's action_target names a cue that does not exist
  (the library refuses it: unrepairable).
report_id / project_uuid are fixed placeholders; `document` is the temp path.
"""
import json, os, sys, tempfile
from cuemsutils.cues.CuemsScript import CuemsScript
from cuemsutils.errors import ValidationError
from cuemseditor.CuemsErrors import DocumentLoadFailed
from cuemseditor.CuemsWsUser import load_failed_value, load_report_value
src, out = sys.argv[1], sys.argv[2]
xml = open(src).read()
DANGLING = '11111111-1111-4111-8111-111111111111'
PROJECT = '00000000-0000-4000-8000-0000000000aa'
audio_target = '<id>00000000-0000-4000-8000-0000000000a1</id><loop>1</loop><name>empty</name><offset><CTimecode>00:00:00.000</CTimecode></offset><post_go>pause</post_go><postwait><CTimecode>00:00:00.000</CTimecode></postwait><prewait><CTimecode>00:00:00.000</CTimecode></prewait><target />'
assert xml.count(audio_target) == 1
action_target = '<action_target>00000000-0000-4000-8000-0000000000a1</action_target><action_type>play</action_type>'
assert xml.count(action_target) == 1
variants = {
    'repaired': xml.replace(audio_target, audio_target.replace('<target />', f'<target>{DANGLING}</target>')),
    'failed': xml.replace(action_target, action_target.replace('00000000-0000-4000-8000-0000000000a1', DANGLING)),
}
for name, text in variants.items():
    path = os.path.join(tempfile.mkdtemp(), 'script.xml')
    open(path, 'w').write(text)
    try:
        _script, report = CuemsScript.load_with_report(path)
        frame = {'type': 'document_load_report',
                 'value': load_report_value('00000000-0000-4000-8000-0000000000r2', PROJECT, report)}
    except ValidationError as e:
        frame = {'type': 'document_load_failed', 'value': load_failed_value(PROJECT, DocumentLoadFailed(path, e))}
    open(os.path.join(out, f'load-{name}.frame.json'), 'w').write(json.dumps(frame))
    print(name, frame['type'], json.dumps(frame['value'])[:400])
