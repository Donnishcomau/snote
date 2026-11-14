// #447: a test that asserts one platform's behaviour pins process.platform, so it keeps its assertion on any
// host; on macOS an unpinned copy test would run the real /usr/bin/pbcopy and overwrite the host clipboard.
const real = Object.getOwnPropertyDescriptor(process, 'platform') as PropertyDescriptor;

export function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { ...real, value });
}

export function restorePlatform(): void {
  Object.defineProperty(process, 'platform', real);
}
