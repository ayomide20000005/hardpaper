const path = require('path');
const fs = require('fs-extra');
const os = require('os');

async function createShadowCopy(projectPath) {
  const tempDir = path.join(os.tmpdir(), 'hardpaper-shadow-' + Date.now());
  await fs.ensureDir(tempDir);

  const sensitivePatterns = [
    /api[_-]?key/i, /secret/i, /password/i, /passwd/i,
    /token/i, /auth/i, /private[_-]?key/i, /access[_-]?key/i,
    /aws/i, /firebase/i, /stripe/i, /twilio/i,
  ];

  const binaryExts = [
    '.exe', '.dll', '.bin', '.png', '.jpg', '.jpeg',
    '.gif', '.ico', '.mp4', '.mp3', '.zip', '.rar',
    '.pdf', '.docx', '.xlsx', '.woff', '.woff2', '.ttf',
  ];

  const skipDirs = ['node_modules', '.git', 'HardPaper-Output', 'dist', 'build', '.next'];

  async function copyAndSanitize(src, dest) {
    const items = await fs.readdir(src);
    for (const item of items) {
      if (skipDirs.includes(item)) continue;

      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      const stat = await fs.stat(srcPath);

      if (stat.isDirectory()) {
        await fs.ensureDir(destPath);
        await copyAndSanitize(srcPath, destPath);
      } else {
        const ext = path.extname(item).toLowerCase();
        if (binaryExts.includes(ext)) continue;

        try {
          let content = await fs.readFile(srcPath, 'utf-8');

          // Sanitize sensitive values
          content = content.replace(
            /([A-Za-z_][A-Za-z0-9_]*\s*=\s*["']?)([A-Za-z0-9_\-\/+]{20,})["']?/g,
            (match, prefix, value) => {
              const isSensitive = sensitivePatterns.some(p => p.test(prefix));
              return isSensitive ? prefix + '[REDACTED]' : match;
            }
          );

          // Completely blank out .env files
          if (item === '.env' || item.startsWith('.env.')) {
            content = '# Environment variables redacted for security\n';
          }

          await fs.writeFile(destPath, content, 'utf-8');
        } catch (e) {
          // Skip unreadable files silently
        }
      }
    }
  }

  await copyAndSanitize(projectPath, tempDir);
  return tempDir;
}

module.exports = { createShadowCopy };