const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Folder & file ops
  openFolder: () => ipcRenderer.invoke('open-folder'),
  openFile: () => ipcRenderer.invoke('open-file'),
  saveFileDialog: (defaultPath) => ipcRenderer.invoke('save-file-dialog', defaultPath),
  uploadProject: () => ipcRenderer.invoke('upload-project'),
  readDirectory: (fp) => ipcRenderer.invoke('read-directory', fp),
  readFile: (fp) => ipcRenderer.invoke('read-file', fp),
  saveFile: (fp, content) => ipcRenderer.invoke('save-file', fp, content),
  createFile: (fp) => ipcRenderer.invoke('create-file', fp),
  createFolder: (fp) => ipcRenderer.invoke('create-folder', fp),
  deleteItem: (fp) => ipcRenderer.invoke('delete-item', fp),
  renameItem: (oldPath, newPath) => ipcRenderer.invoke('rename-item', oldPath, newPath),
  watchFolder: (fp) => ipcRenderer.invoke('watch-folder', fp),

  // Git
  getGitStatus: (projectPath) => ipcRenderer.invoke('get-git-status', projectPath),

  // API key
  getApiKey: () => ipcRenderer.invoke('get-api-key'),

  // Default project path
  getDefaultProjectPath: (promptText) => ipcRenderer.invoke('get-default-project-path', promptText),

  // AI — research only
  aiEditSection: (section, content, instruction) => ipcRenderer.invoke('ai-edit-section', section, content, instruction),

  // Research
  generateResearch: (projectPath, title, author, template) => ipcRenderer.invoke('generate-research', projectPath, title, author, template),
  generateWebPreview: (projectPath, researchData) => ipcRenderer.invoke('generate-web-preview', projectPath, researchData),
  exportPdf: (projectPath) => ipcRenderer.invoke('export-pdf', projectPath),
  exportPackage: (projectPath) => ipcRenderer.invoke('export-package', projectPath),
  getLatexPreview: (projectPath) => ipcRenderer.invoke('get-latex-preview', projectPath),
  exportResearch: (projectPath, format) => ipcRenderer.invoke('export-research', projectPath, format),
  getResearchHistory: (projectPath) => ipcRenderer.invoke('get-research-history', projectPath),
  saveResearchHistory: (projectPath, entry) => ipcRenderer.invoke('save-research-history', projectPath, entry),

  // Citations
  getCitations: (projectPath) => ipcRenderer.invoke('get-citations', projectPath),
  saveCitation: (projectPath, citation) => ipcRenderer.invoke('save-citation', projectPath, citation),
  deleteCitation: (projectPath, key) => ipcRenderer.invoke('delete-citation', projectPath, key),
  validateDOI: (doi) => ipcRenderer.invoke('validate-doi', doi),

  // Experiments
  logExperiment: (projectPath, data) => ipcRenderer.invoke('log-experiment', projectPath, data),
  getExperiments: (projectPath) => ipcRenderer.invoke('get-experiments', projectPath),
  deleteExperiment: (projectPath, id) => ipcRenderer.invoke('delete-experiment', projectPath, id),

  // Live preview
  startPreview: (projectPath) => ipcRenderer.invoke('start-preview', projectPath),
  stopPreview: () => ipcRenderer.invoke('stop-preview'),
  onPreviewReady: (cb) => ipcRenderer.on('preview-ready', (e, url) => cb(url)),

  // Progress
  onResearchProgress: (cb) => ipcRenderer.on('research-progress', (e, data) => cb(data)),

  // Events
  onFolderChanged: (cb) => ipcRenderer.on('folder-changed', cb),

  // PDF compile
  compilePdf: (projectPath) => ipcRenderer.invoke('compile-pdf', projectPath),

  // Web preview window
  openPreviewWindow: (previewPath) => ipcRenderer.invoke('open-preview-window', previewPath),

  // Window
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
});