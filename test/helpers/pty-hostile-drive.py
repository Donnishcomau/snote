# #217 pty driver (Linux): pty-hostile-drive.py <node> <bundle.js> <data-dir> <home-dir> <out.bin> <mode> <marker> <paste.bin> [<inject.mjs> <payload.bin>]
# Starts the built snote bundle on a pseudo-terminal (30 rows, 100 columns; mode `sr` sets SNOTE_SCREEN_READER=1,
# the only switch for screen-reader mode since #17; every mode removes INK_SCREEN_READER and any inherited
# SNOTE_SCREEN_READER first, so the normal run is never in screen-reader mode by accident). With <inject.mjs> and
# <payload.bin> the bundle is started with `node --import <inject.mjs>` and, once the marker is on the screen, the
# driver sends SIGUSR2 so the preload writes the payload straight to process.stdout (#414, layer 2). Waits until <marker> is on the screen, opens the editor on the selected note and
# pastes the hostile corpus in small pieces (split writes), leaves the editor, quits, and writes every byte the
# terminal received to <out.bin>. Exit 0 when the marker was seen, 3 when it was not or nothing was captured,
# 4 when the pty could not be opened.
import fcntl, os, pty, select, signal, struct, sys, termios, time
node, bundle, data, home, out, mode, marker, paste_file = sys.argv[1:9]
inject, payload = (sys.argv[9], sys.argv[10]) if len(sys.argv) >= 11 else (None, None)
env = dict(os.environ, TERM='xterm-256color', HOME=home, XDG_DATA_HOME=home + '/xdg-data', XDG_STATE_HOME=home + '/xdg-state',
           XDG_CACHE_HOME=home + '/xdg-cache', XDG_CONFIG_HOME=home + '/xdg-config', SNOTE_UPDATE_CHECK='disabled', EDITOR='true')
env.pop('INK_SCREEN_READER', None)
env.pop('SNOTE_SCREEN_READER', None)
# #311: a user's terminal, not CI. Ink reads CI and CONTINUOUS_INTEGRATION (is-in-ci) and then draws no frame until
# unmount, so on a CI runner only snote's bracketed-paste enable reached the pty (8 bytes) and the marker never showed.
env.pop('CI', None)
env.pop('CONTINUOUS_INTEGRATION', None)
if mode == 'sr':
    env['SNOTE_SCREEN_READER'] = '1'
if payload is not None:
    env['SNOTE_PTY_PAYLOAD'] = payload
try:
    pid, fd = pty.fork()
except OSError:
    sys.exit(4)
if pid == 0:
    pre = ['--import', inject] if inject else []
    os.execvpe(node, [node] + pre + [bundle, '--server', 'http://127.0.0.1:9', '--data-dir', data], env)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 30, 100, 0, 0))
raw = bytearray()
def pump(sec, until=None):
    end = time.time() + sec
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.03)
        if r:
            try:
                d = os.read(fd, 65536)
            except OSError:
                return False
            if not d:
                return False
            raw.extend(d)
        if until is not None and until in raw:
            return True
    return until is None
def w(b):
    os.write(fd, b)
# Returns the moment the marker shows; the bound only matters on a slow or loaded machine (CI load, 15 s was too short).
MARKER_WAIT_MAX = 60
seen = pump(MARKER_WAIT_MAX, marker.encode())
if not seen:
    sys.stderr.write('pty-hostile-drive: marker not seen within %d s (captured %d bytes)\n' % (MARKER_WAIT_MAX, len(raw)))
pump(0.5)
if seen and inject:
    os.kill(pid, signal.SIGUSR2); pump(0.5)
if seen:
    paste = open(paste_file, 'rb').read()
    w(b'i'); pump(1.0)
    w(b'\x1b[200~')
    for i in range(0, len(paste), 5):
        w(paste[i:i + 5]); pump(0.01)
    w(b'\x1b[201~'); pump(1.0)
    w(b'\x1b'); pump(0.5)
    w(b'\x1b'); pump(0.3)
    w(b'q'); pump(1.5)
try:
    wp, _ = os.waitpid(pid, os.WNOHANG)
    if wp == 0:
        os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0)
except ChildProcessError:
    pass
pump(0.2)
open(out, 'wb').write(bytes(raw))
sys.exit(0 if seen and len(raw) > 0 else 3)
