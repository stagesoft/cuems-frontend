"""Record cuems-editor 002 frames the frontend consumes, from the editor's own handlers.

argv: <editor checkout> <out dir>
Harness as the editor's tests/test_document_load_report.py and
tests/test_config_round_trip.py build it: the real CuemsWsUser / CuemsDBProject
against a temporary library; only the server around them is a stub.

- config-load.frames.json: config_load for settings; project_mappings before and
  after its mappings.xml exists (the editor's tests/fixtures/conf default_mappings.xml
  copied in as the project's file); project_settings, refused (cuems-editor UR-7, G2);
  settings again with a pre-013 settings.xml from cuems-utils' corpus: config_load_failed.
- repair-gate-media-only.frames.json: script_minimal_013.xml saved by the library
  (clean) whose library row for file.ext disagrees on duration (00:01:00.000 vs
  00:00:00.000): outcome clean, media_repairs, acknowledgment_required. Steps: open;
  save (refused); a reconnect with a NEW session_id: save (refused, same report_id),
  acknowledge (echo, FR-008), save (accepted).
"""
import asyncio, concurrent.futures, json, os, shutil, sys, tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
editor, out = Path(sys.argv[1]), Path(sys.argv[2])
tmp = Path(tempfile.mkdtemp())

# ---- config_load (as tests/test_config_round_trip.py) --------------------
conf = tmp / 'conf'; shutil.copytree(editor / 'tests' / 'fixtures' / 'conf', conf)
library = tmp / 'library'; (library / 'projects' / 'test_project').mkdir(parents=True)
s = conf / 'settings.xml'
s.write_text(s.read_text().replace('<library_path>/opt/cuems_library</library_path>', f'<library_path>{library}</library_path>'))
os.environ['CUEMS_CONF_PATH'] = str(conf)

from cuemseditor.CuemsWsUser import CuemsWsUser
from cuemseditor.cli import get_settings
from cuemseditor.CuemsDBModel import Media, Project, ProjectMedia, database
from cuemseditor.CuemsDBProject import CuemsDBProject
from cuemsutils.cues import CuemsScript
from cuemsutils.helpers import new_datetime, new_uuid

def stub_server():
    srv = MagicMock(); srv.users = {}; srv.sessions = {}; srv.repair_gates = {}; srv.file_locks = {}
    srv.event_loop = asyncio.new_event_loop()
    srv.executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    srv.notify_others_config_changed = AsyncMock(); srv.notify_all_node_list_update = AsyncMock()
    srv.notify_others_list_changes = AsyncMock(); srv.notify_others_same_project = AsyncMock()
    return srv

def drain(sess):
    o = []
    while not sess.outgoing.empty(): o.append(json.loads(sess.outgoing.get_nowait()))
    return o

def run(srv, coro): srv.event_loop.run_until_complete(coro)

PROJ = 'c0ffee00-0000-4000-8000-000000000002'
srv = stub_server(); srv.db.project.get_project_unix_name = MagicMock(return_value='test_project')
u = CuemsWsUser(srv, MagicMock()); u.session_id = 'capture'; srv.users[u] = None
cfg = {}
def load(name, value):
    run(srv, u.config_load(value, 'config_load')); cfg[name] = drain(u)
load('settings', {'schema': 'settings'})
load('project_mappings, no file yet', {'schema': 'project_mappings', 'project_uuid': PROJ})
shutil.copy(conf / 'default_mappings.xml', library / 'projects' / 'test_project' / 'mappings.xml')
load('project_mappings', {'schema': 'project_mappings', 'project_uuid': PROJ})
load('project_settings (gate G2)', {'schema': 'project_settings', 'project_uuid': PROJ})
# a settings.xml the library refuses (pre-013 device shape), as the editor's
# test_a_pre_013_settings_is_config_load_failed sets it up
shutil.copy(editor.parent / 'cuems-utils' / 'tests' / 'data' / 'corpus' / 'pre-013' / 'settings.xml', conf / 'settings.xml')
load('settings, pre-013 file (library refuses)', {'schema': 'settings'})
(out / 'config-load.frames.json').write_text(json.dumps(cfg, indent=1))
srv.executor.shutdown(); srv.event_loop.close()

# ---- repair gate, media only (as tests/test_document_load_report.py) ----
root = tmp / 'lib2'
for sub in ('media', 'trash/projects', 'trash/media', 'tmp', 'projects/minimal'): (root / sub).mkdir(parents=True, exist_ok=True)
SCRIPT_ID = 'ddba3000-7894-4a60-a6c1-e73b9bbed8c0'
script, _ = CuemsScript.load_with_report(str(editor / 'tests' / 'fixtures' / 'script_minimal_013.xml'))
script.save(str(root / 'projects' / 'minimal' / 'script.xml'))
database.init(str(root / 'project-manager.db')); database.connect()
database.create_tables([Project, Media, ProjectMedia], safe=True)
Project.create(uuid=SCRIPT_ID, name='Test Script', unix_name='minimal', created=new_datetime(), modified=new_datetime(), in_trash=False)
Media.create(uuid=str(new_uuid()), name='file.ext', unix_name='file.ext', created=new_datetime(), modified=new_datetime(),
             duration='00:01:00.000', media_type='AUDIO', in_trash=False)          # disagrees with the script
Media.create(uuid=str(new_uuid()), name='file_video.ext', unix_name='file_video.ext', created=new_datetime(), modified=new_datetime(),
             duration='00:00:00.000', media_type='AUDIO', in_trash=False)          # agrees
settings = get_settings(); settings['library_path'] = str(root); settings['tmp_path'] = str(root / 'tmp')
srv = stub_server(); srv.db.project = CuemsDBProject(settings, database)
def session(sid):
    sess = CuemsWsUser(srv, MagicMock()); sess.session_id = sid; srv.sessions[sid] = {'ws': id(sess.websocket)}; return sess
steps = []
a = session('11111111-1111-4111-8111-111111111111')
run(srv, a.send_project(SCRIPT_ID, 'project_load')); frames = drain(a)
steps.append({'step': 'open', 'frames': frames})
project = next(f for f in frames if f['type'] == 'project')['value']
report = next(f for f in frames if f['type'] == 'document_load_report')['value']
def save(sess):
    run(srv, sess.received_project(json.loads(json.dumps({'CuemsScript': project['CuemsScript']})), 'project_save')); return drain(sess)
steps.append({'step': 'save before acknowledging', 'frames': save(a)})
# a reconnect with a NEW session_id, before anyone acknowledged
b = session('22222222-2222-4222-8222-222222222222')
steps.append({'step': 'reconnected with a new session_id: save', 'frames': save(b)})
run(srv, b.repair_acknowledge({'project_uuid': report['project_uuid'], 'report_id': report['report_id']}, 'repair_acknowledge'))
steps.append({'step': 'reconnected with a new session_id: acknowledge (FR-008)', 'frames': drain(b)})
steps.append({'step': 'reconnected with a new session_id: save after acknowledging', 'frames': save(b)})
(out / 'repair-gate-media-only.frames.json').write_text(json.dumps(steps, indent=1))
for st in steps: print(st['step'], '->', [f['type'] + ('/' + f['value'].get('reason', '') if isinstance(f.get('value'), dict) and 'reason' in f['value'] else '') for f in st['frames']])
print('config_load ->', {k: [f['type'] for f in v] for k, v in cfg.items()})
