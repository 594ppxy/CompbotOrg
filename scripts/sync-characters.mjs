#!/usr/bin/env node
/* Regenerate the workbench's copy of DSHBot's character table.
 *
 * The workbench is a single, dependency-free HTML file, so it cannot import the host's
 * ES modules at runtime. Instead of hand-copying the shapes (which drifts, and which is
 * what made the first version look like a knock-off), this script reads the real table
 * out of ds-bot and writes it next to the workbench sources as a plain global.
 *
 *   node scripts/sync-characters.mjs
 */
import { writeFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const host = join(here, '..', 'ds-bot', 'src', 'client', 'characters.js')
const out = join(here, '..', 'demo', 'workbench', 'src', 'ds-characters.js')

const mod = await import(host)
const data = {
  CHARACTERS: mod.CHARACTERS,
  PICKER_SHAPES: mod.PICKER_SHAPES,
  PICKER_COLUMNS: mod.PICKER_COLUMNS,
  DEFAULT_SHAPES: mod.DEFAULT_SHAPES,
  FALLBACK_SHAPE: mod.FALLBACK_SHAPE,
  MAIN_LOOK: mod.MAIN_LOOK,
  CHARACTER_COLORS: mod.CHARACTER_COLORS,
  DEFAULT_COLORS: mod.DEFAULT_COLORS,
}

const header = [
  '/* =========================================================================',
  ' * DSHBot character table — copied verbatim from ds-bot/src/client/characters.js',
  ' * so the workbench draws the same avatars as the host app instead of a lookalike.',
  ' * Regenerate with: node scripts/sync-characters.mjs',
  ' * ========================================================================= */',
].join('\n')

writeFileSync(out, `${header}\nwindow.DSCharacters = ${JSON.stringify(data)};\n`)
console.log(`wrote ${out} (${statSync(out).size} bytes, ${Object.keys(data.CHARACTERS).length} characters)`)
