import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir(new URL('../web/vendor/', import.meta.url), { recursive: true });

await build({
  entryPoints: [new URL('../web/src/nostr-tools-entry.js', import.meta.url).pathname],
  outfile: new URL('../web/vendor/nostr-tools.bundle.js', import.meta.url).pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

console.log('Built web/vendor/nostr-tools.bundle.js');
