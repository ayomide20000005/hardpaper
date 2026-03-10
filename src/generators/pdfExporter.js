// ─────────────────────────────────────────────────────────────────
// FILE: src/generators/pdfExporter.js
// LOCATION: put this in your src/generators/ folder
// ─────────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs-extra');
const https = require('https');

async function exportToPDF(projectPath) {
  const outputDir = path.join(projectPath, 'HardPaper-Output');
  const texPath = path.join(outputDir, 'Final_Manuscript.tex');
  const pdfPath = path.join(outputDir, 'Final_Manuscript.pdf');

  if (!await fs.pathExists(texPath)) {
    throw new Error('No LaTeX file found. Generate a research paper first.');
  }

  const texContent = await fs.readFile(texPath, 'utf-8');

  return new Promise((resolve, reject) => {
    const postData = 'text=' + encodeURIComponent(texContent);

    const options = {
      hostname: 'latexonline.cc',
      path: '/compile',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`LaTeX compile failed: HTTP ${res.statusCode}`));
        return;
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);
          await fs.writeFile(pdfPath, pdfBuffer);
          resolve({ success: true, pdfPath });
        } catch (e) {
          reject(new Error('Failed to save PDF: ' + e.message));
        }
      });
    });

    req.on('error', (e) => reject(new Error('Network error: ' + e.message)));
    req.write(postData);
    req.end();
  });
}

module.exports = { exportToPDF };