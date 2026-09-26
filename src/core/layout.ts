export interface PaneLayout {
  tagsWidth: number;
  listWidthProp: number;
  previewWidthProp: number;
}

export function paneLayout(
  width: number,
  tagsOpen: boolean,
  tagsFocused: boolean,
  reading = false,
): PaneLayout {
  // width >= 80: three panes (tags open = 20 cols, others share remaining)
  if (width >= 80) {
    const tagsWidth = tagsOpen ? 14 : 0;
    return {
      tagsWidth,
      listWidthProp: width - tagsWidth,
      previewWidthProp: width - tagsWidth,
    };
  }

  // 50 <= width < 80: at most two panes
  if (width >= 50) {
    if (tagsOpen) {
      return {
        tagsWidth: 20,
        listWidthProp: Math.ceil((width - 20) * 2.5),
        previewWidthProp: 0,
      };
    } else {
      return {
        tagsWidth: 0,
        listWidthProp: width,
        previewWidthProp: width,
      };
    }
  }

  // width < 50: one pane
  if (tagsOpen && tagsFocused) {
    return {
      tagsWidth: width,
      listWidthProp: 0,
      previewWidthProp: 0,
    };
  }

  if (reading) {
    return { tagsWidth: 0, listWidthProp: 0, previewWidthProp: Math.ceil((width - 1) / 0.6) };
  }

  return {
    tagsWidth: 0,
    listWidthProp: Math.ceil(width * 2.5),
    previewWidthProp: 0,
  };
}

export function shouldAutoOpenTags(
  width: number,
  tagCount: number,
): boolean {
  return width >= 100 && tagCount > 0;
}
