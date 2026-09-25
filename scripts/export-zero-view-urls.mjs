import fs from "fs";

const raw = fs.readFileSync(
  "C:/Users/adity/.cursor/projects/c-htmls-pure-for-men-ERP/agent-tools/0913a71e-d573-4fca-adc3-3d44fb69fbee.txt",
  "utf8",
);
const start = raw.indexOf("[");
const end = raw.lastIndexOf("]") + 1;
const jsonText = raw
  .slice(start, end)
  .replace(/\\"/g, '"')
  .replace(/\\\\/g, "\\");
const rows = JSON.parse(jsonText);

fs.mkdirSync("exports", { recursive: true });

const urls = rows.map((r) => r.full_url);
fs.writeFileSync("exports/zero-view-product-urls.txt", urls.join("\n") + "\n");

const csvLines = [
  "views,rows,page_path,full_url",
  ...rows.map((r) => {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    return `0,${r.rows},${esc(r.page_path)},${esc(r.full_url)}`;
  }),
];
fs.writeFileSync(
  "exports/zero-view-product-urls.csv",
  csvLines.join("\n") + "\n",
);

console.log(`count=${urls.length}`);
console.log("wrote exports/zero-view-product-urls.txt");
console.log("wrote exports/zero-view-product-urls.csv");
