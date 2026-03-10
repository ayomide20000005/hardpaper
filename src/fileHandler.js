const path = require('path');
const fs = require('fs-extra');

async function getAllFiles(projectPath) {
  const files = [];
  const walk = async (dir) => {
    const items = await fs.readdir(dir);
    for (const item of items) {
      if (item === 'node_modules' || item === '.git' || item === 'HardPaper-Output') continue;
      const fullPath = path.join(dir, item);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  };
  await walk(projectPath);
  return files;
}

async function getProjectStats(projectPath) {
  const files = await getAllFiles(projectPath);
  let totalLines = 0;
  const libraries = new Set();
  const languages = new Set();

  const langMap = {
    '.js': 'JavaScript', '.ts': 'TypeScript', '.py': 'Python',
    '.java': 'Java', '.cpp': 'C++', '.c': 'C', '.cs': 'C#',
    '.go': 'Go', '.rs': 'Rust', '.html': 'HTML', '.css': 'CSS'
  };

  for (const file of files) {
    const ext = path.extname(file);
    if (langMap[ext]) languages.add(langMap[ext]);

    try {
      const content = await fs.readFile(file, 'utf-8');
      totalLines += content.split('\n').length;

      const requireMatches = content.match(/require\(['"]([^'"]+)['"]\)/g) || [];
      const importMatches = content.match(/from ['"]([^'"]+)['"]/g) || [];
      [...requireMatches, ...importMatches].forEach(m => {
        const lib = m.match(/['"]([^'"]+)['"]/)[1];
        if (!lib.startsWith('.')) libraries.add(lib);
      });
    } catch (e) {}
  }

  return {
    fileCount: files.length,
    totalLines,
    languages: [...languages],
    libraries: [...libraries],
    timestamp: new Date().toISOString(),
  };
}

module.exports = { getAllFiles, getProjectStats };