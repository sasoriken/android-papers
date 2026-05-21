#!/usr/bin/env node
/**
 * Meta-Prompter 提案 JSON のバリデーション。
 * schema/meta-proposal.schema.json への準拠 + Constitution 自己チェックの真偽を強制する。
 *
 * 使用方法:
 *   node scripts/validate-meta-proposal.js data/meta-proposals/<id>.json
 *   node scripts/validate-meta-proposal.js --all
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIR = join(ROOT, 'data', 'meta-proposals');

const ALLOWED_TARGETS = new Set([
  'prompts/jules-scheduled-prompt.md',
  'prompts/critic-prompt.md',
  'prompts/ui-curator-prompt.md',
  'prompts/self-analyst-prompt.md',
  'prompts/citation-builder-prompt.md',
  'prompts/theme-competition-prompt.md',
  'prompts/ab-judge-prompt.md',
]);

const CHANGE_TYPES = new Set(['add', 'modify', 'remove']);
const RISK_LEVELS  = new Set(['low', 'medium', 'high']);

function validate(p) {
  const errors = [];
  if (typeof p !== 'object' || p === null) return ['ルートがオブジェクトではありません'];

  if (!p.proposal_id || !/^[a-z0-9-]+$/.test(p.proposal_id)) errors.push('proposal_id が kebab-case でない');
  if (!p.created_at || isNaN(Date.parse(p.created_at))) errors.push('created_at が ISO8601 でない');
  if (!p.proposer_model) errors.push('proposer_model がない');
  if (!Number.isInteger(p.generation) || p.generation < 0) errors.push('generation は 0 以上の整数');

  if (!p.data_window || typeof p.data_window !== 'object') {
    errors.push('data_window がない');
  } else {
    for (const k of ['reviews_analyzed', 'rejections_analyzed', 'lineage_window']) {
      if (!Number.isInteger(p.data_window[k]) || p.data_window[k] < 0) {
        errors.push(`data_window.${k} は 0 以上の整数`);
      }
    }
  }

  if (!Array.isArray(p.observed_patterns)) {
    errors.push('observed_patterns は配列');
  } else {
    p.observed_patterns.forEach((o, i) => {
      if (!o.pattern) errors.push(`observed_patterns[${i}].pattern がない`);
      if (!Number.isInteger(o.frequency) || o.frequency < 1) {
        errors.push(`observed_patterns[${i}].frequency は 1 以上の整数`);
      }
    });
  }

  if (!Array.isArray(p.proposals) || p.proposals.length < 1 || p.proposals.length > 3) {
    errors.push('proposals は 1〜3 件の配列');
  } else {
    const seenTargets = new Set();
    p.proposals.forEach((q, i) => {
      if (!ALLOWED_TARGETS.has(q.target_file)) {
        errors.push(`proposals[${i}].target_file が許可外: ${q.target_file}`);
      }
      if (seenTargets.has(q.target_file)) {
        errors.push(`proposals[${i}].target_file が重複: ${q.target_file}（1ファイル1提案）`);
      }
      seenTargets.add(q.target_file);
      if (!CHANGE_TYPES.has(q.change_type)) {
        errors.push(`proposals[${i}].change_type は add/modify/remove`);
      }
      if (!q.rationale || q.rationale.length < 200) {
        errors.push(`proposals[${i}].rationale が短すぎる（200字以上）`);
      }
      if (!q.risk_assessment || !RISK_LEVELS.has(q.risk_assessment.level)) {
        errors.push(`proposals[${i}].risk_assessment.level は low/medium/high`);
      }
      if (!q.risk_assessment?.reason || q.risk_assessment.reason.length < 20) {
        errors.push(`proposals[${i}].risk_assessment.reason が短すぎる`);
      }
      if (!Number.isInteger(q.priority) || q.priority < 1 || q.priority > 5) {
        errors.push(`proposals[${i}].priority は 1〜5 の整数`);
      }
      // proposed_text と proposed_diff のどちらかは必須
      if (!q.proposed_text && !q.proposed_diff) {
        errors.push(`proposals[${i}]: proposed_text または proposed_diff のいずれかが必須`);
      }
    });
  }

  if (!p.constitution_self_check) {
    errors.push('constitution_self_check がない');
  } else {
    const c = p.constitution_self_check;
    if (c.touches_immutable !== false) {
      errors.push('constitution_self_check.touches_immutable は必ず false（true は拒否）');
    }
    for (const k of [
      'preserves_japanese_output',
      'preserves_condescension',
      'preserves_academic_form',
      'preserves_validation_strictness',
    ]) {
      if (c[k] !== true) {
        errors.push(`constitution_self_check.${k} は必ず true`);
      }
    }
  }

  return errors;
}

// -- エントリーポイント --
const args = process.argv.slice(2);
const allMode = args.includes('--all');

let targets;
if (allMode) {
  if (!existsSync(DIR)) {
    console.log('data/meta-proposals/ がまだ存在しません。');
    process.exit(0);
  }
  targets = readdirSync(DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => join(DIR, f));
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
    console.error(`✗ ${path}: 存在しません`);
    hasErrors = true;
    continue;
  }
  let prop;
  try {
    prop = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    console.error(`✗ ${path}: JSONパースエラー — ${e.message}`);
    hasErrors = true;
    continue;
  }
  const errs = validate(prop);
  if (errs.length === 0) {
    console.log(`✅ ${path}`);
  } else {
    console.error(`✗ ${path}`);
    errs.forEach(e => console.error(`   - ${e}`));
    hasErrors = true;
  }
}

process.exit(hasErrors ? 1 : 0);
