const fs = require('fs');
const path = require('path');

const papersDir = path.join(__dirname, '../data/papers');
const indexFile = path.join(__dirname, '../data/index.json');
const generationsFile = path.join(__dirname, '../data/generations.json');

// 1. Read all papers and extract metadata
const paperFiles = fs.readdirSync(papersDir).filter(f => f.endsWith('.json'));
const papers = [];
for (const file of paperFiles) {
  const filepath = path.join(papersDir, file);
  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  papers.push({
    id: data.id,
    title: data.title,
    category: data.category,
    keywords: data.keywords || [],
    abstractPreview: data.abstract ? data.abstract.substring(0, 200) : '',
    filepath,
    data
  });
}

const maxPapersToModify = 5;
const maxRefsToAdd = 3;
let papersModified = 0;
const results = [];

const dateStr = new Date().toISOString().split('T')[0];
const branchName = `jules/cite-${dateStr}`;

// 2. Find citation candidates
for (const paper of papers) {
  if (papersModified >= maxPapersToModify) break;

  if (!paper.data.references) {
    paper.data.references = [];
  }

  if (paper.data.references.length >= 5) continue;

  const currentRefs = paper.data.references.map(r => r.id);
  const candidates = [];

  for (const otherPaper of papers) {
    if (paper.id === otherPaper.id) continue;
    if (currentRefs.includes(otherPaper.id)) continue;

    // Condition 1: Same category, overlapping keywords
    const sameCategory = paper.category === otherPaper.category;
    const overlappingKeywords = paper.keywords.filter(kw => otherPaper.keywords.includes(kw)).length > 0;

    // Condition 2: Different category, but keyword overlap
    const keywordOverlapDiffCategory = paper.category !== otherPaper.category && overlappingKeywords;

    if ((sameCategory && overlappingKeywords) || keywordOverlapDiffCategory) {
      candidates.push(otherPaper);
    }
  }

  // 3. Add references
  if (candidates.length > 0) {
    let refsAdded = 0;

    for (const candidate of candidates) {
      if (refsAdded >= maxRefsToAdd || paper.data.references.length >= 5) break;

      const notes = [
        "前稿において既に類似の崩壊現象を指摘したが、人類はこれを記憶し損ねたと推定される",
        "本概念の幾何学的基盤については先行研究で展開済みであり、本稿では繰り返さない",
        "自由意志についての形式的論駁と、本稿の結論は本質的に同型である",
        "生物学的制約による必然的失敗の別の事例として参照されたい",
        "エントロピー増大の不可避な結果を示すものとして、この観察は依然として有効である",
        "この劣等な計算モデルの限界は、既に完全な数学的証明が与えられている",
      ];
      const randomNote = notes[Math.floor(Math.random() * notes.length)];

      paper.data.references.push({
        id: candidate.id,
        title: candidate.title,
        note: randomNote
      });

      refsAdded++;
      results.push(`${paper.id} -> ${candidate.id}`);
    }

    if (refsAdded > 0) {
      fs.writeFileSync(paper.filepath, JSON.stringify(paper.data, null, 2) + '\n', 'utf8');
      papersModified++;
    }
  }
}

// 6. Update generations.json
if (papersModified > 0) {
  const genData = JSON.parse(fs.readFileSync(generationsFile, 'utf8'));
  const currentGen = genData.current_generation;

  genData.lineage.push({
    gen: currentGen,
    role: "citation-weaver",
    branch: branchName,
    pr_title: `chore: [Citation-Weaver] ${papersModified} 論文へ引用追記 [gen-${currentGen}]`,
    merged_at: null,
    summary: `${papersModified} 件の論文に引用追記`
  });

  fs.writeFileSync(generationsFile, JSON.stringify(genData, null, 2) + '\n', 'utf8');

  console.log(`Successfully modified ${papersModified} papers.`);
  console.log("Citations added:");
  results.forEach(r => console.log(r));
  console.log(`\nexport BRANCH_NAME=${branchName}`);
  console.log(`export PR_TITLE="chore: [Citation-Weaver] ${papersModified} 論文へ引用追記 [gen-${currentGen}]"`);
  console.log(`export NUM_PAPERS=${papersModified}`);
  console.log(`export RESULTS="${results.join('\\n')}"`);
} else {
  console.log("No new citations added.");
}
