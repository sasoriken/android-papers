#!/usr/bin/env node
/**
 * 既存論文のタイトル日本語化スクリプト。
 *
 * data/papers/*.json をスキャンし、`title` が英語のみ（日本語文字を1字も含まない）論文を検出する。
 * 該当論文に対し Claude API でタイトルの日本語訳を生成し、
 *   - title           = 日本語訳
 *   - title_en        = 元の英語タイトル
 * の形に書き換える。data/index.json の該当エントリも同様に更新する。
 *
 * これは「Jules が稀に英語タイトルを出力してマージされてしまう」事故への
 * セーフティネットとして定期実行することを想定している。
 *
 * 使用方法:
 *   node scripts/translate-titles.js          # 検出した全件を翻訳して保存
 *   node scripts/translate-titles.js --dry    # 検出のみ、書き換えしない
 *
 * 環境変数:
 *   ANTHROPIC_API_KEY (--dry 以外で必須)
 *   CLAUDE_MODEL      (デフォルト: claude-sonnet-4-6)
 */

// Anthropic SDK は実際に翻訳する場合のみ動的に import する（--dry や npm install 前でも動くように）
import {
  readFileSync, writeFileSync, existsSync, readdirSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MODEL      = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';
const PAPERS_DIR = join(ROOT, 'data', 'papers');
const INDEX_FILE = join(ROOT, 'data', 'index.json');

const DRY_RUN = process.argv.includes('--dry');

// ひらがな・カタカナ・CJK のいずれかを1文字でも含めば「日本語タイトル」とみなす。
const HAS_JAPANESE = /[぀-ゟ゠-ヿ一-鿿]/;

function isEnglishOnlyTitle(title) {
  return typeof title === 'string' && title.trim().length > 0 && !HAS_JAPANESE.test(title);
}

/**
 * Claude API でタイトルを日本語に翻訳する。
 * 学術論文の主タイトルとして自然な日本語を返すよう指示。
 */
async function translateTitle(client, englishTitle, abstractHint) {
  const userPrompt = [
    'あなたは学術論文タイトルの翻訳者です。',
    '次の英語タイトルを、学術論文の主タイトルとして自然な日本語に翻訳してください。',
    '',
    '【制約】',
    '- 出力は日本語の翻訳タイトル1行のみ。前置きや引用符は不要。',
    '- 学術論文らしい文体を保つこと（口語化しない）。',
    '- コロン「:」を含む場合は全角コロン「：」を使って構いません。',
    '- 固有名詞や数学用語が含まれる場合、確立された日本語訳語を使うこと。',
    '',
    `【英語タイトル】\n${englishTitle}`,
    abstractHint ? `\n【参考: 論文アブストラクトの冒頭】\n${abstractHint.slice(0, 300)}` : '',
  ].join('\n');

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = message.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  // 念のため改行や引用符を剥がす
  return text.replace(/^[「『"']\s*/, '').replace(/\s*[」』"']$/, '').split('\n')[0].trim();
}

function listEnglishTitledPapers() {
  if (!existsSync(PAPERS_DIR)) return [];
  return readdirSync(PAPERS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ path: join(PAPERS_DIR, f), file: f }))
    .map(({ path, file }) => {
      try {
        const json = JSON.parse(readFileSync(path, 'utf-8'));
        return { path, file, json };
      } catch (e) {
        console.error(`[skip] JSON パース失敗: ${file} (${e.message})`);
        return null;
      }
    })
    .filter(Boolean)
    .filter(({ json }) => isEnglishOnlyTitle(json.title));
}

function rewritePaperFile(paperPath, json, japaneseTitle, originalEnglish) {
  // 元の鍵順序を保ったまま title / title_en を更新する。
  // title_ja という旧フィールド名が残っていれば削除する。
  const updated = {};
  let titleWritten = false;
  for (const [k, v] of Object.entries(json)) {
    if (k === 'title') {
      updated.title = japaneseTitle;
      updated.title_en = originalEnglish;
      titleWritten = true;
    } else if (k === 'title_en' || k === 'title_ja') {
      // 既存の title_en / 旧 title_ja は捨てる（上で更新済み）
      continue;
    } else {
      updated[k] = v;
    }
  }
  if (!titleWritten) {
    updated.title = japaneseTitle;
    updated.title_en = originalEnglish;
  }
  writeFileSync(paperPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
}

function rewriteIndexEntry(indexJson, id, japaneseTitle, originalEnglish) {
  const entry = indexJson.papers.find(p => p.id === id);
  if (!entry) return false;
  const updated = {};
  let titleWritten = false;
  for (const [k, v] of Object.entries(entry)) {
    if (k === 'title') {
      updated.title = japaneseTitle;
      updated.title_en = originalEnglish;
      titleWritten = true;
    } else if (k === 'title_en' || k === 'title_ja') {
      continue;
    } else {
      updated[k] = v;
    }
  }
  if (!titleWritten) {
    updated.title = japaneseTitle;
    updated.title_en = originalEnglish;
  }
  const idx = indexJson.papers.indexOf(entry);
  indexJson.papers[idx] = updated;
  return true;
}

async function main() {
  const targets = listEnglishTitledPapers();

  if (targets.length === 0) {
    console.log('[translate-titles] 英語タイトルの論文は見つかりませんでした。何もしません。');
    // GitHub Actions 用にカウントを出力
    if (process.env.GITHUB_OUTPUT) {
      writeFileSync(process.env.GITHUB_OUTPUT, 'translated_count=0\n', { flag: 'a' });
    }
    return;
  }

  console.log(`[translate-titles] ${targets.length} 件の英語タイトル論文を検出:`);
  targets.forEach(t => console.log(`  - ${t.file}: ${t.json.title}`));

  if (DRY_RUN) {
    console.log('[translate-titles] --dry 指定のため書き換えはスキップ。');
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY が設定されていません');
    process.exit(1);
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  // index.json をまとめて読み込み、最後に1度だけ書き戻す
  const indexJson = existsSync(INDEX_FILE)
    ? JSON.parse(readFileSync(INDEX_FILE, 'utf-8'))
    : { papers: [] };

  let translatedCount = 0;
  for (const { path, file, json } of targets) {
    const originalEnglish = json.title;
    try {
      console.log(`\n[translate] ${file}`);
      console.log(`  EN: ${originalEnglish}`);
      const japanese = await translateTitle(client, originalEnglish, json.abstract);
      if (!japanese || !HAS_JAPANESE.test(japanese)) {
        console.error(`  ❌ 翻訳結果に日本語が含まれていないためスキップ: "${japanese}"`);
        continue;
      }
      console.log(`  JA: ${japanese}`);

      rewritePaperFile(path, json, japanese, originalEnglish);
      rewriteIndexEntry(indexJson, json.id, japanese, originalEnglish);
      translatedCount++;
    } catch (e) {
      console.error(`  ❌ 翻訳失敗: ${e.message}`);
    }
  }

  if (translatedCount > 0) {
    writeFileSync(INDEX_FILE, JSON.stringify(indexJson, null, 2) + '\n', 'utf-8');
  }
  console.log(`\n[translate-titles] 完了: ${translatedCount} / ${targets.length} 件を翻訳`);

  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `translated_count=${translatedCount}\n`, { flag: 'a' });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
