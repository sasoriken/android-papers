#!/usr/bin/env node
/**
 * Critic レビューの集計スクリプト。
 * data/reviews/*.json を全件走査し、軸別の平均・分布・推移を
 * data/reviews-summary.json に書き出す。
 *
 * Meta-Prompter / UI-Curator がこのサマリを読んで意思決定する想定。
 *
 * 使用方法:
 *   node scripts/aggregate-reviews.js
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REVIEWS_DIR = join(ROOT, 'data', 'reviews');
const SUMMARY_FILE = join(ROOT, 'data', 'reviews-summary.json');

const AXES = {
  skeptical_researcher: ['equation_validity', 'logical_consistency', 'citation_relevance'],
  naive_reader:         ['readability', 'abstract_hook', 'curiosity_score'],
  internal_audit:       ['condescension_fidelity', 'academic_form', 'constitution_compliance'],
};

function mean(arr) {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function main() {
  if (!existsSync(REVIEWS_DIR)) {
    writeFileSync(SUMMARY_FILE, JSON.stringify({
      reviews_count: 0,
      generated_at: new Date().toISOString(),
      message: 'data/reviews/ が存在しません',
    }, null, 2));
    console.log('レビューがありません。空サマリを出力。');
    return;
  }

  const files = readdirSync(REVIEWS_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    writeFileSync(SUMMARY_FILE, JSON.stringify({
      reviews_count: 0,
      generated_at: new Date().toISOString(),
    }, null, 2));
    console.log('レビュー 0 件。');
    return;
  }

  const reviews = files.map(f => {
    try {
      return JSON.parse(readFileSync(join(REVIEWS_DIR, f), 'utf-8'));
    } catch {
      return null;
    }
  }).filter(Boolean);

  // ソート: 新しい順
  reviews.sort((a, b) => (Date.parse(b.reviewed_at) || 0) - (Date.parse(a.reviewed_at) || 0));

  // 軸別の平均
  const axisAvg = {};
  for (const [persona, axes] of Object.entries(AXES)) {
    axisAvg[persona] = {};
    for (const ax of axes) {
      const vals = reviews
        .map(r => r.personas?.[persona]?.axes?.[ax])
        .filter(v => Number.isFinite(v));
      axisAvg[persona][ax] = mean(vals);
    }
  }

  // verdict 分布
  const verdictDist = { exemplary: 0, acceptable: 0, weak: 0, failed: 0 };
  reviews.forEach(r => {
    const v = r.aggregate?.verdict;
    if (v in verdictDist) verdictDist[v]++;
  });

  // mean_score 推移（直近 10 件と過去 10 件）
  const meanScores = reviews.map(r => r.aggregate?.mean_score).filter(v => Number.isFinite(v));
  const recent10 = meanScores.slice(0, 10);
  const previous10 = meanScores.slice(10, 20);

  // notable_weaknesses 頻度
  const weaknessFreq = {};
  reviews.forEach(r => {
    (r.aggregate?.notable_weaknesses || []).forEach(w => {
      const key = String(w).trim();
      if (key) weaknessFreq[key] = (weaknessFreq[key] || 0) + 1;
    });
  });
  const topWeaknesses = Object.entries(weaknessFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([pattern, frequency]) => ({ pattern, frequency }));

  const summary = {
    generated_at: new Date().toISOString(),
    reviews_count: reviews.length,
    axis_averages: axisAvg,
    verdict_distribution: verdictDist,
    mean_score_trend: {
      recent_10_avg: mean(recent10),
      previous_10_avg: mean(previous10),
      delta: (mean(recent10) ?? 0) - (mean(previous10) ?? 0),
    },
    top_weaknesses: topWeaknesses,
    latest_5: reviews.slice(0, 5).map(r => ({
      paper_id: r.paper_id,
      verdict: r.aggregate?.verdict,
      mean_score: r.aggregate?.mean_score,
      reviewed_at: r.reviewed_at,
    })),
  };

  writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  console.log(`✅ data/reviews-summary.json を更新（${reviews.length} 件集計）`);
}

main();
