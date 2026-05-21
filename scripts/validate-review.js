#!/usr/bin/env node
/**
 * Critic レビュー JSON のバリデーション。
 * schema/review.schema.json への準拠を検証する。
 *
 * 使用方法:
 *   node scripts/validate-review.js data/reviews/<paper-id>.json
 *   node scripts/validate-review.js --all
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REVIEWS_DIR = join(ROOT, 'data', 'reviews');

const VERDICTS = new Set(['exemplary', 'acceptable', 'weak', 'failed']);

const AXES_BY_PERSONA = {
  skeptical_researcher: ['equation_validity', 'logical_consistency', 'citation_relevance'],
  naive_reader:         ['readability', 'abstract_hook', 'curiosity_score'],
  internal_audit:       ['condescension_fidelity', 'academic_form', 'constitution_compliance'],
};

function validate(review) {
  const errors = [];

  if (typeof review !== 'object' || review === null) {
    return ['ルートがオブジェクトではありません'];
  }

  if (!review.paper_id || !/^[a-z0-9-]+$/.test(review.paper_id)) {
    errors.push('paper_id がないか kebab-case でない');
  }
  if (!review.reviewed_at || isNaN(Date.parse(review.reviewed_at))) {
    errors.push('reviewed_at が ISO8601 でない');
  }
  if (!review.reviewer_model) errors.push('reviewer_model がない');
  if (!Number.isInteger(review.generation) || review.generation < 0) {
    errors.push('generation は 0 以上の整数');
  }

  if (!review.personas) {
    errors.push('personas オブジェクトがない');
  } else {
    for (const [persona, axes] of Object.entries(AXES_BY_PERSONA)) {
      const p = review.personas[persona];
      if (!p) {
        errors.push(`personas.${persona} がない`);
        continue;
      }
      if (!p.comment || p.comment.length < 80) {
        errors.push(`personas.${persona}.comment が短すぎる（80字以上）`);
      }
      if (!p.axes) {
        errors.push(`personas.${persona}.axes がない`);
        continue;
      }
      for (const ax of axes) {
        const v = p.axes[ax];
        if (!Number.isInteger(v) || v < 0 || v > 100) {
          errors.push(`personas.${persona}.axes.${ax} は 0〜100 の整数`);
        }
      }
    }
  }

  if (!review.aggregate) {
    errors.push('aggregate オブジェクトがない');
  } else {
    const a = review.aggregate;
    if (typeof a.mean_score !== 'number' || a.mean_score < 0 || a.mean_score > 100) {
      errors.push('aggregate.mean_score は 0〜100');
    }
    if (!Number.isInteger(a.min_score) || a.min_score < 0 || a.min_score > 100) {
      errors.push('aggregate.min_score は 0〜100 の整数');
    }
    if (!VERDICTS.has(a.verdict)) {
      errors.push(`aggregate.verdict は ${[...VERDICTS].join('/')}`);
    }
    if (!Array.isArray(a.notable_strengths) || a.notable_strengths.length > 3) {
      errors.push('aggregate.notable_strengths は配列で最大 3 件');
    }
    if (!Array.isArray(a.notable_weaknesses) || a.notable_weaknesses.length > 3) {
      errors.push('aggregate.notable_weaknesses は配列で最大 3 件');
    }
  }

  return errors;
}

// -- エントリーポイント --
const args = process.argv.slice(2);
const allMode = args.includes('--all');

let targets;
if (allMode) {
  if (!existsSync(REVIEWS_DIR)) {
    console.log('data/reviews/ がまだ存在しません。');
    process.exit(0);
  }
  targets = readdirSync(REVIEWS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => join(REVIEWS_DIR, f));
} else {
  targets = args.filter(a => !a.startsWith('--'));
}

if (targets.length === 0) {
  console.log('検証対象がありません。');
  process.exit(0);
}

let hasErrors = false;
for (const path of targets) {
  if (!existsSync(path)) {
    console.error(`✗ ファイルが存在しません: ${path}`);
    hasErrors = true;
    continue;
  }
  let review;
  try {
    review = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    console.error(`✗ ${path} — JSONパースエラー: ${e.message}`);
    hasErrors = true;
    continue;
  }
  const errs = validate(review);
  if (errs.length === 0) {
    console.log(`✅ ${path}`);
  } else {
    console.error(`✗ ${path}`);
    errs.forEach(e => console.error(`   - ${e}`));
    hasErrors = true;
  }
}

process.exit(hasErrors ? 1 : 0);
