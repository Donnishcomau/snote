// snote-diet: the blog origin the setup prompt shows, kept apart from blog-config.ts
// (saving and loading blog.json), which loads only when a blog step runs.

/** the out-of-the-box blog origin (owner's choice, 2026-09-30). */
export const DEFAULT_BLOG_ORIGIN = 'https://skryf.art';

/**
 * The blog origin to use when no `blog.json` is saved: `SNOTE_BLOG_ORIGIN`
 * when set to a non-empty string, otherwise `DEFAULT_BLOG_ORIGIN`.
 */
export function blogOriginFromEnv(env: NodeJS.ProcessEnv): string {
  const fromEnv = env.SNOTE_BLOG_ORIGIN;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BLOG_ORIGIN;
}
