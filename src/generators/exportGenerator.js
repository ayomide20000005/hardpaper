const path = require('path');
const fs = require('fs-extra');

async function exportResearch(projectPath, format) {
  const outputDir = path.join(projectPath, 'HardPaper-Output');
  const texPath = path.join(outputDir, 'Final_Manuscript.tex');

  if (!await fs.pathExists(texPath)) {
    throw new Error('No research paper found. Generate one first.');
  }

  const latex = await fs.readFile(texPath, 'utf-8');

  if (format === 'markdown') {
    const markdown = convertLatexToMarkdown(latex);
    const mdPath = path.join(outputDir, 'Final_Manuscript.md');
    await fs.writeFile(mdPath, markdown, 'utf-8');
    return { success: true, path: mdPath, format: 'markdown' };
  }

  if (format === 'word') {
    const wordContent = convertLatexToWordHtml(latex);
    const wordPath = path.join(outputDir, 'Final_Manuscript.html');
    await fs.writeFile(wordPath, wordContent, 'utf-8');
    return { success: true, path: wordPath, format: 'word', note: 'Saved as HTML — open in Word to convert' };
  }

  throw new Error('Unsupported format: ' + format);
}

function convertLatexToMarkdown(latex) {
  let md = latex
    .replace(/\\documentclass.*?\n/g, '')
    .replace(/\\usepackage.*?\n/g, '')
    .replace(/\\begin\{document\}/g, '')
    .replace(/\\end\{document\}/g, '')
    .replace(/\\title\{([^}]+)\}/g, '# $1')
    .replace(/\\author\{([^}]+)\}/g, '**Author:** $1')
    .replace(/\\date\{[^}]*\}/g, '')
    .replace(/\\maketitle/g, '')
    .replace(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/g, '## Abstract\n$1')
    .replace(/\\section\{([^}]+)\}/g, '## $1')
    .replace(/\\subsection\{([^}]+)\}/g, '### $1')
    .replace(/\\textbf\{([^}]+)\}/g, '**$1**')
    .replace(/\\textit\{([^}]+)\}/g, '*$1*')
    .replace(/\\begin\{itemize\}/g, '')
    .replace(/\\end\{itemize\}/g, '')
    .replace(/\\begin\{enumerate\}/g, '')
    .replace(/\\end\{enumerate\}/g, '')
    .replace(/\\item\s/g, '- ')
    .replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g, '```\n$1\n```')
    .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/\{|\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return md;
}

function convertLatexToWordHtml(latex) {
  const md = convertLatexToMarkdown(latex);
  const lines = md.split('\n');
  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: 'Times New Roman', serif; max-width: 800px; margin: 40px auto; line-height: 1.6; }
  h1 { text-align: center; font-size: 24px; }
  h2 { font-size: 18px; margin-top: 24px; }
  h3 { font-size: 15px; }
  p { text-align: justify; }
  code { background: #f4f4f4; padding: 2px 4px; font-family: monospace; }
  pre { background: #f4f4f4; padding: 16px; }
</style>
</head><body>`;

  lines.forEach(line => {
    if (line.startsWith('# ')) html += `<h1>${line.slice(2)}</h1>`;
    else if (line.startsWith('## ')) html += `<h2>${line.slice(3)}</h2>`;
    else if (line.startsWith('### ')) html += `<h3>${line.slice(4)}</h3>`;
    else if (line.startsWith('- ')) html += `<li>${line.slice(2)}</li>`;
    else if (line.startsWith('**Author:**')) html += `<p><strong>${line.slice(2)}</strong></p>`;
    else if (line.trim()) html += `<p>${line}</p>`;
  });

  html += '</body></html>';
  return html;
}

module.exports = { exportResearch };