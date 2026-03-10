const path = require('path');
const fs = require('fs-extra');

function getDbPath(projectPath) {
  return path.join(projectPath, 'HardPaper-Output', 'experiments.json');
}

async function logExperiment(projectPath, data) {
  const dbPath = getDbPath(projectPath);
  await fs.ensureFile(dbPath);

  let experiments = [];
  try { experiments = await fs.readJson(dbPath); } catch (e) {}

  const id = Date.now();
  const entry = {
    id,
    timestamp: new Date().toISOString(),
    runId: `run_${experiments.length + 1}`,
    ...data,
  };

  // Try to get git commit hash
  try {
    const simpleGit = require('simple-git');
    const git = simpleGit(projectPath);
    const log = await git.log({ maxCount: 1 });
    if (log.latest) entry.gitCommit = log.latest.hash.substring(0, 7);
  } catch (e) {}

  experiments.unshift(entry);
  await fs.writeJson(dbPath, experiments, { spaces: 2 });
  return entry;
}

async function getExperiments(projectPath) {
  const dbPath = getDbPath(projectPath);
  try { return await fs.readJson(dbPath); } catch (e) { return []; }
}

async function deleteExperiment(projectPath, id) {
  const dbPath = getDbPath(projectPath);
  let experiments = await getExperiments(projectPath);
  experiments = experiments.filter(e => e.id !== id);
  await fs.writeJson(dbPath, experiments, { spaces: 2 });
  return true;
}

module.exports = { logExperiment, getExperiments, deleteExperiment };