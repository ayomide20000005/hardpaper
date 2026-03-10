const path = require('path');
const fs = require('fs-extra');
const { getProjectStats } = require('../fileHandler');

async function generateMetadata(projectPath) {
  const stats = await getProjectStats(projectPath);
  const outputDir = path.join(projectPath, 'HardPaper-Output');
  await fs.ensureDir(outputDir);

  const metadata = {
    projectName: path.basename(projectPath),
    generatedAt: new Date().toISOString(),
    ...stats,
  };

  await fs.writeJson(path.join(outputDir, 'Metadata.json'), metadata, { spaces: 2 });
  return metadata;
}

module.exports = { generateMetadata };