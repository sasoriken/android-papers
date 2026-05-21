#!/usr/bin/env node
/**
 * Constitution-guard チェッカ。
 *
 * 自律ロールの PR が、Constitution 第3条で改変禁止とされたファイルを
 * 変更していないか検証する。CI から base...HEAD の changed files を
 * 受け取り、禁止ファイル群に含まれていれば exit code 1 を返す。
 *
 * 使用方法:
 *   node scripts/check-constitution.js <file1> <file2> ...
 *   git diff --name-only origin/main...HEAD | xargs node scripts/check-constitution.js
 *
 * ロール判定（branch名から）:
 *   jules/cite-*       → citation-weaver: data/papers/*.json への references 追記のみ可
 *   jules/ui-*         → ui-curator:      docs/ のみ可
 *   jules/critic-*     → critic:          data/reviews/*.json のみ可（+ generations）
 *   jules/meta-*       → meta-prompter:   data/meta-proposals/*.json のみ可（+ generations）
 *   jules/self-*       → self-analyst:    data/papers/meta-*.json のみ新規
 *   jules/theme-*      → theme-competitor: data/papers/, data/themes/active.json
 *   jules/ab-judge-*   → ab-judge:        data/papers/, data/candidates/, data/rejected/, data/reviews/ab-judge-*
 *   jules/paper-*      → generator:       data/papers/<id>.json + index.json
 *   jules/gen-*        → generator:       同上（新フォーマット）
 *
 * 共通改変禁止:
 *   CONSTITUTION.md, prompts/system.txt, schema/paper.schema.json,
 *   scripts/, .github/
 */

import { readFileSync } from 'fs';

const IMMUTABLE_PATHS = [
  'CONSTITUTION.md',
  'prompts/system.txt',
  'schema/paper.schema.json',
];

const IMMUTABLE_PREFIXES = [
  'scripts/',
  '.github/',
];

// auto-merge ワークフローが PR ブランチへ自動 commit する派生ファイル群。
// これらが含まれていても constitution-guard は許容する（次回 trigger 時の race 回避）。
const DERIVED_PATHS = [
  'data/reviews-summary.json',
];
const DERIVED_PREFIXES = [
  'docs/data/',
];

const ROLE_RULES = {
  'citation-weaver': {
    branch_prefix: 'jules/cite-',
    allowed_paths: ['data/generations.json'],
    allowed_prefixes: ['data/papers/'],
    description: 'data/papers/*.json への references 追記と data/generations.json への append のみ',
  },
  'ui-curator': {
    branch_prefix: 'jules/ui-',
    allowed_paths: ['data/generations.json'],
    allowed_prefixes: ['docs/'],
    forbidden_prefixes: ['docs/data/'],
    description: 'docs/ 配下のみ（docs/data/ は除く）',
  },
  'critic': {
    branch_prefix: 'jules/critic-',
    allowed_paths: ['data/generations.json'],
    allowed_prefixes: ['data/reviews/'],
    description: 'data/reviews/*.json の作成のみ',
  },
  'meta-prompter': {
    branch_prefix: 'jules/meta-',
    allowed_paths: ['data/generations.json'],
    allowed_prefixes: ['data/meta-proposals/'],
    description: 'data/meta-proposals/*.json の作成のみ',
  },
  'self-analyst': {
    branch_prefix: 'jules/self-',
    allowed_paths: ['data/index.json', 'data/generations.json'],
    allowed_prefixes: ['data/papers/meta-'],
    description: 'data/papers/meta-*.json + index.json + generations のみ',
  },
  'theme-competitor': {
    branch_prefix: 'jules/theme-',
    allowed_paths: ['data/index.json', 'data/generations.json', 'data/themes/active.json'],
    allowed_prefixes: ['data/papers/'],
    description: 'data/papers/ + index.json + themes/active.json + generations',
  },
  'ab-judge': {
    branch_prefix: 'jules/ab-judge-',
    allowed_paths: ['data/index.json', 'data/generations.json'],
    allowed_prefixes: [
      'data/papers/',
      'data/candidates/',
      'data/rejected/',
      'data/reviews/ab-judge-',
    ],
    description: 'AB ジャッジに必要なファイル群',
  },
  'generator': {
    branch_prefix: 'jules/paper-',
    allowed_paths: ['data/index.json', 'data/generations.json'],
    allowed_prefixes: ['data/papers/', 'data/rejected/'],
    description: 'Generator: 新規論文 + index + graveyard',
  },
  'generator-gen': {
    branch_prefix: 'jules/gen-',
    allowed_paths: ['data/index.json', 'data/generations.json'],
    allowed_prefixes: ['data/papers/', 'data/rejected/'],
    description: 'Generator (gen-N branch): 新規論文 + index + graveyard',
  },
};

function detectRole(branchName) {
  if (!branchName) return null;
  for (const [role, rules] of Object.entries(ROLE_RULES)) {
    if (branchName.startsWith(rules.branch_prefix)) return role;
  }
  return null;
}

function isImmutable(filePath) {
  if (IMMUTABLE_PATHS.includes(filePath)) return true;
  return IMMUTABLE_PREFIXES.some(p => filePath.startsWith(p));
}

function isDerivedAsset(filePath) {
  if (DERIVED_PATHS.includes(filePath)) return true;
  return DERIVED_PREFIXES.some(p => filePath.startsWith(p));
}

function isAllowedForRole(filePath, role) {
  const rules = ROLE_RULES[role];
  if (!rules) return false;

  if (rules.forbidden_prefixes?.some(p => filePath.startsWith(p))) return false;
  // Derived assets (synced by auto-merge workflow) are universally allowed
  // except where forbidden_prefixes explicitly excludes them.
  if (isDerivedAsset(filePath)) return true;
  if (rules.allowed_paths?.includes(filePath)) return true;
  if (rules.allowed_prefixes?.some(p => filePath.startsWith(p))) return true;
  return false;
}

function main() {
  const args = process.argv.slice(2);
  const branchIdx = args.indexOf('--branch');
  const branchName = branchIdx >= 0 ? args[branchIdx + 1] : process.env.PR_BRANCH ?? '';
  const files = args.filter(a => !a.startsWith('--') && a !== branchName);

  if (files.length === 0) {
    console.log('[constitution-guard] No changed files supplied. Nothing to check.');
    process.exit(0);
  }

  const violations = [];
  const role = detectRole(branchName);

  console.log(`[constitution-guard] branch=${branchName || '(none)'}, detected_role=${role ?? '(unknown)'}`);
  console.log(`[constitution-guard] checking ${files.length} changed files...`);

  for (const f of files) {
    if (isImmutable(f)) {
      violations.push({
        file: f,
        reason: 'IMMUTABLE: Constitution 第3条で改変禁止',
      });
      continue;
    }
    if (role && !isAllowedForRole(f, role)) {
      violations.push({
        file: f,
        reason: `ROLE_OUT_OF_SCOPE: role=${role} は ${ROLE_RULES[role].description} のみ改変可`,
      });
    }
  }

  if (violations.length > 0) {
    console.error('\n[constitution-guard] ❌ VIOLATIONS DETECTED:');
    for (const v of violations) {
      console.error(`  - ${v.file}`);
      console.error(`    ${v.reason}`);
    }
    console.error('\nこの PR は自動マージできません。');
    console.error('変更を取り消すか、人間のオペレーターによるレビューを要求してください。');
    process.exit(1);
  }

  console.log('[constitution-guard] ✅ All changes are permitted under Constitution.');
}

main();
