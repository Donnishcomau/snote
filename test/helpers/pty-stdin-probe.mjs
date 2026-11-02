// #97 pty probe (Linux): argv = <bundle of src/core/editor.ts> <editor script>.
// Behaves like snote around an external editor: reads stdin in raw mode, then
// does what Ink's suspend does (raw mode off, unref, remove the listener) and
// runs editInEditor. Any key snote's own reader gets is printed as [snote got ...].
const { editInEditor } = await import(process.argv[2]);
const editor = process.argv[3];
const s = process.stdin;
const handler = () => {
  let c;
  while ((c = s.read()) !== null) process.stderr.write('[snote got ' + JSON.stringify(String(c)) + ']\r\n');
};
s.setRawMode(true);
s.setEncoding('utf8');
s.addListener('readable', handler);
await new Promise((r) => setTimeout(r, 200));
s.setRawMode(false);
s.unref();
s.removeListener('readable', handler);
await editInEditor('pty probe', { editor });
s.ref();
s.setRawMode(true);
s.addListener('readable', handler);
await new Promise((r) => setTimeout(r, 300));
process.exit(0);
