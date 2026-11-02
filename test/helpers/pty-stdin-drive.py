# #97 pty driver (Linux): pty-stdin-drive.py <node> <probe.mjs> <bundle.mjs> <editor>.
# Starts the probe on a pseudo-terminal, waits until the editor prints READY, types
# 40 keys 15 ms apart and prints everything the terminal showed.
import os, pty, select, sys, time
node, probe, bundle, editor = sys.argv[1:5]
pid, fd = pty.fork()
if pid == 0:
    os.execv(node, [node, probe, bundle, editor])
out = b''
def pump(deadline, until=None):
    global out
    while time.time() < deadline:
        r, _, _ = select.select([fd], [], [], 0.05)
        if r:
            try:
                d = os.read(fd, 4096)
            except OSError:
                return
            if not d:
                return
            out += d
        if until and until in out:
            return
pump(time.time() + 15, b'READY')
for ch in 'abcdefghijklmnopqrstuvwxyz0123456789ABCD':
    os.write(fd, ch.encode())
    pump(time.time() + 0.015)
pump(time.time() + 4)
print(out.decode(errors='replace'))
