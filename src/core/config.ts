/**
 * Build-time constants for the Simperium API and authentication endpoints.
 *
 * Production values are hard-coded defaults; each can be overridden
 * via the corresponding SNOTE_* environment variable.
 */

export const APP_ID = process.env.SNOTE_APP_ID ?? 'chalk-bump-f49';

export const API_KEY =
  process.env.SNOTE_API_KEY ?? 'c8c2b86337154cdabc989b23e30c6bf4';

export const ACCOUNT_BASE =
  process.env.SNOTE_ACCOUNT_BASE ?? 'https://app.simplenote.com';

export const AUTH_BASE =
  process.env.SNOTE_AUTH_BASE ?? 'https://auth.simperium.com';
