const path = require('path');
const fs = require('fs-extra');
const { getAllFiles } = require('../fileHandler');

async function generateDiagram(projectPath) {
  const outputDir = path.join(projectPath, 'HardPaper-Output');
  await fs.ensureDir(outputDir);

  const files = await getAllFiles(projectPath);
  const projectName = path.basename(projectPath);

  const nodes = files.map(f => f.replace(projectPath, '').replace(/\\/g, '/')).filter(f => f);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${Math.max(600, nodes.length * 35 + 100)}">
  <rect width="100%" height="100%" fill="#1e1e2e"/>
  <text x="600" y="40" font-family="monospace" font-size="20" fill="#cdd6f4" text-anchor="middle" font-weight="bold">${projectName} — System Architecture</text>`;

  nodes.forEach((node, i) => {
    const y = 70 + i * 32;
    const depth = (node.match(/\//g) || []).length;
    const x = 100 + depth * 30;
    const color = node.endsWith('.js') ? '#a6e3a1' : node.endsWith('.html') ? '#fab387' : node.endsWith('.css') ? '#89b4fa' : '#cdd6f4';
    svg += `
  <rect x="${x - 5}" y="${y - 14}" width="${Math.max(300, node.length * 8)}" height="22" rx="4" fill="#313244"/>
  <text x="${x}" y="${y}" font-family="monospace" font-size="13" fill="${color}">${node}</text>`;
  });

  svg += `\n</svg>`;

  await fs.writeFile(path.join(outputDir, 'System_Architecture.svg'), svg, 'utf-8');
  return true;
}

module.exports = { generateDiagram };