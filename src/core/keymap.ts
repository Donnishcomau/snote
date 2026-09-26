/**
 * Keymap for snote TUI.
 * Single source of truth for keyboard shortcuts.
 */

export interface KeymapEntry {
  key: string;
  action: string;
  description: string;
}

export const keymap: KeymapEntry[] = [
  { key: 'j', action: 'move_down', description: 'Move down' },
  { key: 'k', action: 'move_up', description: 'Move up' },
  { key: 'Enter', action: 'open_note', description: 'Open note' },
  { key: 'Tab', action: 'next_pane', description: 'Next pane' },
  { key: 'q', action: 'quit', description: 'Quit' },
  { key: 'v', action: 'toggle_preview', description: 'Toggle rendered markdown preview' },
  { key: '?', action: 'help', description: 'Show this help' },
  { key: 'Escape', action: 'close', description: 'Close overlay / back' },
  { key: 'e', action: 'edit_note', description: 'Edit in $EDITOR' },
  { key: 'n', action: 'new_note', description: 'New note' },
  { key: 'g', action: 'edit_tags', description: 'Edit tags of the selected note' },
  { key: 'w', action: 'export_note', description: 'Export note to .md' },
  { key: 'L', action: 'logout', description: 'Log out (asks first)' },
  { key: 'd', action: 'trash_note', description: 'Move to trash' },
  { key: 'u', action: 'restore_note', description: 'Restore from trash (trash view)' },
  { key: 'D', action: 'delete_forever', description: 'Delete forever (trash view)' },
  { key: 'T', action: 'toggle_trash', description: 'Show trash / all notes' },
  { key: 'E', action: 'empty_trash', description: 'Empty the trash (trash view)' },
  { key: 'p', action: 'toggle_pin', description: 'Pin / unpin' },
  { key: 'm', action: 'toggle_markdown', description: 'Markdown on / off' },
  { key: 's', action: 'cycle_sort', description: 'Sort: modified, created, a-z' },
  { key: 'S', action: 'reverse_sort', description: 'Reverse the sort order' },
  { key: '/', action: 'search', description: 'Search notes' },
  { key: 't', action: 'focus_tags', description: 'Show / focus the tags pane' },
  { key: 'J', action: 'move_tag_down', description: 'Move tag down (tags pane)' },
  { key: 'K', action: 'move_tag_up', description: 'Move tag up (tags pane)' },
  { key: 'R', action: 'rename_tag', description: 'Rename tag (tags pane)' },
  { key: 'x', action: 'delete_tag', description: 'Delete tag (tags pane)' },
  { key: 'r', action: 'force_sync', description: 'Sync now' },
  { key: 'P', action: 'toggle_publish', description: 'Publish / unpublish' },
  { key: 'y', action: 'copy_link', description: 'Copy the public link' },
  { key: 'h', action: 'history', description: 'Note history (Enter restores)' },
  { key: 'c', action: 'toggle_check', description: 'Tick / untick item (note)' },
  { key: 'a', action: 'add_check_item', description: 'Add checklist item (note)' },
];

/**
 * Map Ink key event to keymap key name.
 */
export function keyNameFromEvent(key: {
  return?: boolean;
  tab?: boolean;
  escape?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  control?: boolean;
}): string | null {
  if (key.return) return 'Enter';
  if (key.tab) return 'Tab';
  if (key.escape) return 'Escape';
  if (key.upArrow) return 'upArrow';
  if (key.downArrow) return 'downArrow';
  return null;
}
