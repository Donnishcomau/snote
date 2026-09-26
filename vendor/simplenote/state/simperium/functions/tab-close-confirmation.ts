// OMARCHY: modified for snote from Automattic's simplenote-electron (GPLv2); see NOTICE (2026-09-23).
// OMARCHY: Stub file for headless CLI - no tab close confirmation in terminal
export const confirmTabClose = () => Promise.resolve(true);
// OMARCHY: Alias for the name expected by middleware
export const confirmBeforeClosingTab = () => Promise.resolve(true);
