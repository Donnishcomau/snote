import type { EntityId } from '@vendor/types';
import type { State } from '../core/store';

import { tagHashOf } from '@vendor/utils/tag-hash';
import type { TagName } from '@vendor/types';

export interface TagKey {
  return?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  escape?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

export interface TagStep {
  text: string;
  add?: string;
  remove?: string;
  close?: true;
}

export function suggestTag(
  input: string,
  allTags: string[],
  tags: string[]
): string | null {
  if (input === '') return null;

  const inputLower = input.toLowerCase();
  const existingHashes = new Set(tags.map((t) => tagHashOf(t as TagName)));

  for (const name of allTags) {
    if (name.toLowerCase().startsWith(inputLower)) {
      const hash = tagHashOf(name as TagName);
      if (!existingHashes.has(hash)) {
        return name;
      }
    }
  }

  return null;
}

export function tagInputStep(
  text: string,
  input: string,
  key: TagKey,
  tags: string[],
  allTags: string[]
): TagStep {
  if (key.escape) {
    return { text, close: true };
  }

  if (key.return) {
    const t = text.trim();
    if (t === '') return { text };
    const tHash = tagHashOf(t as TagName);
    for (const tagName of tags) {
      if (tagHashOf(tagName as TagName) === tHash) {
        return { text: '' };
      }
    }
    return { text: '', add: t };
  }

  if (key.tab) {
    const suggestion = suggestTag(text, allTags, tags);
    return { text: suggestion ?? text };
  }

  if (key.backspace || key.delete) {
    if (text !== '') {
      return { text: text.slice(0, -1) };
    } else if (tags.length > 0) {
      return { text: '', remove: tags[tags.length - 1] };
    } else {
      return { text: '' };
    }
  }

  if (key.ctrl || key.meta) {
    return { text };
  }

  if (input === '') {
    return { text };
  }

  return { text: text + input };
}
