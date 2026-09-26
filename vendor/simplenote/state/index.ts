// OMARCHY: modified for snote from Automattic's simplenote-electron (GPLv2); see NOTICE (2026-09-23).
// OMARCHY: Root state module for headless CLI
import dataReducer from './data/reducer';
import settingsReducer from './settings/reducer';
import uiReducer from './ui/reducer';
import simperiumReducer from './simperium/reducer';

export { dataReducer, settingsReducer, uiReducer, simperiumReducer };

export default {
  data: dataReducer,
  settings: settingsReducer,
  ui: uiReducer,
  simperium: simperiumReducer,
};

// OMARCHY: Type exports for selectors and middleware
// OMARCHY: ghosts is a tuple: [change versions per bucket, entity ghosts per bucket]
// OMARCHY: Ghost entity structure: { key: entityId, data: entityData, version: number }
export type GhostEntity = {
  key: string;
  data: unknown;
  version: number;
};
export type State = {
  data: ReturnType<typeof dataReducer>;
  settings: ReturnType<typeof settingsReducer>;
  ui: ReturnType<typeof uiReducer>;
  simperium: ReturnType<typeof simperiumReducer> & {
    ghosts: [Map<string, string | undefined>, Map<string, Map<string, GhostEntity>>];
  };
  browser: {
    windowWidth: number;
    systemTheme: 'light' | 'dark';
  };
};
export type Selector<T> = (state: State, ...args: any[]) => T;
export type Middleware = any;
export type Store = any;
