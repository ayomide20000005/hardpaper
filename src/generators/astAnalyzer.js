const path = require('path');
const fs = require('fs-extra');

async function analyzeAST(projectPath) {
  const result = {
    functions: [],
    classes: [],
    dependencies: [],
    imports: [],
    complexity: 0,
    fileCount: 0,
    totalLines: 0,
    languages: [],
  };

  const langMap = {
    '.js': 'JavaScript', '.ts': 'TypeScript', '.py': 'Python',
    '.java': 'Java', '.cpp': 'C++', '.c': 'C', '.cs': 'C#',
    '.go': 'Go', '.rs': 'Rust', '.html': 'HTML', '.css': 'CSS',
  };

  const walk = async (dir) => {
    const items = await fs.readdir(dir);
    for (const item of items) {
      if (item === 'node_modules' || item === '.git' || item === 'HardPaper-Output') continue;
      const fullPath = path.join(dir, item);
      const stat = await fs.stat(fullPath);

      if (stat.isDirectory()) {
        await walk(fullPath);
      } else {
        const ext = path.extname(item).toLowerCase();
        if (!langMap[ext]) continue;

        result.fileCount++;
        if (!result.languages.includes(langMap[ext])) {
          result.languages.push(langMap[ext]);
        }

        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          result.totalLines += lines.length;

          // Extract functions
          const funcPatterns = [
            /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
            /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(/g,
            /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(?:async\s*)?\(/g,
            /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
            /func\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
          ];

          funcPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
              if (match[1] && !result.functions.includes(match[1])) {
                result.functions.push(match[1]);
              }
            }
          });

          // Extract classes
          const classPattern = /class\s+([A-Z][a-zA-Z0-9_]*)/g;
          let classMatch;
          while ((classMatch = classPattern.exec(content)) !== null) {
            if (!result.classes.includes(classMatch[1])) {
              result.classes.push(classMatch[1]);
            }
          }

          // Extract dependencies
          const importPatterns = [
            /require\(['"]([^'"./][^'"]*)['"]\)/g,
            /from\s+['"]([^'"./][^'"]*)['"]/g,
            /import\s+['"]([^'"./][^'"]*)['"]/g,
          ];

          importPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
              if (!result.dependencies.includes(match[1])) {
                result.dependencies.push(match[1]);
              }
            }
          });

          // Complexity score
          const complexityKeywords = /\b(if|else|for|while|switch|catch|case|&&|\|\|)\b/g;
          const complexityMatches = content.match(complexityKeywords);
          result.complexity += complexityMatches ? complexityMatches.length : 0;

        } catch (e) {}
      }
    }
  };

  await walk(projectPath);

  // Limit arrays for token efficiency
  result.functions = result.functions.slice(0, 30);
  result.classes = result.classes.slice(0, 20);
  result.dependencies = result.dependencies.slice(0, 25);

  return result;
}

module.exports = { analyzeAST };