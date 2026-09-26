process.emitWarning('snote-test-warning');
new Promise((r) => setTimeout(r, 50)).then(() => console.log('done'));
