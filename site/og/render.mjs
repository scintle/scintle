// Renders og/og.html to public/og.jpg (1280×640), the image shown when the site is shared. Run from site/: node og/render.mjs
import { chromium } from '../../web/node_modules/@playwright/test/index.mjs';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
await p.goto(`file://${here}og.html`);
await p.waitForLoadState('networkidle');
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: `${here}../public/og.jpg`, type: 'jpeg', quality: 88 });
await b.close();
