const path = require('path');
const fs = require('fs-extra');
const simpleGit = require('simple-git');

async function generateChangelog(projectPath) {
  const outputDir = path.join(projectPath, 'HardPaper-Output');
  await fs.ensureDir(outputDir);

  let changelogContent = '';

  try {
    const git = simpleGit(projectPath);
    const log = await git.log();

    changelogContent = log.all.map(commit => (
      `Date: ${commit.date}\nAuthor: ${commit.author_name}\nMessage: ${commit.message}\n${'─'.repeat(50)}`
    )).join('\n');
  } catch (e) {
    changelogContent = 'No Git history found for this project.';
  }

  await fs.writeFile(path.join(outputDir, 'Project_Changelog.txt'), changelogContent, 'utf-8');
  return changelogContent;
}

module.exports = { generateChangelog };