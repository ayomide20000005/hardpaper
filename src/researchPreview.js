// ─────────────────────────────────────────────────────────────────
// FILE: src/researchPreview.js
// LOCATION: src/ folder (same level as main.js, claude.js)
// ─────────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs-extra');
const { getAvailableModel } = require('./claude');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function generateWebPreview(projectPath, researchData, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = await getAvailableModel(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const outputDir = path.join(projectPath, 'HardPaper-Output');
  const previewDir = path.join(outputDir, 'preview');
  await fs.ensureDir(previewDir);

  let metadata = {};
  try {
    metadata = await fs.readJson(path.join(outputDir, 'Metadata.json'));
  } catch (e) {}

  const sectionsText = Object.entries(researchData.sections || {})
    .map(([k, v]) => `${k}:\n${v}`)
    .join('\n\n');

  const prompt = `You are an expert web developer. Create a complete, stunning, modern single-page research portfolio website.

Research Data:
Title: ${researchData.title}
Author: ${researchData.author}
Template: ${researchData.template}

Sections:
${sectionsText}

Project Stats:
- Files: ${metadata.fileCount || 'N/A'}
- Lines of Code: ${metadata.totalLines || 'N/A'}
- Languages: ${(metadata.languages || []).join(', ') || 'N/A'}
- Functions: ${metadata.functions?.length || 'N/A'}
- Dependencies: ${(metadata.dependencies || []).slice(0, 8).join(', ') || 'N/A'}
- Generated: ${new Date().toLocaleDateString()}

Build a COMPLETE single HTML file with all CSS and JS embedded. Requirements:

DESIGN:
- Dark theme: background #0f0f0f, cards #1a1a1a, accent purple #9d7dff
- Glassmorphism cards with backdrop-filter blur
- Smooth gradient hero: linear-gradient(135deg, #1a0533, #0f0f0f)
- Professional academic typography — Inter or system font
- Fully responsive (mobile, tablet, desktop)

SECTIONS TO INCLUDE:
1. Hero — title, author, animated gradient background, scroll indicator
2. Sticky nav — smooth scroll links to each section, active highlight
3. Reading progress bar at very top of page
4. Abstract — full content in elegant card
5. Each research section — collapsible glassmorphism cards with expand animation
6. Stats dashboard — animated counters for files, lines, languages, functions
7. Dependencies — horizontal scrolling pill badges
8. Languages — animated CSS progress bars showing usage
9. Table of contents — fixed sidebar on desktop, hidden on mobile
10. Download section — buttons for PDF, TEX, ZIP package
11. Footer — generated timestamp, HardPaper branding

INTERACTIONS (pure JS, no libraries):
- Scroll-triggered fade-in animations using IntersectionObserver
- Animated number counters when stats section enters viewport
- Smooth collapse/expand for research sections
- Active nav link highlighting on scroll
- Reading progress bar updates on scroll
- Copy-to-clipboard on citation key if present

Return ONLY the complete HTML. No explanations. No markdown fences.`;

  const result = await model.generateContent(prompt);
  const html = result.response.text().replace(/```html|```/g, '').trim();

  const previewPath = path.join(previewDir, 'index.html');
  await fs.writeFile(previewPath, html, 'utf-8');

  return { success: true, previewPath, previewDir };
}

module.exports = { generateWebPreview };