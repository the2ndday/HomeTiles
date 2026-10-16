// Wire the generated Korean fallback fonts into the existing font chains.
// Idempotent: running it again after upstream regenerates the Inter/Cyrillic
// fonts restores the wiring without touching anything else.
//
//   node tools/apply-korean-fallback.mjs
//
// Fallback layout by size:
//   12, 28          ui_font_<N>            -> ui_font_korean_<N>
//   14, 16, 20, 24  ui_font_<N> -> Cyrillic -> ui_font_korean_<N>
//   20 semibold     ui_font_20_semibold    -> ui_font_korean_20
// LVGL 9 follows fallback chains recursively, so Hangul text renders at
// every size that ships a Korean fallback.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const KOREAN_FONT_SIZES = [12, 14, 16, 20, 24, 28];

const WIRING = [
  { file: 'ui_font_12.c', size: 12 },
  { file: 'ui_font_cyrillic_14.c', size: 14 },
  { file: 'ui_font_cyrillic_16.c', size: 16 },
  { file: 'ui_font_cyrillic_20.c', size: 20 },
  { file: 'ui_font_cyrillic_24.c', size: 24 },
  { file: 'ui_font_28.c', size: 28 },
  { file: 'ui_font_20_semibold.c', size: 20 },
];

export function applyKoreanFallback(workspaceRoot) {
  const changed = [];
  for (const { file, size } of WIRING) {
    const target = path.join(workspaceRoot, 'src', 'fonts', file);
    let text = fs.readFileSync(target, 'utf8');
    const name = `ui_font_korean_${size}`;
    const extern = `extern const lv_font_t ${name};`;
    const fallback = `.fallback = &${name},`;
    let modified = false;

    // Declare the Korean font right after the include block, matching the
    // existing `extern const lv_font_t ui_font_cyrillic_<N>;` style.
    if (!text.includes(extern)) {
      const guard = text.match(/#ifndef (UI_FONT_[A-Z0-9_]+)/);
      if (!guard) throw new Error(`${file}: no UI_FONT_ guard found.`);
      const index = text.indexOf(`#ifndef ${guard[1]}`);
      text = `${text.slice(0, index)}${extern}\n\n${text.slice(index)}`;
      modified = true;
    }

    // Replace the generated `NULL` fallback. The public font struct is the
    // only place a `.fallback = NULL,` line exists in these files.
    if (text.includes('.fallback = NULL,')) {
      text = text.replace('.fallback = NULL,', fallback);
      modified = true;
    } else if (!text.includes(fallback)) {
      throw new Error(`${file}: no unwired .fallback slot found (already wired to another font?).`);
    }

    if (modified) {
      fs.writeFileSync(target, text);
      changed.push(file);
    }
  }
  return changed;
}

function main() {
  const changed = applyKoreanFallback(root);
  if (changed.length === 0) {
    process.stdout.write('[korean-fallback] Wiring already current; no changes.\n');
    return;
  }
  for (const file of changed) process.stdout.write(`[korean-fallback] Wired ${file}\n`);
}

main();
