/**
 * Fixed section groupings for the Help overlay.
 * Six sections, each with a name and a list of action names.
 */

export const SECTIONS = [
  {
    name: 'Navigate',
    actions: [
      'move_down',
      'move_up',
      'open_note',
      'next_pane',
      'search',
      'toggle_preview',
      'help',
      'close',
    ],
  },
  {
    name: 'Notes',
    actions: [
      'new_note',
      'edit_note',
      'toggle_pin',
      'toggle_markdown',
      'history',
      'toggle_check',
      'add_check_item',
      'export_note',
      'send_blog',
    ],
  },
  {
    name: 'Tags',
    actions: [
      'edit_tags',
      'focus_tags',
      'move_tag_down',
      'move_tag_up',
      'rename_tag',
      'delete_tag',
    ],
  },
  {
    name: 'Trash',
    actions: [
      'trash_note',
      'restore_note',
      'delete_forever',
      'toggle_trash',
      'empty_trash',
    ],
  },
  {
    name: 'Sync & Sort',
    actions: [
      'cycle_sort',
      'reverse_sort',
      'force_sync',
      'toggle_publish',
      'copy_link',
    ],
  },
  {
    name: 'App',
    actions: [
      'quit',
      'logout',
    ],
  },
];
