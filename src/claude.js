const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs-extra');

// ── DYNAMIC MODEL DETECTION ───────────────────────────────────────
let _cachedModelName = null;

async function getAvailableModel(apiKey) {
  if (_cachedModelName) return _cachedModelName;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const data = await res.json();
    const models = data.models || [];

    const preferred = ['flash', 'pro'];
    let picked = null;

    for (const pref of preferred) {
      picked = models.find(m =>
        m.name.toLowerCase().includes(pref) &&
        m.supportedGenerationMethods?.includes('generateContent')
      );
      if (picked) break;
    }

    if (!picked) {
      picked = models.find(m =>
        m.supportedGenerationMethods?.includes('generateContent')
      );
    }

    if (!picked) throw new Error('No supported Gemini model found for your API key');

    _cachedModelName = picked.name.replace('models/', '');
    console.log('[HardPaper] Using Gemini model:', _cachedModelName);
    return _cachedModelName;
  } catch (e) {
    console.warn('[HardPaper] Could not list models, trying fallbacks:', e.message);
    const fallbacks = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro'];
    for (const fb of fallbacks) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const m = genAI.getGenerativeModel({ model: fb });
        await m.generateContent('test');
        _cachedModelName = fb;
        return _cachedModelName;
      } catch (_) { continue; }
    }
    throw new Error('Could not find any working Gemini model');
  }
}

async function getModel(apiKey) {
  const modelName = await getAvailableModel(apiKey);
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: modelName });
}

// ── GENERATE RESEARCH ─────────────────────────────────────────────
async function generateResearch(projectPath, apiKey, title, author, template, sendProgress) {
  const model = await getModel(apiKey);

  sendProgress(1, 7);
  const { createShadowCopy } = require('./generators/shadowCopy');
  const shadowPath = await createShadowCopy(projectPath);

  sendProgress(2, 7);
  const files = await scanProject(shadowPath);

  sendProgress(3, 7);
  const { analyzeAST } = require('./generators/astAnalyzer');
  const astData = await analyzeAST(shadowPath);

  sendProgress(4, 7);
  const { analyzeDocuments } = require('./generators/documentAnalyzer');
  const docData = await analyzeDocuments(shadowPath);

  sendProgress(5, 7);
  const paperTitle = title || 'Research Paper';
  const paperAuthor = author || 'Author';
  const templateName = template || 'generic';

  const templatePath = path.join(__dirname, 'templates', `${templateName}.tex`);
  let templateContent = '';
  try { templateContent = await fs.readFile(templatePath, 'utf-8'); } catch (e) {}

  const codeContext = files.slice(0, 10).map(f => `File: ${f.path}\n\`\`\`\n${f.content.substring(0, 500)}\n\`\`\``).join('\n\n');

  const astSummary = astData ? `
AST Analysis:
- Functions: ${astData.functions?.length || 0}
- Classes: ${astData.classes?.length || 0}
- Dependencies: ${astData.dependencies?.slice(0, 10).join(', ') || 'none'}
- Languages: ${astData.languages?.join(', ') || 'N/A'}
- Total lines: ${astData.totalLines || 0}
` : '';

  const docSummary = docData?.length ? `
Referenced Documents:
${docData.map(d => `- ${d.name}: ${d.summary}`).join('\n')}
` : '';

  const prompt = templateContent ? `
You are an expert academic researcher. Fill in the placeholders in this LaTeX template.

Title: ${paperTitle}
Author: ${paperAuthor}

Replace these placeholders:
{{ABSTRACT}} — Comprehensive summary
{{INTRODUCTION}} — Background and motivation
{{SYSTEM_DESIGN}} — Architecture and design
{{IMPLEMENTATION}} — Technical implementation
{{EVALUATION}} — Assessment and results
{{REFERENCES}} — Formatted references

${astSummary}
${docSummary}

Codebase:
${codeContext}

Template:
${templateContent.replace('{{TITLE}}', paperTitle).replace('{{AUTHOR}}', paperAuthor)}

Return ONLY the completed LaTeX. No explanation. No markdown.
` : `
You are an expert academic researcher. Generate a complete research paper in LaTeX.

Title: ${paperTitle}
Author: ${paperAuthor}

${astSummary}
${docSummary}

Required sections: Abstract, Introduction, System Design, Implementation, Evaluation, References

Codebase:
${codeContext}

Return ONLY valid LaTeX using the article document class.
`;

  const result = await model.generateContent(prompt);
  const latex = result.response.text();

  sendProgress(6, 7);
  const outputDir = path.join(projectPath, 'HardPaper-Output');
  await fs.ensureDir(outputDir);

  await fs.writeFile(path.join(outputDir, 'Final_Manuscript.tex'), latex, 'utf-8');

  await fs.writeJson(path.join(outputDir, 'Metadata.json'), {
    title: paperTitle,
    author: paperAuthor,
    template: templateName,
    generatedAt: new Date().toISOString(),
    fileCount: astData?.fileCount || 0,
    totalLines: astData?.totalLines || 0,
    languages: astData?.languages || [],
    complexity: astData?.complexity || 0,
    documents: docData?.map(d => ({ name: d.name, type: d.type })) || [],
  }, { spaces: 2 });

  await fs.writeJson(path.join(outputDir, 'AST_Report.json'), {
    generatedAt: new Date().toISOString(),
    functions: astData?.functions || [],
    classes: astData?.classes || [],
    complexity: astData?.complexity || 0,
    fileCount: astData?.fileCount || 0,
    totalLines: astData?.totalLines || 0,
    languages: astData?.languages || [],
  }, { spaces: 2 });

  await fs.writeJson(path.join(outputDir, 'Dependencies.json'), {
    generatedAt: new Date().toISOString(),
    dependencies: astData?.dependencies || [],
    total: astData?.dependencies?.length || 0,
  }, { spaces: 2 });

  let changelog = `# Changelog\n\nGenerated by HardPaper on ${new Date().toLocaleString()}\n\n`;
  try {
    const simpleGit = require('simple-git');
    const git = simpleGit(projectPath);
    const log = await git.log({ maxCount: 20 });
    if (log.all.length) {
      changelog += `## Git History\n\n`;
      log.all.forEach(c => {
        changelog += `- **${c.date.substring(0, 10)}** ${c.message} *(${c.hash.substring(0, 7)})*\n`;
      });
    } else {
      changelog += `## Project Files\n\n`;
      files.forEach(f => { changelog += `- ${f.path}\n`; });
    }
  } catch (e) {
    changelog += `## Project Files\n\n`;
    files.forEach(f => { changelog += `- ${f.path}\n`; });
  }
  await fs.writeFile(path.join(outputDir, 'Changelog.md'), changelog, 'utf-8');

  const readme = `# ${paperTitle}\n\n**Author:** ${paperAuthor}\n**Generated:** ${new Date().toLocaleString()}\n**Template:** ${templateName}\n\n## Project Overview\n\n${docSummary || 'No additional documents found.'}\n\n## Code Statistics\n\n- **Files:** ${astData?.fileCount || 0}\n- **Lines of Code:** ${astData?.totalLines || 0}\n- **Languages:** ${astData?.languages?.join(', ') || 'N/A'}\n- **Functions:** ${astData?.functions?.length || 0}\n- **Classes:** ${astData?.classes?.length || 0}\n- **Dependencies:** ${astData?.dependencies?.join(', ') || 'None'}\n\n---\n*Generated by HardPaper*\n`;
  await fs.writeFile(path.join(outputDir, 'README_Generated.md'), readme, 'utf-8');

  const sections = extractSections(latex);

  sendProgress(7, 7);
  await fs.remove(shadowPath);

  return { success: true, latex, sections, outputDir, title: paperTitle, author: paperAuthor, template: templateName };
}

function extractSections(latex) {
  const sections = {};
  const sectionNames = ['Abstract', 'Introduction', 'System Design', 'Implementation', 'Evaluation', 'References'];
  sectionNames.forEach(name => {
    const regex = new RegExp(`\\\\section\\{${name}\\}([\\s\\S]*?)(?=\\\\section|\\\\end\\{document\\}|$)`, 'i');
    const match = latex.match(regex);
    if (match) {
      sections[name] = match[1]
        .replace(/\\definecolor\{[^}]*\}\{[^}]*\}\{[^}]*\}/g, '')
        .replace(/\\lstset\{[\s\S]*?\}/g, '')
        .replace(/\\lstdefinestyle\{[\s\S]*?\}/g, '')
        .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
        .replace(/\\[a-zA-Z]+/g, '')
        .replace(/[{}]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim().substring(0, 400) + '...';
    } else {
      sections[name] = 'Generated successfully.';
    }
  });
  return sections;
}

async function scanProject(projectPath) {
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
        const ext = path.extname(item);
        const codeExts = ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.html', '.css', '.txt', '.md'];
        if (codeExts.includes(ext)) {
          const content = await fs.readFile(fullPath, 'utf-8');
          files.push({ path: fullPath.replace(projectPath, ''), content });
        }
      }
    }
  };
  await walk(projectPath);
  return files;
}

async function editResearchSection(section, content, instruction, apiKey) {
  const model = await getModel(apiKey);
  const result = await model.generateContent(`You are an expert academic writer.\n\nEdit this research paper section based on the instruction.\n\nSection: ${section}\nCurrent content:\n${content}\n\nInstruction: ${instruction}\n\nReturn ONLY the improved section content in plain text. No LaTeX. No explanations.`);
  return result.response.text();
}

module.exports = {
  generateResearch,
  editResearchSection,
  getAvailableModel,
};