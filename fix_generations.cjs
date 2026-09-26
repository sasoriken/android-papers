const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'data', 'generations.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.lineage.push({
  gen: data.current_generation,
  role: "citation-weaver",
  branch: "jules/cite-2024-05-18",
  pr_title: `chore: [Citation-Weaver] 3 論文へ引用追記 [gen-${data.current_generation}]`,
  merged_at: null,
  summary: "3 件の論文に引用追記"
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
console.log('Appended to generations.json');
