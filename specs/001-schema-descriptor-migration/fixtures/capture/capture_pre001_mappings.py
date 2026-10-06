"""Record the initial_mappings frame a deployed (pre-001) editor sends today.

argv: <conf dir> <out file> <nodeconf_available: true|false>
cuems-editor @ e099c92 (the last commit before any 001 src edit) on cuemsutils
0.1.0rc14 from the index: the pre-013 device shape (node.audio / node.video /
node.dmx, default_*_output scalars) with network-map status merged in.
Construction as evidence/mappings-capture/capture_mappings.py.
"""
import json, os, sys
conf, out, flag = sys.argv[1], sys.argv[2], sys.argv[3] == 'true'
os.environ['CUEMS_CONF_PATH'] = conf
import cuemsutils
from cuemseditor.cli import get_mappings
from cuemseditor.CuemsWsServer import CuemsWsServer
server = CuemsWsServer.__new__(CuemsWsServer)
server.nodeconf_available = lambda: flag   # /tmp/nodeconf.ipc is host state: pinned
server.mappings_dict = get_mappings()
ok = server.reload_network_map_nodes()
open(out, 'w').write(server.initial_setting_message())
print(json.dumps({'lib': cuemsutils.__version__, 'reload_ok': ok, 'mappings_type': type(server.mappings_dict).__name__}), file=sys.stderr)
