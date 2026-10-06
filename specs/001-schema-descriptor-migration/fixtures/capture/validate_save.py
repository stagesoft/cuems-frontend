"""Run a UI save payload through the editor's save path and load it back.
argv: <payload.json>   (the `value` of a project_save)"""
import json, sys, os, tempfile
from cuemsutils.cues.CuemsScript import CuemsScript
from cuemseditor.CuemsDBProject import validate_fade_durations_in_contents
data = json.load(open(sys.argv[1]))
validate_fade_durations_in_contents((data.get('CuemsScript', {}).get('CueList') or {}).get('contents') or [])
p = os.path.join(tempfile.mkdtemp(), 'script.xml')
CuemsScript.from_json(data).save(p)
back, report = CuemsScript.load_with_report(p)
w = back.to_wire()
print('saved and reloaded; outcome', report.outcome if hasattr(report, 'outcome') else report)
for c in w['CuemsScript']['CueList']['contents']:
    k = list(c)[0]; b = c[k]
    print(' ', k, b.get('class', ''), b['name'], 'enabled', b['enabled'], 'master_vol', b.get('master_vol'),
          'outputs', [ (o['CueOutput']['output_name'][-12:], o['CueOutput'].get('canvas_region')) for o in (b.get('outputs') or [])])
