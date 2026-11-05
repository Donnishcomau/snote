#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);

// src/core/invisible.ts
var INVISIBLE_FORMAT = /(?![\uFE0E\uFE0F])[\p{Cf}\p{Default_Ignorable_Code_Point}\u2028\u2029]/u;
var KEPT_FLAG = /\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F}/uy;
function keptFlagAt(s, i) {
  if (s.charCodeAt(i) !== 55356) return 0;
  KEPT_FLAG.lastIndex = i;
  return KEPT_FLAG.exec(s)?.[0].length ?? 0;
}
function isShownInvisible(cp) {
  return cp !== 8205 && INVISIBLE_FORMAT.test(String.fromCodePoint(cp));
}

export {
  INVISIBLE_FORMAT,
  KEPT_FLAG,
  keptFlagAt,
  isShownInvisible
};
