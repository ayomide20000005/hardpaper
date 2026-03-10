// ─────────────────────────────────────────────────────────────────
// FILE: src/generators/packageExporter.js
// LOCATION: put this in your src/generators/ folder
// ─────────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');

async function exportPackage(projectPath, outputFileName) {
  const outputDir = path.join(projectPath, 'HardPaper-Output');
  const zipPath = path.join(outputDir, outputFileName || 'HardPaper-Package.zip');

  await fs.ensureDir(outputDir);

  return new Promise((resolve, reject) => {
    const output = require('fs').createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve({ success: true, zipPath, size: archive.pointer() }));
    archive.on('error', err => reject(new Error('Zip failed: ' + err.message)));

    archive.pipe(output);

    // Add all files from HardPaper-Output except the zip itself
    const filesToAdd = [
      'Final_Manuscript.tex',
      'Final_Manuscript.pdf',
      'Metadata.json',
      'AST_Report.json',
      'Dependencies.json',
      'Changelog.md',
      'README_Generated.md',
      'history.json',
    ];

    for (const file of filesToAdd) {
      const filePath = path.join(outputDir, file);
      if (require('fs').existsSync(filePath)) {
        archive.file(filePath, { name: file });
      }
    }

    // Add preview folder if it exists
    const previewDir = path.join(outputDir, 'preview');
    if (require('fs').existsSync(previewDir)) {
      archive.directory(previewDir, 'preview');
    }

    archive.finalize();
  });
}

module.exports = { exportPackage };