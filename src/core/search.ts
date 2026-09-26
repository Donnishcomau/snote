import type { Note, TagName, TagHash } from '@vendor/types';
import { getTerms } from '@vendor/utils/filter-notes';
import { tagHashOf } from '@vendor/utils/tag-hash';

export type ParsedQuery = { terms: string[]; tags: Set<TagHash> };

const TAG_TOKEN_PATTERN = /(?:\btag:)([^\s,]+)/g;

export function parseQuery(query: string): ParsedQuery {
  const tags = new Set<TagHash>();
  const terms = getTerms(query).map((t) => t.toLocaleLowerCase());

  // Collect tag hashes from tag: tokens
  for (const match of query.matchAll(TAG_TOKEN_PATTERN)) {
    tags.add(tagHashOf(match[1] as TagName)); // OMARCHY: boundary cast
  }

  return { terms, tags };
}

export function matchParsed(note: Note, parsed: ParsedQuery): boolean {
  // (a) every term must be a substring of note.content (lowercased)
  const contentLower = (note.content ?? '').toLocaleLowerCase();
  for (const term of parsed.terms) {
    if (!contentLower.includes(term)) {
      return false;
    }
  }

  // (b) if 'untagged' is in tags, the note must have zero tags
  const untaggedHash = 'untagged' as TagHash; // OMARCHY: boundary cast
  if (parsed.tags.has(untaggedHash)) {
    if (note.tags.length !== 0) {
      return false;
    }
  } else {
    // (c) every other hash in tags must match one of the note's tags
    for (const tagHash of parsed.tags) {
      const matches = note.tags.some(
        (nTag) => tagHashOf(nTag) === tagHash
      );
      if (!matches) {
        return false;
      }
    }
  }

  return true;
}

export function matchNote(note: Note, query: string): boolean {
  return matchParsed(note, parseQuery(query));
}

export function filterNotes(notes: Note[], query: string): Note[] {
  const parsed = parseQuery(query);
  const filtered = notes.filter((note) => matchParsed(note, parsed));
  return filtered;
}
