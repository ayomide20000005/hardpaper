const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');
const http = require('http');
const fss = require('fs');
require('dotenv').config();
const os = require('os');

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadApiKey() {
  try {
    const config = fs.readJsonSync(getConfigPath());
    return config.geminiApiKey || process.env.GEMINI_API_KEY || null;
  } catch (e) {
    return process.env.GEMINI_API_KEY || null;
  }
}

function saveApiKey(key) {
  const configPath = getConfigPath();
  fs.ensureFileSync(configPath);
  fs.writeJsonSync(configPath, { geminiApiKey: key }, { spaces: 2 });
}

let mainWindow;
let watcher;
let previewServer = null;
let previewPort = 3939;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#1a1a1a',
    titleBarStyle: 'hidden',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── FOLDER & FILE OPS ─────────────────────────────────────────────
ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt', 'md', 'json', 'js', 'ts', 'py', 'html', 'css'] },
    ],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('save-file-dialog', async (event, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle('upload-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Upload Project — Select Your Project Folder',
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('read-directory', async (event, folderPath) => {
  const buildTree = async (dirPath) => {
    const items = await fs.readdir(dirPath);
    const tree = [];
    for (const item of items) {
      if (item === 'node_modules' || item === '.git') continue;
      const fullPath = path.join(dirPath, item);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        tree.push({ name: item, path: fullPath, type: 'folder', children: await buildTree(fullPath) });
      } else {
        tree.push({ name: item, path: fullPath, type: 'file' });
      }
    }
    return tree;
  };
  return await buildTree(folderPath);
});

ipcMain.handle('read-file', async (event, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const binaryExts = ['.exe', '.dll', '.bin', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.mp4', '.mp3', '.zip', '.rar'];
  if (binaryExts.includes(ext)) return '// Binary file — cannot display';
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (e) {
    return '// Could not read file: ' + e.message;
  }
});

ipcMain.handle('save-file', async (event, filePath, content) => {
  await fs.writeFile(filePath, content, 'utf-8');
  return true;
});

ipcMain.handle('create-file', async (event, filePath) => { await fs.ensureFile(filePath); return true; });
ipcMain.handle('create-folder', async (event, folderPath) => { await fs.ensureDir(folderPath); return true; });
ipcMain.handle('delete-item', async (event, itemPath) => { await fs.remove(itemPath); return true; });
ipcMain.handle('rename-item', async (event, oldPath, newPath) => { await fs.move(oldPath, newPath); return true; });

ipcMain.handle('watch-folder', async (event, folderPath) => {
  if (watcher) watcher.close();
  watcher = chokidar.watch(folderPath, { ignored: /(node_modules|\.git)/, persistent: true });
  watcher.on('all', () => mainWindow.webContents.send('folder-changed'));
  return true;
});

// ── GIT STATUS ────────────────────────────────────────────────────
ipcMain.handle('get-git-status', async (event, projectPath) => {
  try {
    const simpleGit = require('simple-git');
    const git = simpleGit(projectPath);
    const status = await git.status();
    const fileStatuses = {};
    status.modified.forEach(f => fileStatuses[f] = 'modified');
    status.not_added.forEach(f => fileStatuses[f] = 'untracked');
    status.created.forEach(f => fileStatuses[f] = 'created');
    status.deleted.forEach(f => fileStatuses[f] = 'deleted');
    return fileStatuses;
  } catch (e) { return {}; }
});

// ── API KEY ───────────────────────────────────────────────────────
ipcMain.handle('get-api-key', () => loadApiKey());
ipcMain.handle('save-api-key', (event, key) => { saveApiKey(key); return true; });

// ── AI — SECTION EDIT ────────────────────────────────────────────
ipcMain.handle('ai-edit-section', async (event, section, content, instruction) => {
  const { editResearchSection } = require('./claude');
  const apiKey = loadApiKey();
  if (!apiKey) throw new Error('No Gemini API key found in .env file');
  return await editResearchSection(section, content, instruction, apiKey);
});

// ── RESEARCH GENERATION ───────────────────────────────────────────
ipcMain.handle('generate-research', async (event, projectPath, title, author, template) => {
  const { generateResearch } = require('./claude');
  const apiKey = loadApiKey();
  if (!apiKey) throw new Error('No Gemini API key found in .env file');

  const steps = [
    { id: 1, label: 'Creating shadow copy...' },
    { id: 2, label: 'Sanitizing API keys...' },
    { id: 3, label: 'Analyzing code structure (AST)...' },
    { id: 4, label: 'Analyzing documents...' },
    { id: 5, label: 'Sending to AI...' },
    { id: 6, label: 'Filling template...' },
    { id: 7, label: 'Compiling output...' },
  ];

  const sendProgress = (step, total) => {
    mainWindow.webContents.send('research-progress', { step, total, label: steps[step - 1].label });
  };

  return await generateResearch(projectPath, apiKey, title, author, template, sendProgress);
});

// ── RESEARCH WEB PREVIEW ──────────────────────────────────────────
ipcMain.handle('generate-web-preview', async (event, projectPath, researchData) => {
  const { generateWebPreview } = require('./researchPreview');
  const apiKey = loadApiKey();
  if (!apiKey) throw new Error('No Gemini API key found in .env file');
  return await generateWebPreview(projectPath, researchData, apiKey);
});

// ── RESEARCH EXPORT ───────────────────────────────────────────────
ipcMain.handle('export-research', async (event, projectPath, format) => {
  const { exportResearch } = require('./generators/exportGenerator');
  return await exportResearch(projectPath, format);
});

// ── RESEARCH HISTORY ──────────────────────────────────────────────
ipcMain.handle('get-research-history', async (event, projectPath) => {
  const historyPath = path.join(projectPath, 'HardPaper-Output', 'history.json');
  try { return await fs.readJson(historyPath); } catch (e) { return []; }
});

ipcMain.handle('save-research-history', async (event, projectPath, entry) => {
  const historyPath = path.join(projectPath, 'HardPaper-Output', 'history.json');
  await fs.ensureFile(historyPath);
  let history = [];
  try { history = await fs.readJson(historyPath); } catch (e) {}
  history.unshift(entry);
  if (history.length > 10) history = history.slice(0, 10);
  await fs.writeJson(historyPath, history, { spaces: 2 });
  return true;
});

// ── CITATION MANAGER ──────────────────────────────────────────────
ipcMain.handle('get-citations', async (event, projectPath) => {
  const { getCitations } = require('./generators/citationManager');
  return await getCitations(projectPath);
});

ipcMain.handle('save-citation', async (event, projectPath, citation) => {
  const { saveCitation } = require('./generators/citationManager');
  return await saveCitation(projectPath, citation);
});

ipcMain.handle('delete-citation', async (event, projectPath, key) => {
  const { deleteCitation } = require('./generators/citationManager');
  return await deleteCitation(projectPath, key);
});

ipcMain.handle('validate-doi', async (event, doi) => {
  const { validateDOI } = require('./generators/citationManager');
  return await validateDOI(doi);
});

// ── EXPERIMENT TRACKER ────────────────────────────────────────────
ipcMain.handle('log-experiment', async (event, projectPath, data) => {
  const { logExperiment } = require('./experimentTracker');
  return await logExperiment(projectPath, data);
});

ipcMain.handle('get-experiments', async (event, projectPath) => {
  const { getExperiments } = require('./experimentTracker');
  return await getExperiments(projectPath);
});

ipcMain.handle('delete-experiment', async (event, projectPath, id) => {
  const { deleteExperiment } = require('./experimentTracker');
  return await deleteExperiment(projectPath, id);
});


// ── LIVE PREVIEW ──────────────────────────────────────────────────
ipcMain.handle('start-preview', async (event, projectPath) => {
  if (previewServer) { previewServer.close(); previewServer = null; }
  const clients = [];

  previewServer = http.createServer((req, res) => {
    if (req.url === '/__reload') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      clients.push(res);
      req.on('close', () => clients.splice(clients.indexOf(res), 1));
      return;
    }
    let urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const filePath = path.join(projectPath, urlPath);
    const mimeTypes = {
      '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    };
    fss.exists(filePath, exists => {
      if (!exists) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath);
      const mime = mimeTypes[ext] || 'text/plain';
      if (ext === '.html') {
        fss.readFile(filePath, 'utf-8', (err, data) => {
          if (err) { res.writeHead(500); res.end('Error'); return; }
          const injected = data.replace('</body>', `<script>
            const es = new EventSource('/__reload');
            es.onmessage = () => location.reload();
          </script></body>`);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(injected);
        });
      } else {
        res.writeHead(200, { 'Content-Type': mime });
        fss.createReadStream(filePath).pipe(res);
      }
    });
  });

  const previewWatcher = chokidar.watch(projectPath, { ignored: /(node_modules|\.git)/, persistent: true });
  previewWatcher.on('change', () => clients.forEach(c => c.write('data: reload\n\n')));
  previewServer.listen(previewPort, () => mainWindow.webContents.send('preview-ready', `http://localhost:${previewPort}`));
  return { url: `http://localhost:${previewPort}` };
});

ipcMain.handle('stop-preview', async () => {
  if (previewServer) { previewServer.close(); previewServer = null; }
  return true;
});

// ── DEFAULT PROJECT PATH ───────────────────────────────────
ipcMain.handle('get-default-project-path', async (event, promptText) => {
  const base = path.join(os.homedir(), 'Documents', 'HardPaper-Projects');
  const slug = (promptText || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40) || 'project';
  const projectPath = path.join(base, slug);
  await fs.ensureDir(projectPath);
  return projectPath;
});

// ── PDF COMPILE ───────────────────────────────────────────────────
ipcMain.handle('compile-pdf', async (event, projectPath) => {
  const { exportToPDF } = require('./generators/pdfExporter');
  return await exportToPDF(projectPath);
});

// ── WEB PREVIEW WINDOW ────────────────────────────────────────────
ipcMain.handle('open-preview-window', async (event, previewPath) => {
  const previewWin = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'HardPaper — Research Preview',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  previewWin.loadURL('file://' + previewPath);
  return true;
});

// ── WINDOW CONTROLS ───────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => { if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); });
ipcMain.on('window-close', () => mainWindow.close());