const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');

function parseBibTeX(content) {
  const entries = [];
  const entryRegex = /@(\w+)\s*\{([^,]+),([^@]*)\}/gs;
  let match;
  while ((match = entryRegex.exec(content)) !== null) {
    const type = match[1];
    const key = match[2].trim();
    const fieldsStr = match[3];
    const fields = {};
    const fieldRegex = /(\w+)\s*=\s*\{([^}]*)\}/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(fieldsStr)) !== null) {
      fields[fieldMatch[1].toLowerCase()] = fieldMatch[2].trim();
    }
    entries.push({ type, key, ...fields });
  }
  return entries;
}

function generateBibTeX(citations) {
  return citations.map(c => {
    const fields = Object.entries(c)
      .filter(([k]) => !['type', 'key', 'valid', 'duplicate'].includes(k))
      .map(([k, v]) => `  ${k} = {${v}}`)
      .join(',\n');
    return `@${c.type || 'misc'}{${c.key},\n${fields}\n}`;
  }).join('\n\n');
}

function deduplicateCitations(citations) {
  const seen = new Map();
  const result = [];
  citations.forEach(c => {
    const titleKey = (c.title || '').toLowerCase().replace(/\s+/g, '');
    const doiKey = c.doi || '';
    const uniqueKey = doiKey || titleKey;
    if (!seen.has(uniqueKey)) {
      seen.set(uniqueKey, true);
      result.push(c);
    } else {
      c.duplicate = true;
    }
  });
  return result;
}

async function validateDOI(doi) {
  if (!doi) return { valid: false, reason: 'No DOI provided' };
  try {
    const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, '');
    const response = await axios.head(`https://doi.org/${cleanDoi}`, {
      timeout: 5000,
      maxRedirects: 3,
    });
    return { valid: response.status < 400, status: response.status };
  } catch (e) {
    return { valid: false, reason: e.message };
  }
}

async function getCitations(projectPath) {
  const bibPath = path.join(projectPath, 'references.bib');
  try {
    const content = await fs.readFile(bibPath, 'utf-8');
    const citations = parseBibTeX(content);
    return deduplicateCitations(citations);
  } catch (e) {
    return [];
  }
}

async function saveCitation(projectPath, citation) {
  const bibPath = path.join(projectPath, 'references.bib');
  let citations = await getCitations(projectPath);
  const existing = citations.findIndex(c => c.key === citation.key);
  if (existing >= 0) {
    citations[existing] = citation;
  } else {
    citations.push(citation);
  }
  citations = deduplicateCitations(citations);
  await fs.writeFile(bibPath, generateBibTeX(citations), 'utf-8');
  return citations;
}

async function deleteCitation(projectPath, key) {
  const bibPath = path.join(projectPath, 'references.bib');
  let citations = await getCitations(projectPath);
  citations = citations.filter(c => c.key !== key);
  await fs.writeFile(bibPath, generateBibTeX(citations), 'utf-8');
  return citations;
}

module.exports = { getCitations, saveCitation, deleteCitation, validateDOI, parseBibTeX, generateBibTeX };