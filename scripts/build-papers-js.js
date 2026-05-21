#!/usr/bin/env node
/**
 * docs/data/papers.js を構築する。
 *
 * 入力:
 *   data/index.json
 *   data/papers/*.json
 *   data/reviews/*.json          (Critic が出力したレビュー)
 *   data/generations.json        (世代履歴)
 *   data/reviews-summary.json    (aggregate-reviews.js の出力)
 *
 * 出力:
 *   docs/data/papers.js          window.__ARCHIVE_DATA__ にすべてを inline
 *
 * GitHub Pages は file:// 経由で fetch が制限されるため、papers.js への inline
 * を提供し、UI はこれを fallback として使う。docs/data/ への JSON 同期は
 * auto-merge.yml が別ステップで行う。
 *
 * 使用方法:
 *   node scripts/build-papers-js.js
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SRC_INDEX        = join(ROOT, 'data', 'index.json');
const SRC_PAPERS       = join(ROOT, 'data', 'papers');
const SRC_REVIEWS      = join(ROOT, 'data', 'reviews');
const SRC_GENERATIONS  = join(ROOT, 'data', 'generations.json');
const SRC_SUMMARY      = join(ROOT, 'data', 'reviews-summary.json');

const OUT_DIR          = join(ROOT, 'docs', 'data');
const OUT_PAPERS_JS    = join(OUT_DIR, 'papers.js');

function safeReadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf-8')); }
  catch { return fallback; }
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // index
  const index = safeReadJson(SRC_INDEX, { papers: [] });

  // papers (full content for inline access)
  const papers = {};
  if (existsSync(SRC_PAPERS)) {
    for (const f of readdirSync(SRC_PAPERS).filter(f => f.endsWith('.json'))) {
      const p = safeReadJson(join(SRC_PAPERS, f), null);
      if (p) papers[f] = p;
    }
  }

  // reviews (compact per paper)
  const reviews = {};
  if (existsSync(SRC_REVIEWS)) {
    for (const f of readdirSync(SRC_REVIEWS).filter(f => f.endsWith('.json'))) {
      const r = safeReadJson(join(SRC_REVIEWS, f), null);
      if (!r || !r.paper_id) continue;
      reviews[r.paper_id] = {
        mean_score:         r.aggregate?.mean_score,
        min_score:          r.aggregate?.min_score,
        verdict:            r.aggregate?.verdict,
        notable_strengths:  r.aggregate?.notable_strengths || [],
        notable_weaknesses: r.aggregate?.notable_weaknesses || [],
        personas: {
          skeptical_researcher: r.personas?.skeptical_researcher,
          naive_reader:         r.personas?.naive_reader,
          internal_audit:       r.personas?.internal_audit,
        },
        reviewed_at: r.reviewed_at,
        generation:  r.generation,
      };
    }
  }

  // generations (last 50 entries to keep payload sane)
  const gFull = safeReadJson(SRC_GENERATIONS, null);
  const generations = gFull ? {
    current_generation: gFull.current_generation,
    started_at:         gFull.started_at,
    lineage:            (gFull.lineage || []).slice(-50),
  } : null;

  // reviews summary
  const reviews_summary = safeReadJson(SRC_SUMMARY, null);

  const payload = { index, papers, reviews, generations, reviews_summary };
  const js = '// Auto-generated — do not edit manually\nwindow.__ARCHIVE_DATA__ = ' +
    JSON.stringify(payload) + ';\n';
  writeFileSync(OUT_PAPERS_JS, js, 'utf-8');

  console.log(
    `[build-papers-js] papers=${Object.keys(papers).length}, ` +
    `reviews=${Object.keys(reviews).length}, ` +
    `gen=${generations?.current_generation ?? 'N/A'}, ` +
    `lineage=${generations?.lineage?.length ?? 0}`
  );
}

main();
