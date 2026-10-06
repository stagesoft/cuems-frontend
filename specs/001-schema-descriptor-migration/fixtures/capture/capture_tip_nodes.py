"""Record the editor tip's initial_mappings and node_list frames.

argv: <conf dir> <out dir> <nodeconf_available: true|false>
Same construction as cuems-editor evidence/mappings-capture/capture_mappings.py
(server via __new__, mappings from cli.get_mappings(), reload_network_map_nodes()),
at the editor tip, where initial_mappings is the mapping document alone and the
node arrays plus nodeconf_available ride node_list.
"""
import json, os, sys
conf, out, flag = sys.argv[1], sys.argv[2], sys.argv[3] == 'true'
os.environ['CUEMS_CONF_PATH'] = conf
from cuemseditor.cli import get_mappings
from cuemseditor.CuemsWsServer import CuemsWsServer
server = CuemsWsServer.__new__(CuemsWsServer)
server.mappings_dict = get_mappings()
ok = server.reload_network_map_nodes()
server.nodeconf_available = lambda: flag   # /tmp/nodeconf.ipc is host state: pinned, see README
open(os.path.join(out, 'initial-mappings-tip.frame.json'), 'w').write(server.initial_setting_message())
open(os.path.join(out, 'node-list.frame.json'), 'w').write(server.node_list_message())
print(json.dumps({'reload_ok': ok, 'nodeconf_available_pinned': flag}), file=sys.stderr)
