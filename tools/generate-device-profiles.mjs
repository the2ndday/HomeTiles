import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { releaseProfiles, installerProfiles } = require('./device-catalog.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const check = args.includes('--check');
// Korean edition fork: --matrix-device <key> restricts the generated CI
// matrix to a single release device. The browser profiles and the device
// catalog stay complete; the web installer simply hides devices whose
// release assets are missing (allowMissingProfiles).
const matrixDeviceIndex = args.findIndex((arg) => arg === '--matrix-device' || arg.startsWith('--matrix-device='));
const matrixDevice = matrixDeviceIndex < 0
  ? ''
  : args[matrixDeviceIndex].startsWith('--matrix-device=')
    ? args[matrixDeviceIndex].slice('--matrix-device='.length)
    : (args[matrixDeviceIndex + 1] || '');
if (matrixDeviceIndex >= 0 && !matrixDevice) {
  throw new Error('--matrix-device requires a device key.');
}
if (args.some((arg, index) =>
  arg !== '--check' && arg !== '--matrix-device' &&
  !(arg.startsWith('--matrix-device=') || (matrixDeviceIndex >= 0 && index === matrixDeviceIndex + 1)))) {
  throw new Error('Only --check and --matrix-device <key> are supported.');
}

function update(relativePath, content) {
  const target = path.join(root, relativePath);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current.replace(/\r\n/g, '\n') === content.replace(/\r\n/g, '\n')) return;
  if (check) throw new Error(`Generated device profiles are stale: ${relativePath}`);
  fs.writeFileSync(target, content.replace(/\r?\n/g, '\r\n'));
}

const browserProfiles = installerProfiles().map((profile) =>
  `  Object.freeze(${JSON.stringify(profile, null, 2).replace(/\n/g, '\n  ')})`).join(',\n');
update('docs/assets/javascripts/device-profiles.mjs',
  '// Generated from tools/device-profiles.json. Run node tools/generate-device-profiles.mjs.\n' +
  `export const DEVICE_PROFILES = Object.freeze([\n${browserProfiles},\n]);\n`);

const workflowPath = '.github/workflows/firmware.yml';
const workflow = fs.readFileSync(path.join(root, workflowPath), 'utf8').replace(/\r\n/g, '\n');
const start = '        # BEGIN GENERATED DEVICE MATRIX';
const end = '        # END GENERATED DEVICE MATRIX';
const matrixProfiles = matrixDevice
  ? releaseProfiles.filter((profile) => profile.key === matrixDevice)
  : releaseProfiles;
if (matrixDevice && matrixProfiles.length !== 1) {
  throw new Error(`Unknown --matrix-device key: ${matrixDevice}`);
}
const matrix = [...matrixProfiles].sort((a, b) => a.ciOrder - b.ciOrder).map((profile) => [
  `          - label: ${profile.ciLabel}`,
  `            profile: ${profile.buildProfile}`,
  `            key: ${profile.key}`,
  ...(profile.metadataDeviceKey !== profile.key ? [`            metadata_key: ${profile.metadataDeviceKey}`] : []),
  `            define: ${profile.define}`,
  ...(profile.siliconVariant !== 'default' ? [`            silicon_variant: ${profile.siliconVariant}`] : []),
  `            rx_variant: ${profile.rxVariant}`,
  '            publish: true',
].join('\n')).join('\n');
if (!workflow.includes(start) || !workflow.includes(end)) throw new Error('Generated CI matrix markers are missing.');
update(workflowPath, workflow.slice(0, workflow.indexOf(start)) +
  `${start}\n        include:\n${matrix}\n${end}` +
  workflow.slice(workflow.indexOf(end) + end.length));
console.log(`Device catalog generated outputs: ${check ? 'PASS' : 'current'}`);
