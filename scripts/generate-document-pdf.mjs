/**
 * Generate Document.pdf from Document.md
 * Usage: node scripts/generate-document-pdf.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mdPath = join(root, 'Document.md');
const htmlPath = join(root, 'Document.html');
const pdfPath = join(root, 'Document.pdf');

const md = readFileSync(mdPath, 'utf8');

// Minimal markdown → HTML (headings, tables as pre, lists, code)
function mdToHtml(text) {
  const lines = text.split('\n');
  const out = [];
  let inCode = false;
  let inTable = false;

  const flushTable = () => {
    if (!inTable) return;
    out.push('</tbody></table>');
    inTable = false;
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      flushTable();
      if (!inCode) {
        out.push('<pre><code>');
        inCode = true;
      } else {
        out.push('</code></pre>');
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      out.push(line.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      continue;
    }

    if (line.startsWith('# ')) {
      flushTable();
      out.push(`<h1>${esc(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      flushTable();
      out.push(`<h2>${esc(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      flushTable();
      out.push(`<h3>${esc(line.slice(4))}</h3>`);
    } else if (line.startsWith('#### ')) {
      flushTable();
      out.push(`<h4>${esc(line.slice(5))}</h4>`);
    } else if (line.startsWith('|') && line.includes('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) continue;
      if (!inTable) {
        out.push('<table><thead><tr>');
        cells.forEach((c) => out.push(`<th>${esc(c)}</th>`));
        out.push('</tr></thead><tbody>');
        inTable = true;
      } else {
        out.push('<tr>');
        cells.forEach((c) => out.push(`<td>${esc(c)}</td>`));
        out.push('</tr>');
      }
    } else if (line.startsWith('- ')) {
      flushTable();
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.trim() === '---') {
      flushTable();
      out.push('<hr/>');
    } else if (line.trim() === '') {
      flushTable();
      out.push('');
    } else {
      flushTable();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  flushTable();
  return out.join('\n');
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>SmartAnalytics — Project Documentation</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; margin: 2cm; }
    h1 { font-size: 22pt; border-bottom: 2px solid #2563eb; padding-bottom: 8px; page-break-before: always; }
    h1:first-of-type { page-break-before: avoid; }
    h2 { font-size: 16pt; color: #1e40af; margin-top: 24px; }
    h3 { font-size: 13pt; color: #1e3a8a; margin-top: 18px; }
    h4 { font-size: 11pt; margin-top: 14px; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 9pt; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #eff6ff; font-weight: 600; }
    tr:nth-child(even) td { background: #f8fafc; }
    code, pre { font-family: Consolas, monospace; font-size: 9pt; background: #f1f5f9; }
    pre { padding: 10px; overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 4px; }
    li { margin: 4px 0; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
    p { margin: 8px 0; }
    @media print { body { margin: 1.5cm; } h1,h2,h3 { page-break-after: avoid; } }
  </style>
</head>
<body>
${mdToHtml(md)}
</body>
</html>`;

writeFileSync(htmlPath, html, 'utf8');
console.log('Wrote', htmlPath);

const edgePaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

const browser = edgePaths.find((p) => {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
});

if (browser) {
  const cmd = `"${browser}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdfPath}" "${htmlPath}"`;
  execSync(cmd, { stdio: 'inherit' });
  console.log('Wrote', pdfPath);
} else {
  console.log('No Edge/Chrome found. Open Document.html in browser → Print → Save as PDF.');
}
