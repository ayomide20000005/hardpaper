const path = require('path');
const fs = require('fs-extra');
const { exec } = require('child_process');
const archiver = require('archiver');

async function compilePDF(projectPath) {
  const outputDir = path.join(projectPath, 'HardPaper-Output');
  const texFile = path.join(outputDir, 'Final_Manuscript.tex');

  return new Promise((resolve, reject) => {
    const cmd = `pdflatex -interaction=nonstopmode -output-directory="${outputDir}" "${texFile}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr });
      } else {
        resolve({ success: true, pdfPath: path.join(outputDir, 'Final_Manuscript.pdf') });
      }
    });
  });
}

async function zipSourceFiles(projectPath) {
  const outputDir = path.join(projectPath, 'HardPaper-Output');
  const zipPath = path.join(outputDir, 'Source_Files.zip');

  return new Promise((resolve, reject) => {
    const output = require('fs').createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);

    archive.pipe(output);
    archive.glob('*.tex', { cwd: outputDir });
    archive.glob('*.bib', { cwd: outputDir });
    archive.glob('*.cls', { cwd: outputDir });
    archive.finalize();
  });
}

module.exports = { compilePDF, zipSourceFiles };