import { checkboxRegex } from '@vendor/utils/task-transform';

const ITEM = new RegExp(checkboxRegex.source);

type ChecklistItem = { line: number; checked: boolean; text: string };

export function checklistItems(content: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const lines = content.split('\n');
  lines.forEach((line, lineIndex) => {
    const match = ITEM.exec(line);
    if (match) {
      items.push({
        line: lineIndex,
        checked: match[2] !== ' ',
        text: line.slice(match[0].length),
      });
    }
  });
  return items;
}

export function toggleChecklistItem(content: string, index: number): string {
  if (!Number.isInteger(index)) {
    return content;
  }
  const items = checklistItems(content);
  if (index < 0 || index >= items.length) {
    return content;
  }
  const item = items[index];
  const lines = content.split('\n');
  const line = lines[item.line];
  const match = ITEM.exec(line);
  const toggled =
    match![1] + '- [' + (match![2] === ' ' ? 'x' : ' ') + ']' + match![3];
  lines[item.line] = toggled + line.slice(match![0].length);
  return lines.join('\n');
}

export function insertChecklistItem(
  content: string,
  afterIndex: number,
  text: string,
): string {
  const t = text.trim();
  if (t === '') {
    return content;
  }
  const items = checklistItems(content);
  const item = items[afterIndex];
  if (item) {
    const lines = content.split('\n');
    const itemLine = lines[item.line];
    const match = ITEM.exec(itemLine);
    const indent = match![1];
    const newLine = indent + '- [ ] ' + t;
    lines.splice(item.line + 1, 0, newLine);
    return lines.join('\n');
  }
  const itemText = '- [ ] ' + t;
  if (content === '') {
    return itemText;
  }
  if (content.endsWith('\n')) {
    return content + itemText;
  }
  return content + '\n' + itemText;
}
