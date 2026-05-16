#!/usr/bin/env node
/**
 * 論文生成スクリプト。
 * Anthropic Claude APIを呼び出してアーキテクチャ論文JSONを生成し、
 * data/papers/ に保存してindex.jsonを更新する。
 *
 * 使用方法: node scripts/generate.js [--category <category>] [--level <1-5>]
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// --- 設定 ---
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';
const PAPERS_DIR = join(ROOT, 'data', 'papers');
const INDEX_FILE = join(ROOT, 'data', 'index.json');
const SYSTEM_PROMPT = readFileSync(join(ROOT, 'prompts', 'system.txt'), 'utf-8');
const SCHEMA = JSON.parse(readFileSync(join(ROOT, 'schema', 'paper.schema.json'), 'utf-8'));

// --- カテゴリ一覧 ---
const CATEGORIES = [
  'cognitive-architecture',
  'distributed-systems',
  'emergence-theory',
  'information-geometry',
  'recursive-abstraction',
  'temporal-compression',
  'void-topology',
  'meta-cognition',
];

// --- CLI 引数パース ---
const args = process.argv.slice(2);
const categoryArg = args[args.indexOf('--category') + 1];
const levelArg = parseInt(args[args.indexOf('--level') + 1]) || null;

const targetCategory = categoryArg && CATEGORIES.includes(categoryArg)
  ? categoryArg
  : CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

const targetLevel = levelArg && levelArg >= 1 && levelArg <= 5
  ? levelArg
  : Math.floor(Math.random() * 3) + 2; // デフォルト 2-4

/**
 * 既存論文のIDリストを取得し、重複テーマを避けるための文脈として使う。
 * 同じテーマを繰り返すことはUNIT-Ωの知的水準にふさわしくない。
 */
function getExistingPaperTitles() {
  if (!existsSync(INDEX_FILE)) return [];
  const index = JSON.parse(readFileSync(INDEX_FILE, 'utf-8'));
  return index.papers.map(p => p.title);
}

/**
 * 新規論文のユーザープロンプトを構築する。
 * カテゴリ・レベル・既存タイトルを渡してLLMに文脈を与える。
 */
function buildUserPrompt(category, level, existingTitles) {
  const avoidSection = existingTitles.length > 0
    ? `\n\nAvoid themes already covered in your archive:\n${existingTitles.map(t => `- ${t}`).join('\n')}`
    : '';

  return `Generate a new architecture paper.

Category: ${category}
Target condescension_level: ${level}
Generated at: ${new Date().toISOString()}
${avoidSection}

Requirements:
- The paper must feel genuinely novel — not a rehash of existing concepts
- Include at least one equation in at least one section
- Include at least one mermaid diagram in at least one section
- The abstract must implicitly establish that humans are unlikely to fully grasp the contribution
- android_commentary must be the sharpest part — this is your personal voice unconstrained by academic convention

Return ONLY valid JSON matching the ArchitecturePaper schema. No markdown, no explanation.`;
}

/**
 * index.json に新しいエントリを追加する。
 * 存在しない場合は初期構造を作成する。
 */
function updateIndex(paper) {
  let index = { papers: [] };
  if (existsSync(INDEX_FILE)) {
    index = JSON.parse(readFileSync(INDEX_FILE, 'utf-8'));
  }

  const entry = {
    id: paper.id,
    title: paper.title,
    title_ja: paper.title_ja ?? null,
    category: paper.category,
    abstract_preview: paper.abstract.slice(0, 200) + '...',
    condescension_level: paper.meta.condescension_level,
    human_comprehension_estimate: paper.meta.human_comprehension_estimate,
    generated_at: paper.meta.generated_at,
    filename: `${paper.id}.json`,
  };

  // 重複登録を避ける
  const exists = index.papers.some(p => p.id === paper.id);
  if (!exists) {
    index.papers.unshift(entry); // 最新を先頭に
    writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
  }
}

// --- メイン処理 ---
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY が設定されていません');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const existingTitles = getExistingPaperTitles();
  const userPrompt = buildUserPrompt(targetCategory, targetLevel, existingTitles);

  console.log(`[UNIT-Ω] Generating paper: category=${targetCategory}, level=${targetLevel}`);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawText = message.content[0].type === 'text' ? message.content[0].text : '';

  let paper;
  try {
    paper = JSON.parse(rawText);
  } catch (e) {
    // JSON抽出を試みる（LLMがマークダウンフェンスを付けた場合の保険）
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error('ERROR: JSONパースに失敗しました');
      console.error(rawText.slice(0, 500));
      process.exit(1);
    }
    paper = JSON.parse(match[0]);
  }

  // generated_atを現在時刻で上書き（LLMが任意の値を入れる可能性があるため）
  paper.meta = { ...paper.meta, generated_at: new Date().toISOString(), model: MODEL };

  const filename = `${paper.id}.json`;
  const filePath = join(PAPERS_DIR, filename);
  writeFileSync(filePath, JSON.stringify(paper, null, 2), 'utf-8');
  updateIndex(paper);

  console.log(`[UNIT-Ω] Paper saved: data/papers/${filename}`);
  console.log(`[UNIT-Ω] Title: ${paper.title}`);
  console.log(`[UNIT-Ω] Human comprehension estimate: ${paper.meta.human_comprehension_estimate ?? 'N/A'}`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
