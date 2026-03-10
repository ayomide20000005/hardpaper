const path = require('path');
const fs = require('fs-extra');

async function analyzeDocuments(projectPath) {
  const results = [];

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

        // PDF analysis
        if (ext === '.pdf') {
          try {
            const pdfParse = require('pdf-parse');
            const buffer = await fs.readFile(fullPath);
            const data = await pdfParse(buffer);
            results.push({
              name: item,
              type: 'pdf',
              pages: data.numpages,
              summary: data.text.substring(0, 500).replace(/\s+/g, ' ').trim(),
            });
          } catch (e) {}
        }

        // CSV analysis
        if (ext === '.csv') {
          try {
            const Papa = require('papaparse');
            const content = await fs.readFile(fullPath, 'utf-8');
            const parsed = Papa.parse(content, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
            });
            const headers = parsed.meta.fields || [];
            const rowCount = parsed.data.length;

            const stats = {};
            headers.forEach(h => {
              const values = parsed.data.map(r => r[h]).filter(v => typeof v === 'number');
              if (values.length > 0) {
                stats[h] = {
                  min: Math.min(...values).toFixed(2),
                  max: Math.max(...values).toFixed(2),
                  avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
                };
              }
            });

            results.push({
              name: item,
              type: 'csv',
              rows: rowCount,
              columns: headers,
              stats,
              summary: `Dataset with ${rowCount} rows and ${headers.length} columns: ${headers.join(', ')}`,
            });
          } catch (e) {}
        }

        // Word document analysis
        if (ext === '.docx') {
          try {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ path: fullPath });
            results.push({
              name: item,
              type: 'docx',
              summary: result.value.substring(0, 500).replace(/\s+/g, ' ').trim(),
            });
          } catch (e) {}
        }

        // Markdown analysis
        if (ext === '.md') {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            results.push({
              name: item,
              type: 'markdown',
              summary: content.substring(0, 500).replace(/\s+/g, ' ').trim(),
            });
          } catch (e) {}
        }
      }
    }
  };

  await walk(projectPath);
  return results;
}

module.exports = { analyzeDocuments };