"""Capture the editor tip's wire frames exactly as CuemsWsUser serialises them.

argv: <script.xml fixture> <out dir>
Writes project-013.frame.json, project-013.load-report.frame.json,
schema-descriptor-<name>.json for script/settings/project_settings/project_mappings,
and capture-meta.json.
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile
import cuemsutils, cuemseditor
from cuemsutils.cues.CuemsScript import CuemsScript
from cuemsutils.tools.ConfigManager import ConfigManager, SchemaName
from cuemseditor.CuemsWsUser import load_report_value, schema_descriptor_value

fixture, out = sys.argv[1], sys.argv[2]
tmp = tempfile.mkdtemp()
dst = os.path.join(tmp, 'script.xml')
shutil.copy(fixture, dst)
before = hashlib.sha256(open(dst, 'rb').read()).hexdigest()
# CuemsDBProject.open: CuemsScript.load_with_report(path) -> script.to_wire(), report
script, report = CuemsScript.load_with_report(dst)
after = hashlib.sha256(open(dst, 'rb').read()).hexdigest()
open(os.path.join(out, 'project-013.frame.json'), 'w').write(
    json.dumps({"type": "project", "value": script.to_wire()}))
# send_project: report_id is a fresh uuid per load; pinned here so the fixture is stable
open(os.path.join(out, 'project-013.load-report.frame.json'), 'w').write(json.dumps({
    "type": "document_load_report",
    "value": load_report_value('00000000-0000-4000-8000-000000000001',
                               '00000000-0000-4000-8000-000000000002', report)}))
for name in ('script', 'settings', 'project_settings', 'project_mappings'):
    sn = SchemaName(name)
    types = ConfigManager(load_all=False).get_schema_descriptor(sn)
    open(os.path.join(out, f'schema-descriptor-{name}.json'), 'w').write(json.dumps(
        {"type": "schema_descriptor", "value": schema_descriptor_value(sn.value, types)}))

def head(path):
    r = lambda *a: subprocess.run(['git', '-C', path, *a], capture_output=True, text=True).stdout.strip()
    return {"sha": r('rev-parse', 'HEAD'), "subject": r('log', '-1', '--format=%s'), "dirty": bool(r('status', '--porcelain'))}

json.dump({
    "captured_with": "capture_tip.py (this directory), mirroring cuems-editor CuemsDBProject.open + CuemsWsUser.send_project / schema_descriptor",
    "fixture": os.path.basename(fixture),
    "fixture_sha256_before": before, "fixture_sha256_after": after,
    "cuemsutils": {"version": cuemsutils.__version__, **head(os.path.dirname(os.path.dirname(os.path.dirname(cuemsutils.__file__))))},
    "cuems_editor": head(os.path.dirname(os.path.dirname(os.path.dirname(cuemseditor.__file__)))),
    "load_report_ids": "report_id/project_uuid are fixed placeholders; the editor mints a fresh uuid per load",
}, open(os.path.join(out, 'capture-meta.json'), 'w'), indent=2)
