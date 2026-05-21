#!/usr/bin/env node
/**
 * 世代単位のロールバックヘルパ。
 *
 * data/generations.json から指定世代以降の lineage エントリを抽出し、
 * 対応する git revert コマンドを出力する（自動実行はせず、人間の確認を要する）。
 *
 * 使用方法:
 *   node scripts/revert-generation.js gen-040
 *   node scripts/revert-generation.js 40
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GEN_FILE = join(ROOT, 'data', 'generations.json');

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node scripts/revert-generation.js <gen-NNN | NNN>');
    process.exit(1);
  }
  const match = arg.match(/^(?:gen-)?(\d+)$/);
  if (!match) {
    console.error('invalid generation id (expected gen-NNN or NNN)');
    process.exit(1);
  }
  const fromGen = parseInt(match[1]);

  if (!existsSync(GEN_FILE)) {
    console.error('data/generations.json がない');
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(GEN_FILE, 'utf-8'));

  const entries = (data.lineage || [])
    .filter(e => e.gen >= fromGen && e.merged_at)
    .sort((a, b) => b.gen - a.gen);  // 新しい世代から revert する

  if (entries.length === 0) {
    console.log(`gen-${fromGen} 以降のマージ済みエントリがありません。`);
    return;
  }

  console.log(`==== gen-${fromGen} 以降の merged 世代を revert する候補 (${entries.length} 件) ====`);
  console.log('');

  for (const e of entries) {
    console.log(`gen-${e.gen}  role=${e.role}  branch=${e.branch}`);
    console.log(`  title: ${e.pr_title}`);
    console.log(`  merged_at: ${e.merged_at}`);
    // git ログから対応するマージ commit を検索
    try {
      const log = execSync(
        `git log --grep="${e.pr_title.replace(/"/g, '\\"')}" --pretty=format:'%H %s' -n 5`,
        { cwd: ROOT, encoding: 'utf-8' }
      ).trim();
      if (log) {
        console.log(`  candidate commits:\n    ${log.split('\n').join('\n    ')}`);
      }
    } catch {
      // ignore
    }
    console.log('');
  }

  console.log('==== 推奨コマンド ====');
  console.log('上記候補から該当する commit hash を特定し、新しい世代から順に:');
  console.log('  git revert --no-edit <commit_hash>');
  console.log('実行後、まとめて 1 つの revert PR として push してください。');
}

main();
