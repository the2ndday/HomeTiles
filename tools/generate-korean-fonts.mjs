// Korean fallback font generator (Korean edition fork).
//
// Generates src/fonts/ui_font_korean_<N>.c for N in 12,14,16,20,24,28 from
// Noto Sans KR Regular (SIL OFL 1.1), then wires them into the existing
// Inter -> Cyrillic fallback chains via apply-korean-fallback.mjs.
//
//   node tools/generate-korean-fonts.mjs
//
// Requirements: Node 24+ (global fetch) and network access for the pinned
// font download and `npx --yes lv_font_conv@1.5.3`. The font is cached in
// .cache/korean-fonts/ (gitignored). lv_font_conv cannot take metric
// overrides, so the vertical metrics come from Noto Sans KR itself, like the
// existing Cyrillic fallback fonts.
//
// Glyph set:
//   - the 2,350 KS X 1001 Hangul syllables (EUC-KR rows 0xB0..0xC8 x
//     columns 0xA1..0xFE, decoded with TextDecoder('euc-kr'));
//   - Hangul Compatibility Jamo U+3131..U+318E;
//   - CJK punctuation U+3000..U+3003 and U+300C..U+300F;
//   - every Hangul syllable (U+AC00..U+D7A3) and Hangul Jamo
//     (U+1100..U+11FF, U+3130..U+318F) used in src/core/i18n/i18n.cpp,
//     so the Korean UI translation is always 100 % covered.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, '.cache', 'korean-fonts');

// Pinned upstream source (SIL OFL 1.1). lv_font_conv 1.5.3 reads this
// CFF-flavored OTF directly (verified), so no conversion is needed.
const FONT_URL =
  'https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf';
// SHA-256 of the file at the pinned URL, so an upstream font change is
// detected instead of silently changing every generated bitmap.
const FONT_SHA256 = '69975a0ac8472717870aefeab0a4d52739308d90856b9955313b2ad5e0148d68';

const FONT_SIZES = [12, 14, 16, 20, 24, 28];

async function downloadFont() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const target = path.join(cacheDir, 'NotoSansKR-Regular.otf');
  if (fs.existsSync(target)) {
    const digest = createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    if (digest === FONT_SHA256) return target;
    fs.rmSync(target, { force: true });
  }
  process.stdout.write(`[korean-fonts] Downloading Noto Sans KR Regular from ${FONT_URL}\n`);
  const response = await fetch(FONT_URL, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Font download failed: HTTP ${response.status}`);
  }
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  const digest = createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  if (digest !== FONT_SHA256) {
    throw new Error(`Downloaded font SHA-256 ${digest} does not match the pinned ${FONT_SHA256}.`);
  }
  return target;
}

// KS X 1001 Hangul syllables: every EUC-KR cell in rows 0xB0..0xC8 and
// columns 0xA1..0xFE decodes to exactly one precomposed syllable (2,350 in
// total); a decoder replacement character means the cell is not a syllable.
function ksX1001HangulSyllables() {
  const decoder = new TextDecoder('euc-kr');
  const codepoints = new Set();
  for (let row = 0xb0; row <= 0xc8; row += 1) {
    for (let col = 0xa1; col <= 0xfe; col += 1) {
      const char = decoder.decode(Uint8Array.of(row, col));
      const codepoint = char.codePointAt(0);
      if (char.length === 1 && codepoint !== 0xfffd) codepoints.add(codepoint);
    }
  }
  return codepoints;
}

// Hangul codepoints used in the Korean translation (i18n.cpp): every
// syllable or jamo in the UI must have a glyph, whatever the KS X 1001
// subset covers. Syllables outside KS X 1001 only appear when a new
// translation uses them, so the fonts grow only when the UI does.
function i18nCppHangul() {
  const source = fs.readFileSync(path.join(root, 'src', 'core', 'i18n', 'i18n.cpp'), 'utf8');
  const codepoints = new Set();
  for (const char of source) {
    const codepoint = char.codePointAt(0);
    if ((codepoint >= 0xac00 && codepoint <= 0xd7a3) ||  // Hangul syllables
        (codepoint >= 0x1100 && codepoint <= 0x11ff) ||  // Hangul Jamo
        (codepoint >= 0x3130 && codepoint <= 0x318f)) {  // Hangul Compatibility Jamo
      codepoints.add(codepoint);
    }
  }
  return codepoints;
}

function glyphSet() {
  const codepoints = ksX1001HangulSyllables();
  if (codepoints.size !== 2350) {
    throw new Error(`Expected 2,350 KS X 1001 syllables, decoded ${codepoints.size}.`);
  }
  for (let codepoint = 0x3131; codepoint <= 0x318e; codepoint += 1) codepoints.add(codepoint);
  for (const codepoint of [0x3000, 0x3001, 0x3002, 0x3003, 0x300c, 0x300d, 0x300e, 0x300f]) {
    codepoints.add(codepoint);
  }
  // Guarantee 100 % coverage of the Korean UI strings.
  let reported = false;
  for (const codepoint of i18nCppHangul()) {
    if (!codepoints.has(codepoint)) {
      codepoints.add(codepoint);
      if (!reported) {
        reported = true;
        process.stdout.write('[korean-fonts] i18n.cpp adds codepoints beyond the base set:\n');
      }
      process.stdout.write(`  U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}\n`);
    }
  }
  return [...codepoints].sort((a, b) => a - b);
}

// One -r argument per contiguous range; 2,350 syllables scatter into ~1,600
// short ranges, but the total argument length stays far below any limit.
function rangeArgs(codepoints) {
  const ranges = [];
  for (const codepoint of codepoints) {
    const last = ranges[ranges.length - 1];
    if (last && codepoint === last[1] + 1) last[1] = codepoint;
    else ranges.push([codepoint, codepoint]);
  }
  const args = [];
  for (const [start, end] of ranges) {
    args.push('-r', start === end ? `0x${start.toString(16)}` : `0x${start.toString(16)}-0x${end.toString(16)}`);
  }
  return args;
}

// Keep the generated Opts header compact and stable: the full range list
// lives in this tool, so the header documents the generator instead of
// repeating ~1,600 range arguments in every file.
function compactHeader(sourcePath, size) {
  return `/*******************************************************************************\n` +
    ` * Size: ${size} px\n` +
    ` * Bpp: 4\n` +
    ` * Font: Noto Sans KR Regular (SIL OFL 1.1), see NotoSansKR-LICENSE.txt\n` +
    ` * Opts: generated by tools/generate-korean-fonts.mjs with the KS X 1001\n` +
    ` *        Hangul syllables, Hangul Compatibility Jamo, CJK punctuation and\n` +
    ` *        every Hangul codepoint used in src/core/i18n/i18n.cpp,\n` +
    ` *        --font ${path.basename(sourcePath)} --lv-font-name ui_font_korean_${size}\n` +
    ` ******************************************************************************/\n`;
}

function generateFont(sourcePath, size, ranges) {
  const output = path.join(root, 'src', 'fonts', `ui_font_korean_${size}.c`);
  const args = [
    '--bpp', '4', '--format', 'lvgl', '--lv-include', 'lvgl.h',
    '--size', String(size), '--font', sourcePath,
    ...ranges,
    '--lv-font-name', `ui_font_korean_${size}`,
    '-o', output,
  ];
  process.stdout.write(`[korean-fonts] Generating ui_font_korean_${size} (${ranges.length / 2} ranges)...\n`);
  const result = spawnSync('npx', ['--yes', 'lv_font_conv@1.5.3', ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`lv_font_conv failed for size ${size}.`);

  // Rewrite the verbose Opts comment deterministically (same output on
  // every run, even though the cache path is machine-dependent).
  let text = fs.readFileSync(output, 'utf8');
  const headerStart = text.indexOf('/***');
  const headerEnd = text.indexOf('***/', headerStart);
  if (headerStart < 0 || headerEnd < 0) throw new Error(`Generated ${output} has no Opts header.`);
  text = compactHeader(sourcePath, size) + text.slice(headerEnd + 4);
  fs.writeFileSync(output, text);
  return output;
}

async function main() {
  const fontPath = await downloadFont();
  const codepoints = glyphSet();
  const ranges = rangeArgs(codepoints);
  const generated = FONT_SIZES.map((size) => generateFont(fontPath, size, ranges));

  const { applyKoreanFallback } = await import('./apply-korean-fallback.mjs');
  const wired = applyKoreanFallback(root);
  for (const file of wired) process.stdout.write(`[korean-fonts] Wired fallback: ${file}\n`);

  const totalBytes = generated.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  process.stdout.write(
    `[korean-fonts] Done: ${generated.length} fonts, ${codepoints.length} glyphs each, ` +
    `${totalBytes.toLocaleString('en-US')} bytes of .c font sources.\n`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
