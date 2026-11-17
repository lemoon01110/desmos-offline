#!/usr/bin/env node
// Downloads the Desmos calculator script into app/vendor/ so the app can run offline.
// The script belongs to Desmos and is NOT part of this repository; every user downloads their own copy.
//
// API key: set DESMOS_API_KEY to your own key (https://www.desmos.com/my-api). Without one, Desmos's public
// demo key is used. Desmos describes that key as "suitable for prototyping, not for commercial use", and the
// calculator shows a small "Trial Key" notice.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEMO_KEY = 'dcb31709b452b1cf9dc26972add0fda6'; // published in the Desmos API docs
const VERSION = process.env.DESMOS_API_VERSION || 'v1.13';
const key = process.env.DESMOS_API_KEY || DEMO_KEY;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'vendor', 'calculator.js');

if (key === DEMO_KEY) console.log('No DESMOS_API_KEY set: using the public demo key (personal use / prototyping only).');
const url = `https://www.desmos.com/api/${VERSION}/calculator.js?apiKey=${encodeURIComponent(key)}`;
console.log(`Downloading Desmos API ${VERSION}…`);
const res = await fetch(url);
if (!res.ok) { console.error(`Download failed: HTTP ${res.status}. Check your internet and API key.`); process.exit(1); }
const js = await res.text();
if (!js.includes('GraphingCalculator')) { console.error('Downloaded file does not look like the Desmos API.'); process.exit(1); }
await mkdir(dirname(out), { recursive: true });
await writeFile(out, js);
console.log(`Saved ${(js.length / 1e6).toFixed(1)} MB to app/vendor/calculator.js. You can go offline now.`);
