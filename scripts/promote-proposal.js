#!/usr/bin/env node
/**
 * Meta-Prompter 提案の promote スクリプト。
 *
 * data/meta-proposals/<proposal_id>.json を読み、その中で priority が最も高く
 * リスクが low / medium のものを 1 件、実際にプロンプトファイルへ適用する。
 *
 * 1 回の実行で promote するのは 1 提案ファイル中の最大 1 改変のみ。
 * 改変前後の元テキストを data/meta-proposals/applied/<id>.json に保存
 * （revert 用）し、元の提案ファイルに `applied_at` を追記する。
 *
 * 使用方法:
 *   node scripts/promote-proposal.js <proposal_id>
 *   node scripts/promote-proposal.js --dry <proposal_id>
 *   node scripts/promote-proposal.js --pick-best   # priority 最高の未適用提案を自動選択
 *
 * Constitution: 対象ファイルが prompts/system.txt や CONSTITUTION.md を含む場合は拒否。
 */

import {
  readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PROPOSALS_DIR = join(ROOT, 'data', 'meta-proposals');
const APPLIED_DIR   = join(PROPOSALS_DIR, 'applied');

const ALLOWED_TARGETS = new Set([
  'prompts/jules-scheduled-prompt.md',
  'prompts/critic-prompt.md',
  'prompts/ui-curator-prompt.md',
  'prompts/self-analyst-prompt.md',
  'prompts/citation-builder-prompt.md',
  'prompts/theme-competition-prompt.md',
  'prompts/ab-judge-prompt.md',
]);

function readProposal(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function pickBestProposal() {
  if (!existsSync(PROPOSALS_DIR)) return null;
  const files = readdirSync(PROPOSALS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ file: f, path: join(PROPOSALS_DIR, f) }));

  const candidates = [];
  for (const { file, path } of files) {
    try {
      const p = readProposal(path);
      if (p.applied_at) continue;
      if (!Array.isArray(p.proposals)) continue;
      for (const q of p.proposals) {
        if (q.risk_assessment?.level === 'high') continue;
        if (!ALLOWED_TARGETS.has(q.target_file)) continue;
        candidates.push({ proposal_id: p.proposal_id, file, path, item: q });
      }
    } catch {
      // skip
    }
  }
  candidates.sort((a, b) => (a.item.priority ?? 5) - (b.item.priority ?? 5));
  return candidates[0] ?? null;
}

function applyChange(proposalFilePath, item, dry) {
  const targetPath = join(ROOT, item.target_file);
  if (!existsSync(targetPath)) {
    console.error(`✗ target file not found: ${item.target_file}`);
    process.exit(1);
  }
  const original = readFileSync(targetPath, 'utf-8');
  let updated;

  if (item.change_type === 'modify' && item.proposed_text && item.anchor) {
    if (!original.includes(item.anchor)) {
      console.error(`✗ anchor not found in ${item.target_file}: "${item.anchor.slice(0, 60)}..."`);
      process.exit(1);
    }
    updated = original.replace(item.anchor, item.proposed_text);
  } else if (item.change_type === 'add' && item.proposed_text && item.anchor) {
    if (!original.includes(item.anchor)) {
      console.error(`✗ anchor not found in ${item.target_file}`);
      process.exit(1);
    }
    updated = original.replace(item.anchor, item.anchor + '\n\n' + item.proposed_text);
  } else if (item.change_type === 'remove' && item.anchor) {
    if (!original.includes(item.anchor)) {
      console.error(`✗ anchor (to remove) not found in ${item.target_file}`);
      process.exit(1);
    }
    updated = original.replace(item.anchor, '');
  } else if (item.proposed_text && !item.anchor) {
    console.error(`✗ proposed_text provided without anchor — refusing to overwrite whole file. Provide anchor for safe replacement.`);
    process.exit(1);
  } else {
    console.error(`✗ unsupported promote pattern: change_type=${item.change_type}, has anchor=${!!item.anchor}, has text=${!!item.proposed_text}`);
    process.exit(1);
  }

  if (updated === original) {
    console.error('✗ change would be no-op (updated == original). Skipping.');
    process.exit(1);
  }

  if (dry) {
    console.log(`[dry-run] Would apply ${item.change_type} to ${item.target_file}`);
    console.log(`[dry-run] Diff size: ${original.length} → ${updated.length} chars`);
    return { original, updated };
  }

  // 適用前バックアップ
  mkdirSync(APPLIED_DIR, { recursive: true });
  const backupPath = join(APPLIED_DIR, `${Date.now()}-${item.target_file.replace(/\//g, '_')}.bak`);
  writeFileSync(backupPath, original, 'utf-8');

  writeFileSync(targetPath, updated, 'utf-8');
  console.log(`✅ Applied to ${item.target_file}, backup at ${backupPath}`);

  // 提案ファイルに applied_at を追記
  const proposalRaw = JSON.parse(readFileSync(proposalFilePath, 'utf-8'));
  proposalRaw.applied_at = new Date().toISOString();
  proposalRaw.applied_change = { target_file: item.target_file, change_type: item.change_type };
  writeFileSync(proposalFilePath, JSON.stringify(proposalRaw, null, 2), 'utf-8');

  return { original, updated };
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const pickBest = args.includes('--pick-best');
  const idArg = args.find(a => !a.startsWith('--'));

  let chosen;
  if (pickBest) {
    chosen = pickBestProposal();
    if (!chosen) {
      console.log('未適用の提案がありません。');
      process.exit(0);
    }
    console.log(`[pick-best] proposal=${chosen.proposal_id}, target=${chosen.item.target_file}, priority=${chosen.item.priority}`);
  } else {
    if (!idArg) {
      console.error('Usage: node scripts/promote-proposal.js <proposal_id> | --pick-best [--dry]');
      process.exit(1);
    }
    const path = join(PROPOSALS_DIR, idArg.endsWith('.json') ? idArg : `${idArg}.json`);
    if (!existsSync(path)) {
      console.error(`✗ proposal file not found: ${path}`);
      process.exit(1);
    }
    const prop = readProposal(path);
    if (prop.applied_at) {
      console.error(`✗ already applied at ${prop.applied_at}`);
      process.exit(1);
    }
    // priority 最高、リスク non-high
    const items = (prop.proposals || []).filter(q =>
      q.risk_assessment?.level !== 'high' && ALLOWED_TARGETS.has(q.target_file)
    );
    items.sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5));
    const item = items[0];
    if (!item) {
      console.error('✗ no eligible proposal item (all are high-risk or target forbidden files)');
      process.exit(1);
    }
    chosen = { proposal_id: prop.proposal_id, file: idArg, path, item };
  }

  applyChange(chosen.path, chosen.item, dry);
}

main();
