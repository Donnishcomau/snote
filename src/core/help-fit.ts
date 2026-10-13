/**
 * The column-fit rule for the sectioned Help layout (T522).
 *
 * At widths 50-99 the sectioned layout is readable only when each of its
 * sub-columns is at least 23 cells wide. The inner width available to the
 * section columns is `width - 6` (border + padding), so the most sub-columns
 * that still fit is `floor((width - 6) / 23)`.
 */
export function maxFitColumns(width: number): number {
  return Math.max(0, Math.floor((width - 6) / 23));
}
