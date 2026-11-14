# #317 pty driver (Linux): pty-ci-drive.py <node> <bundle.js> <data-dir> <home-dir> <out.bin> <marker> <wait-seconds>
# Starts the built snote bundle on a pseudo-terminal (30 rows, 100 columns) with CI=true and CONTINUOUS_INTEGRATION=true
# in its environment, as a user's shell may have them, and waits up to <wait-seconds> for <marker> to reach the screen
# BEFORE any key is sent. Then it sends q, waits for the exit and writes every byte the terminal received to <out.bin>.
# Exit 0 when the marker was seen before the quit key, 3 when it was not (Ink's CI mode writes its frame only at exit),
# 4 when the pty could not be opened.
import fcntl, os, pty, select, signal, struct, sys, termios, time
node, bundle, data, home, out, marker, wait_s = sys.argv[1:8]
env = dict(os.environ, TERM='xterm-256color', HOME=home, XDG_DATA_HOME=home + '/xdg-data', XDG_STATE_HOME=home + '/xdg-state',
           XDG_CACHE_HOME=home + '/xdg-cache', XDG_CONFIG_HOME=home + '/xdg-config', SNOTE_UPDATE_CHECK='disabled', EDITOR='true',
           CI='true', CONTINUOUS_INTEGRATION='true')
env.pop('INK_SCREEN_READER', None)
env.pop('SNOTE_SCREEN_READER', None)
try:
    pid, fd = pty.fork()
except OSError:
    sys.exit(4)
if pid == 0:
    os.execvpe(node, [node, bundle, '--server', 'http://127.0.0.1:9', '--data-dir', data], env)
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
# Returns the moment the marker shows; the bound only matters when the frame never comes.
seen = pump(float(wait_s), marker.encode())
os.write(fd, b'q')
pump(3.0, b'\x00never')
try:
    wp, _ = os.waitpid(pid, os.WNOHANG)
    if wp == 0:
        os.kill(pid, signal.SIGKILL); os.waitpid(pid, 0)
except ChildProcessError:
    pass
open(out, 'wb').write(bytes(raw))
sys.exit(0 if seen else 3)
