interface PaneArrowCtx {
  tagsOpen: boolean;
  noteFocused: boolean;
  setTagsOpen: (v: boolean) => void;
  setTagsFocused: (v: boolean) => void;
  setNoteFocused: (v: boolean) => void;
}

/**
 * T348: left/right arrows move between the panes (tags, list, preview).
 * Returns true when the key was a pane arrow and was handled.
 */
export function handlePaneArrow(keyName: string | null, ctx: PaneArrowCtx): boolean {
  if (keyName === 'leftArrow') {
    if (ctx.noteFocused) ctx.setNoteFocused(false);
    else {
      ctx.setTagsOpen(true);
      ctx.setTagsFocused(true);
    }
    return true;
  }
  if (keyName === 'rightArrow') {
    if (!ctx.noteFocused) ctx.setNoteFocused(true);
    return true;
  }
  return false;
}
