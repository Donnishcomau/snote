type Row = { text: string; line: number };

export function wrapLines(content: string, width: number): Row[] {
  const w = Math.max(1, width);
  const lines = content.split('\n');
  const result: Row[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') {
      result.push({ text: '', line: i });
    } else {
      let rest = line;
      while (rest.length > w) {
        const cut = rest.lastIndexOf(' ', w);
        if (cut <= 0) {
          result.push({ text: rest.slice(0, w).trimEnd(), line: i });
          rest = rest.slice(w).replace(/^ +/, '');
        } else {
          result.push({ text: rest.slice(0, cut).trimEnd(), line: i });
          rest = rest.slice(cut).replace(/^ +/, '');
        }
      }
      result.push({ text: rest, line: i });
    }
  }

  return result;
}
