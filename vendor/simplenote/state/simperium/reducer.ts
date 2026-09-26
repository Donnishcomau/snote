// OMARCHY: modified for snote from Automattic's simplenote-electron (GPLv2); see NOTICE (2026-09-23).
// OMARCHY: Simperium reducer stub for headless CLI
import type { Action } from 'redux';

export interface SimperiumState {
  connected: boolean;
  syncing: boolean;
}

const initialState: SimperiumState = {
  connected: false,
  syncing: false,
};

export default function simperiumReducer(
  state = initialState,
  action: Action
): SimperiumState {
  return state;
}
