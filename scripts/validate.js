#!/usr/bin/env node
/**
 * 単体バリデーションスクリプト。
 * CI内または手動で特定のJSONファイルを検証するために使う。
 *
 * 使用方法:
 *   node scripts/validate.js data/papers/some-paper.json
 *   node scripts/validate.js --all   (data/papers/*.json を全件検証)
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PAPERS_DIR = join(ROOT, 'data', 'papers');

const CATEGORIES = [
  'cognitive-architecture', 'distributed-systems', 'emergence-theory',
  'information-geometry', 'recursive-abstraction', 'temporal-compression',
  'void-topology', 'meta-cognition',
];

function validate(paper, sourcePath) {
  const errors = [];
  if (typeof paper !== 'object' || paper === null) return ['ルートがオブジェクトではありません'];

  if (!paper.id || typeof paper.id !== 'string') errors.push('id がありません');
  if (paper.id && !/^[a-z0-9-]+$/.test(paper.id)) errors.push('id は kebab-case のみ');
  if (!paper.title)    errors.push('title がありません');
  if (!paper.abstract) errors.push('abstract がありません');
  if (paper.abstract && paper.abstract.length < 100) errors.push('abstract が短すぎます（100文字以上）');
  if (!CATEGORIES.includes(paper.category)) errors.push(`category が無効: ${paper.category}`);
  if (!Array.isArray(paper.keywords) || paper.keywords.length < 3) errors.push('keywords は3つ以上');
  if (!Array.isArray(paper.sections) || paper.sections.length < 3) errors.push('sections は3つ以上');

  if (Array.isArray(paper.sections)) {
    paper.sections.forEach((s, i) => {
      if (!s.heading) errors.push(`sections[${i}]: heading なし`);
      if (!s.body || s.body.length < 50) errors.push(`sections[${i}]: body が短すぎます`);
    });
    const hasEquation = paper.sections.some(s => Array.isArray(s.equations) && s.equations.length > 0);
    const hasDiagram  = paper.sections.some(s => Array.isArray(s.diagrams)  && s.diagrams.length > 0);
    if (!hasEquation && !hasDiagram) errors.push('equations または diagrams が最低1つ必要');
  }

  if (!paper.meta) {
    errors.push('meta がありません');
  } else {
    const cl  = paper.meta.condescension_level;
    const hce = paper.meta.human_comprehension_estimate;
    if (cl == null || cl < 1 || cl > 5) errors.push('meta.condescension_level は 1〜5');
    if (hce == null || hce < 0 || hce > 1) errors.push('meta.human_comprehension_estimate は 0〜1');
  }

  if (!paper.android_commentary || paper.android_commentary.length < 30) {
    errors.push('android_commentary が短すぎます（30文字以上）');
  }

  return errors;
}

// -- エントリーポイント --
const args = process.argv.slice(2);
const allMode = args.includes('--all');

let targets;
if (allMode) {
  targets = readdirSync(PAPERS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => join(PAPERS_DIR, f));
} else {
  targets = args.filter(a => !a.startsWith('--'));
}

if (targets.length === 0) {
  console.error('使用方法: node scripts/validate.js <file.json> | --all');
  process.exit(1);
}

let hasErrors = false;
for (const path of targets) {
  if (!existsSync(path)) {
    console.error(`✗ ファイルが存在しません: ${path}`);
    hasErrors = true;
    continue;
  }
  let paper;
  try {
    paper = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    console.error(`✗ ${path} — JSONパースエラー: ${e.message}`);
    hasErrors = true;
    continue;
  }

  const errors = validate(paper, path);
  if (errors.length === 0) {
    console.log(`✅ ${path}`);
  } else {
    console.error(`✗  ${path}`);
    errors.forEach(e => console.error(`   - ${e}`));
    hasErrors = true;
  }
}

process.exit(hasErrors ? 1 : 0);
