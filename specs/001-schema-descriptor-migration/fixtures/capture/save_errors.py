"""What the editor's project_save error frame says, for refusals the UI can cause.
Mirrors CuemsWsUser.received_project: notify_error_to_user(str(type(e)) + str(e)).
argv: <template-as-script-013.frame.json>"""
import json, sys, copy, tempfile, os
from cuemsutils.cues.CuemsScript import CuemsScript
from cuemseditor.CuemsDBProject import validate_fade_durations_in_contents
base = json.load(open(sys.argv[1]))['value']
def attempt(name, data):
    try:
        validate_fade_durations_in_contents((data.get('CuemsScript', {}).get('CueList') or {}).get('contents') or [])
        CuemsScript.from_json(data).save(os.path.join(tempfile.mkdtemp(), 's.xml'))
        print(json.dumps({'case': name, 'ok': True}))
    except Exception as e:
        print(json.dumps({'case': name, 'ok': False, 'value': str(type(e)) + str(e)}))
attempt('as loaded', copy.deepcopy(base))
d = copy.deepcopy(base); d['uuid'] = d['CuemsScript']['id']; attempt('top-level uuid beside CuemsScript', d)
d = copy.deepcopy(base); d['CuemsScript']['CueList']['contents'][3]['ActionCue']['action_target'] = None; attempt('action cue without target', d)
d = copy.deepcopy(base); d['CuemsScript']['CueList']['contents'][3]['ActionCue']['action_target'] = '11111111-1111-4111-8111-111111111111'; attempt('dangling action_target', d)
d = copy.deepcopy(base); d['CuemsScript']['CueList']['contents'][4]['FadeCue']['duration'] = {'CTimecode': '00:00:00.000'}; attempt('zero fade duration', d)
