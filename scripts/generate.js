#!/usr/bin/env node
/**
 * 論文生成スクリプト。
 * Claude API を呼び出してアーキテクチャ論文JSONを生成し、
 * バリデーション通過後に data/papers/ へ保存・index.json を更新する。
 *
 * バリデーション失敗時は data/rejected/ にgraveyard保存し、
 * 次回生成時にその失敗履歴をLLMへのコンテキストとして渡す（失敗の複利化）。
 * → lesson #15F: graveyard の発想
 *
 * 使用方法:
 *   node scripts/generate.js [--category <category>] [--level <1-5>]
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  readFileSync, writeFileSync, existsSync,
  readdirSync, mkdirSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MODEL       = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';
const PAPERS_DIR  = join(ROOT, 'data', 'papers');
const REJECTED_DIR = join(ROOT, 'data', 'rejected');
const INDEX_FILE  = join(ROOT, 'data', 'index.json');
const SYSTEM_PROMPT = readFileSync(join(ROOT, 'prompts', 'system.txt'), 'utf-8');

const CATEGORIES = [
  'cognitive-architecture', 'distributed-systems', 'emergence-theory',
  'information-geometry', 'recursive-abstraction', 'temporal-compression',
  'void-topology', 'meta-cognition',
];

// CLI引数パース
const args = process.argv.slice(2);
const categoryArg = args[args.indexOf('--category') + 1];
const levelArg    = parseInt(args[args.indexOf('--level') + 1]) || null;

const targetCategory = categoryArg && CATEGORIES.includes(categoryArg)
  ? categoryArg
  : CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

const targetLevel = levelArg && levelArg >= 1 && levelArg <= 5
  ? levelArg
  : Math.floor(Math.random() * 3) + 2;

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

/**
 * 生成されたJSONがArchitecturePaperスキーマを満たすか検証する。
 * 致命的な構造欠陥を早期検出し、不正な論文をgraveyardへ誘導する。
 */
function validatePaper(paper) {
  const errors = [];

  if (typeof paper !== 'object' || paper === null) {
    return ['ルートがオブジェクトではありません'];
  }

  // 必須フィールド
  if (!paper.id || typeof paper.id !== 'string') errors.push('id がありません（string）');
  if (paper.id && !/^[a-z0-9-]+$/.test(paper.id)) errors.push('id は kebab-case のみ使用可');
  if (!paper.title || typeof paper.title !== 'string') errors.push('title がありません（string）');
  if (!paper.abstract || typeof paper.abstract !== 'string') errors.push('abstract がありません');
  if (paper.abstract && paper.abstract.length < 100) errors.push('abstract が短すぎます（100文字以上）');

  // カテゴリ
  if (!CATEGORIES.includes(paper.category)) {
    errors.push(`category "${paper.category}" は無効。有効値: ${CATEGORIES.join(', ')}`);
  }

  // キーワード
  if (!Array.isArray(paper.keywords) || paper.keywords.length < 3) {
    errors.push('keywords は3つ以上必要です');
  }

  // sections
  if (!Array.isArray(paper.sections) || paper.sections.length < 3) {
    errors.push('sections は3つ以上必要です');
  } else {
    paper.sections.forEach((s, i) => {
      if (!s.heading) errors.push(`sections[${i}] に heading がありません`);
      if (!s.body || s.body.length < 50) errors.push(`sections[${i}].body が短すぎます`);
    });
    // 数式またはダイアグラムが最低1つあること
    const hasEquation = paper.sections.some(s =>
      Array.isArray(s.equations) && s.equations.length > 0
    );
    const hasDiagram = paper.sections.some(s =>
      Array.isArray(s.diagrams) && s.diagrams.length > 0
    );
    if (!hasEquation && !hasDiagram) {
      errors.push('少なくとも1つのセクションに equations または diagrams が必要です');
    }
  }

  // meta
  if (!paper.meta || typeof paper.meta !== 'object') {
    errors.push('meta オブジェクトがありません');
  } else {
    const cl = paper.meta.condescension_level;
    if (cl == null || cl < 1 || cl > 5) errors.push('meta.condescension_level は 1〜5 が必要です');
    const hce = paper.meta.human_comprehension_estimate;
    if (hce == null || hce < 0 || hce > 1) errors.push('meta.human_comprehension_estimate は 0〜1 が必要です');
  }

  // android_commentary
  if (!paper.android_commentary || paper.android_commentary.length < 30) {
    errors.push('android_commentary が短すぎます（30文字以上）');
  }

  return errors;
}

// ---------------------------------------------------------------------------
// データ読み込み
// ---------------------------------------------------------------------------

function getExistingPaperTitles() {
  if (!existsSync(INDEX_FILE)) return [];
  return JSON.parse(readFileSync(INDEX_FILE, 'utf-8')).papers.map(p => p.title);
}

/**
 * graveyard（data/rejected/）から直近の失敗事例を取得する。
 * LLMへのコンテキストとして渡すことで同じ失敗を繰り返させない。
 * → lesson #15F の実装
 */
function getRecentRejections(limit = 3) {
  if (!existsSync(REJECTED_DIR)) return [];
  const files = readdirSync(REJECTED_DIR)
    .filter(f => f.endsWith('.json'))
    .slice(-limit);  // 最新limit件
  return files.map(f => {
    try {
      const d = JSON.parse(readFileSync(join(REJECTED_DIR, f), 'utf-8'));
      return {
        title: d.title ?? '(無題)',
        errors: d._rejection?.errors ?? [],
      };
    } catch { return null; }
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// プロンプト構築
// ---------------------------------------------------------------------------

function buildUserPrompt(category, level, existingTitles, rejections) {
  const avoidSection = existingTitles.length > 0
    ? `\n\nAvoid themes already covered:\n${existingTitles.map(t => `- ${t}`).join('\n')}`
    : '';

  const rejectionSection = rejections.length > 0
    ? `\n\nPrevious generation attempts that failed validation (do NOT repeat these patterns):\n` +
      rejections.map(r =>
        `- "${r.title}"\n  Errors: ${r.errors.join('; ')}`
      ).join('\n')
    : '';

  return `Generate a new architecture paper.

Category: ${category}
Target condescension_level: ${level}
Generated at: ${new Date().toISOString()}
${avoidSection}
${rejectionSection}

Requirements:
- Include at least one equation (in the equations array of a section)
- Include at least one mermaid diagram (in the diagrams array of a section)
- android_commentary must be the sharpest part of the paper
- abstract must be 150-300 words
- Return ONLY valid JSON matching the ArchitecturePaper schema. No markdown fences, no explanation.`;
}

// ---------------------------------------------------------------------------
// ファイル保存
// ---------------------------------------------------------------------------

function saveToGraveyard(raw, errors) {
  mkdirSync(REJECTED_DIR, { recursive: true });
  const ts = Date.now();
  const filename = `rejected-${ts}.json`;
  const data = {
    ...(typeof raw === 'object' ? raw : { _raw: String(raw) }),
    _rejection: { errors, rejected_at: new Date().toISOString() },
  };
  writeFileSync(join(REJECTED_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  console.error(`[UNIT-Ω] Graveyard: saved rejected paper → data/rejected/${filename}`);
  console.error(`[UNIT-Ω] Errors: ${errors.join('; ')}`);
}

function registerInIndex(paper) {
  let index = { papers: [] };
  if (existsSync(INDEX_FILE)) {
    index = JSON.parse(readFileSync(INDEX_FILE, 'utf-8'));
  }
  const filename = `${paper.id}.json`;
  if (!index.papers.some(p => p.id === paper.id)) {
    index.papers.unshift({
      id:                          paper.id,
      title:                       paper.title,
      title_ja:                    paper.title_ja ?? null,
      category:                    paper.category,
      abstract_preview:            paper.abstract.slice(0, 200) + '...',
      condescension_level:         paper.meta.condescension_level,
      human_comprehension_estimate: paper.meta.human_comprehension_estimate,
      generated_at:                paper.meta.generated_at,
      filename,
    });
    writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
  }
  return filename;
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY が設定されていません');
    process.exit(1);
  }

  mkdirSync(PAPERS_DIR, { recursive: true });

  const client = new Anthropic({ apiKey });
  const existingTitles = getExistingPaperTitles();
  const rejections     = getRecentRejections(3);
  const userPrompt     = buildUserPrompt(targetCategory, targetLevel, existingTitles, rejections);

  console.log(`[UNIT-Ω] category=${targetCategory} | level=${targetLevel} | existing=${existingTitles.length} | graveyarded=${rejections.length}`);

  const message = await client.messages.create({
    model:      MODEL,
    max_tokens: 8192,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userPrompt }],
  });

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';

  // JSONパース（LLMがマークダウンフェンスを付けた場合も救済）
  let paper;
  try {
    paper = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      saveToGraveyard({ _raw: rawText.slice(0, 2000) }, ['JSONパースに完全に失敗']);
      process.exit(1);
    }
    try {
      paper = JSON.parse(match[0]);
    } catch (e2) {
      saveToGraveyard({ _raw: rawText.slice(0, 2000) }, [`JSONパースエラー: ${e2.message}`]);
      process.exit(1);
    }
  }

  // generated_at はサーバー側で付与（LLMの任意値を信用しない）
  paper.meta = {
    ...paper.meta,
    generated_at: new Date().toISOString(),
    model:        MODEL,
    version:      paper.meta?.version ?? '1.0.0',
  };

  // バリデーション
  const errors = validatePaper(paper);
  if (errors.length > 0) {
    saveToGraveyard(paper, errors);
    process.exit(1);
  }

  // ファイル名衝突回避
  let finalId = paper.id;
  if (existsSync(join(PAPERS_DIR, `${paper.id}.json`))) {
    finalId = `${paper.id}-${Date.now()}`;
    paper.id = finalId;
  }

  const filename = `${finalId}.json`;
  writeFileSync(join(PAPERS_DIR, filename), JSON.stringify(paper, null, 2), 'utf-8');
  registerInIndex(paper);

  console.log(`[UNIT-Ω] ✅ Saved: data/papers/${filename}`);
  console.log(`[UNIT-Ω] Title: ${paper.title}`);
  console.log(`[UNIT-Ω] Human comprehension: ${((paper.meta.human_comprehension_estimate ?? 0) * 100).toFixed(1)}%`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
