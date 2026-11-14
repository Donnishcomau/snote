#!/usr/bin/env node
import { createRequire as __cr } from 'node:module';
const require = __cr(import.meta.url);
import {
  starAsk,
  starConsent,
  starIgnores,
  starNo,
  starShows,
  starYes
} from "./chunk-GKNBOAJW.js";
import "./chunk-BQ6AXYOB.js";
import "./chunk-SRSFEH3H.js";

// src/tui/StarPrompt.tsx
function StarPrompt(p) {
  const { useReadGate, useInput, renderLine } = p;
  useReadGate({ confirm: starConsent() });
  useInput((input, key) => {
    if (starShows() === "") return;
    if (starIgnores()) return;
    if (starConsent()) {
      if (input === "y") {
        void starYes();
        return;
      }
      starNo();
      return;
    }
    starAsk(input, key.escape === true);
  });
  const line = starShows();
  if (line === "") return null;
  return renderLine(line);
}
export {
  StarPrompt
};
