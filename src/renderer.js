'use strict';

// ── STATE ─────────────────────────────────────────────────────────
let currentProjectPath = null;
let currentFilePath = null;
let openTabs = [];
let editor = null;
let isLight = false;
let contextTargetPath = null;
let hasApiKey = false;
let hasGeminiKey = false;
let previewRunning = false;
let gitStatus = {};
let unsavedFiles = new Set();
let editorFontSize = 13;
let untitledCount = 0;
let lastResearchData = null;


// ── CHECK API KEY ─────────────────────────────────────────────────
window.api.getApiKey().then(key => {
  hasApiKey = !!key;
  hasGeminiKey = !!key;
});

function promptApiKey(onSuccess) {
  const existing = document.getElementById('api-key-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'api-key-modal';
  modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.75);
    display:flex;align-items:center;justify-content:center;z-index:9999999;backdrop-filter:blur(4px);`;

  modal.innerHTML = `
    <div style="background:var(--bg3);border:1px solid var(--glass-border);border-radius:12px;
      padding:32px;width:440px;box-shadow:0 16px 48px rgba(0,0,0,0.7);">
      <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px;">
        ⬡ Enter Gemini API Key
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:20px;line-height:1.6;">
        Get your free API key from 
        <a href="https://aistudio.google.com" target="_blank" 
          style="color:var(--accent);">aistudio.google.com</a>.<br>
        Your key is saved locally on your machine only.
      </div>
      <input id="api-key-input" type="password" placeholder="Paste your Gemini API key..."
        style="width:100%;padding:10px;background:var(--bg4);border:1px solid var(--border);
        border-radius:6px;color:var(--text);font-size:13px;outline:none;margin-bottom:16px;"/>
      <div style="display:flex;gap:10px;">
        <button id="api-key-save" style="flex:1;padding:10px;background:linear-gradient(135deg,var(--accent),var(--accent-hover));
          color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;">
          Save & Continue
        </button>
        <button id="api-key-cancel" style="padding:10px 20px;background:var(--bg4);
          color:var(--text2);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:13px;">
          Cancel
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  document.getElementById('api-key-save').addEventListener('click', async () => {
    const key = document.getElementById('api-key-input').value.trim();
    if (!key) return toast('Please enter your API key', 'error');
    await window.api.saveApiKey(key);
    hasApiKey = true;
    hasGeminiKey = true;
    modal.remove();
    toast('API key saved!', 'success');
    if (onSuccess) onSuccess();
  });

  document.getElementById('api-key-cancel').addEventListener('click', () => modal.remove());
}

// ── RESEARCH PROGRESS ─────────────────────────────────────────────
window.api.onResearchProgress(({ step, total, label }) => {
  const wrap = document.getElementById('research-progress-wrap');
  const fill = document.getElementById('progress-bar-fill');
  const labelEl = document.getElementById('progress-label');
  const stepEl = document.getElementById('progress-step');

  wrap.style.display = 'block';
  fill.style.width = ((step / total) * 100) + '%';
  labelEl.textContent = label;
  stepEl.textContent = `Step ${step} of ${total}`;
});

// ── MONACO ───────────────────────────────────────────────────────
const monacoScript = document.createElement('script');
monacoScript.src = '../node_modules/monaco-editor/min/vs/loader.js';
monacoScript.onload = () => {
  window.require.config({ paths: { vs: '../node_modules/monaco-editor/min/vs' } });
  window.require(['vs/editor/editor.main'], () => {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
      value: '',
      language: 'plaintext',
      theme: 'vs-dark',
      fontSize: editorFontSize,
      fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
      fontLigatures: true,
      minimap: { enabled: true },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      lineNumbers: 'on',
      renderLineHighlight: 'line',
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      tabSize: 2,
      padding: { top: 8 },
      bracketPairColorization: { enabled: true },
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCurrentFile);
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, formatDocument);

    editor.onDidChangeCursorPosition(e => {
      document.getElementById('status-lines').textContent =
        `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });

    editor.onDidChangeModelContent(() => {
      if (currentFilePath) {
        unsavedFiles.add(currentFilePath);
        updateTabUnsaved(currentFilePath, true);
      }
    });
  });
};
document.head.appendChild(monacoScript);


// ── THEME ────────────────────────────────────────────────────────
function toggleTheme() {
  isLight = !isLight;
  document.body.classList.toggle('light', isLight);
  if (editor) monaco.editor.setTheme(isLight ? 'vs' : 'vs-dark');
  toast(isLight ? '☀️ Light mode' : '🌙 Dark mode', 'info');
}

// ── WINDOW CONTROLS ──────────────────────────────────────────────
document.getElementById('btn-minimize').addEventListener('click', () => window.api.windowMinimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.api.windowMaximize());
document.getElementById('btn-close').addEventListener('click', () => window.api.windowClose());

// ── MENU BAR ─────────────────────────────────────────────────────
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

document.addEventListener('click', () => {
  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
  document.getElementById('context-menu').classList.remove('show');
});

// File menu
document.getElementById('dd-new-text-file').addEventListener('click', newTextFile);
document.getElementById('dd-new-file').addEventListener('click', createNewFile);
document.getElementById('dd-new-folder').addEventListener('click', createNewFolder);
document.getElementById('dd-open-file').addEventListener('click', openSingleFile);
document.getElementById('dd-open-folder').addEventListener('click', openFolder);
document.getElementById('dd-upload-project').addEventListener('click', uploadProject);
document.getElementById('dd-save').addEventListener('click', saveCurrentFile);
document.getElementById('dd-save-as').addEventListener('click', saveFileAs);
document.getElementById('dd-close').addEventListener('click', () => window.api.windowClose());

// Edit menu
document.getElementById('dd-undo').addEventListener('click', () => editor ? editor.trigger('keyboard', 'undo', null) : toast('No file open', 'error'));
document.getElementById('dd-redo').addEventListener('click', () => editor ? editor.trigger('keyboard', 'redo', null) : toast('No file open', 'error'));
document.getElementById('dd-find').addEventListener('click', () => editor ? editor.trigger('keyboard', 'actions.find', null) : toast('No file open', 'error'));
document.getElementById('dd-replace').addEventListener('click', () => editor ? editor.trigger('keyboard', 'editor.action.startFindReplaceAction', null) : toast('No file open', 'error'));
document.getElementById('dd-format').addEventListener('click', formatDocument);

// View menu
document.getElementById('dd-toggle-theme').addEventListener('click', toggleTheme);
document.getElementById('dd-toggle-explorer').addEventListener('click', toggleExplorer);
document.getElementById('dd-toggle-preview').addEventListener('click', () => previewRunning ? stopPreview() : startPreview());
document.getElementById('dd-zoom-in').addEventListener('click', () => zoomEditor(1));
document.getElementById('dd-zoom-out').addEventListener('click', () => zoomEditor(-1));

// Run menu
document.getElementById('dd-start-preview').addEventListener('click', startPreview);
document.getElementById('dd-stop-preview').addEventListener('click', stopPreview);
document.getElementById('dd-generate-research').addEventListener('click', generateResearch);
document.getElementById('dd-generate-web-preview').addEventListener('click', generateWebPreview);

// Help menu
document.getElementById('dd-shortcuts').addEventListener('click', showShortcuts);
document.getElementById('dd-about').addEventListener('click', showAbout);

// ── TOOLBAR BUTTONS ───────────────────────────────────────────────
document.getElementById('tb-format').addEventListener('click', formatDocument);
document.getElementById('tb-wordwrap').addEventListener('click', () => {
  if (!editor) return toast('No file open', 'error');
  const current = editor.getOption(monaco.editor.EditorOption.wordWrap);
  const next = current === 'off' ? 'on' : 'off';
  editor.updateOptions({ wordWrap: next });
  document.getElementById('tb-wordwrap').classList.toggle('active', next === 'on');
  toast(`Word wrap: ${next}`, 'info');
});
document.getElementById('tb-preview').addEventListener('click', () => previewRunning ? stopPreview() : startPreview());

// ── NEW TEXT FILE ─────────────────────────────────────────────────
function newTextFile() {
  untitledCount++;
  const name = `Untitled-${untitledCount}`;
  const fakePath = `__untitled__/${name}`;

  if (!openTabs.find(t => t.path === fakePath)) {
    openTabs.push({ path: fakePath, name, untitled: true });
  }

  currentFilePath = fakePath;
  renderTabs();

  document.getElementById('welcome').style.display = 'none';
  document.getElementById('editor-container').style.display = 'flex';

  if (editor) {
    const model = monaco.editor.createModel('', 'plaintext');
    editor.setModel(model);
  }

  document.getElementById('status-file').textContent = name;
  document.getElementById('status-lang').textContent = 'Plain Text';
  document.getElementById('toolbar-file-info').textContent = name;
  toast(`New file: ${name}`, 'info');
}

// ── OPEN SINGLE FILE ─────────────────────────────────────────────
async function openSingleFile() {
  const filePath = await window.api.openFile();
  if (!filePath) return;
  const fileName = filePath.split(/[\\/]/).pop();
  await openFile(filePath, fileName);
  toast(`Opened: ${fileName}`, 'success');
}

// ── UPLOAD PROJECT ───────────────────────────────────────────────
async function uploadProject() {
  const folderPath = await window.api.uploadProject();
  if (!folderPath) return;
  currentProjectPath = folderPath;
  const name = folderPath.split(/[\\/]/).pop().toUpperCase();
  document.getElementById('project-name-label').textContent = name;
  document.getElementById('project-name-bar').style.display = 'flex';
  document.getElementById('status-branch').innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/>
      <circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/>
    </svg> ${name.toLowerCase()}`;

  await loadFileTree();
  await window.api.watchFolder(folderPath);
  refreshGitStatus();

  toast(`Project uploaded: ${name}`, 'success');
}

// ── SAVE FILE AS ─────────────────────────────────────────────────
async function saveFileAs() {
  if (!editor) return toast('No file open', 'error');
  const defaultName = currentFilePath ? currentFilePath.split(/[\\/]/).pop() : 'untitled.txt';
  const savePath = await window.api.saveFileDialog(defaultName);
  if (!savePath) return;
  await window.api.saveFile(savePath, editor.getValue());
  const fileName = savePath.split(/[\\/]/).pop();

  if (currentFilePath && currentFilePath.startsWith('__untitled__')) {
    const tabIdx = openTabs.findIndex(t => t.path === currentFilePath);
    if (tabIdx >= 0) {
      openTabs[tabIdx] = { path: savePath, name: fileName, untitled: false };
    }
  }

  currentFilePath = savePath;
  unsavedFiles.delete(currentFilePath);
  renderTabs();
  toast(`Saved as: ${fileName}`, 'success');
}

// ── OPEN FOLDER ──────────────────────────────────────────────────
async function openFolder() {
  const folderPath = await window.api.openFolder();
  if (!folderPath) return;
  currentProjectPath = folderPath;
  const name = folderPath.split(/[\\/]/).pop().toUpperCase();
  document.getElementById('project-name-label').textContent = name;
  document.getElementById('project-name-bar').style.display = 'flex';
  document.getElementById('status-branch').innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/>
      <circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/>
    </svg> ${name.toLowerCase()}`;

  await loadFileTree();
  await window.api.watchFolder(folderPath);
  refreshGitStatus();

  toast(`Opened: ${name}`, 'success');
}

document.getElementById('btn-open-folder').addEventListener('click', openFolder);
document.getElementById('welcome-open-btn').addEventListener('click', openFolder);
document.getElementById('empty-open-btn').addEventListener('click', openFolder);
document.getElementById('welcome-new-btn').addEventListener('click', newTextFile);
document.getElementById('welcome-upload-btn').addEventListener('click', uploadProject);
window.api.onFolderChanged(() => { loadFileTree(); refreshGitStatus(); });

// ── GIT STATUS ────────────────────────────────────────────────────
async function refreshGitStatus() {
  if (!currentProjectPath) return;
  gitStatus = await window.api.getGitStatus(currentProjectPath);
  updateGitDots();
}

function updateGitDots() {
  document.querySelectorAll('.tree-file').forEach(el => {
    const filePath = el.dataset.path;
    if (!filePath) return;
    const rel = filePath.replace(currentProjectPath, '').replace(/\\/g, '/').replace(/^\//, '');
    const existing = el.querySelector('.git-dot');
    if (existing) existing.remove();
    if (gitStatus[rel]) {
      const dot = document.createElement('span');
      dot.className = `git-dot git-${gitStatus[rel]}`;
      el.appendChild(dot);
    }
  });
}

// ── FILE TREE ─────────────────────────────────────────────────────
async function loadFileTree() {
  if (!currentProjectPath) return;
  const tree = await window.api.readDirectory(currentProjectPath);
  const container = document.getElementById('file-tree');
  container.innerHTML = '';
  renderTree(tree, container, 0);
  setTimeout(updateGitDots, 100);
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    js: '📄', ts: '📘', jsx: '⚛️', tsx: '⚛️', py: '🐍',
    html: '🌐', css: '🎨', scss: '🎨', json: '📋', md: '📝',
    txt: '📄', rs: '🦀', go: '🐹', java: '☕', cpp: '⚙️',
    c: '⚙️', cs: '💜', sh: '💻', env: '🔑', gitignore: '🚫',
    csv: '📊', pdf: '📕', docx: '📘', tex: '📄', bib: '📚',
  };
  return map[ext] || '📄';
}

function renderTree(items, container, depth) {
  items.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'folder' ? -1 : 1;
  });

  items.forEach(item => {
    const indent = depth * 12 + 8;
    if (item.type === 'folder') {
      const folderEl = document.createElement('div');
      folderEl.className = 'tree-folder';
      folderEl.style.paddingLeft = indent + 'px';
      folderEl.innerHTML = `
        <span class="tree-arrow">▶</span>
        <span class="tree-icon">📁</span>
        <span class="tree-name">${item.name}</span>`;
      folderEl.dataset.path = item.path;

      const childWrap = document.createElement('div');
      childWrap.style.display = 'none';
      let open = false;

      folderEl.addEventListener('click', e => {
        e.stopPropagation();
        open = !open;
        childWrap.style.display = open ? 'block' : 'none';
        folderEl.querySelector('.tree-arrow').classList.toggle('open', open);
        folderEl.querySelector('.tree-icon').textContent = open ? '📂' : '📁';
      });

      folderEl.addEventListener('contextmenu', e => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, item.path);
      });

      if (item.children) renderTree(item.children, childWrap, depth + 1);
      container.appendChild(folderEl);
      container.appendChild(childWrap);
    } else {
      const fileEl = document.createElement('div');
      fileEl.className = 'tree-file';
      fileEl.style.paddingLeft = indent + 'px';
      fileEl.innerHTML = `
        <span class="tree-icon">${getFileIcon(item.name)}</span>
        <span class="tree-name">${item.name}</span>`;
      fileEl.dataset.path = item.path;

      fileEl.addEventListener('click', () => openFile(item.path, item.name));
      fileEl.addEventListener('contextmenu', e => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, item.path);
      });

      container.appendChild(fileEl);
    }
  });
}

// ── OPEN FILE ────────────────────────────────────────────────────
async function openFile(filePath, fileName) {
  const content = await window.api.readFile(filePath);
  currentFilePath = filePath;

  if (!openTabs.find(t => t.path === filePath)) {
    openTabs.push({ path: filePath, name: fileName });
  }

  renderTabs();

  document.getElementById('welcome').style.display = 'none';
  document.getElementById('editor-container').style.display = 'flex';

  const lang = getLanguage(fileName);
  if (editor) {
    const model = monaco.editor.createModel(content, lang);
    editor.setModel(model);
  }

  document.getElementById('status-file').textContent = fileName;
  document.getElementById('status-lang').textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
  document.getElementById('toolbar-file-info').textContent = fileName;

  document.querySelectorAll('.tree-file').forEach(el => {
    el.classList.toggle('active', el.dataset.path === filePath);
  });
}

function getLanguage(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    py: 'python', html: 'html', css: 'css', scss: 'scss', json: 'json',
    md: 'markdown', rs: 'rust', go: 'go', java: 'java', cpp: 'cpp',
    c: 'c', cs: 'csharp', sh: 'shell', tex: 'latex', bib: 'plaintext',
    csv: 'plaintext', txt: 'plaintext', log: 'plaintext', ini: 'plaintext',
    cfg: 'plaintext', env: 'plaintext', yaml: 'yaml', yml: 'yaml',
    xml: 'xml', sql: 'sql', rb: 'ruby', php: 'php', swift: 'swift',
    kt: 'kotlin', r: 'r',
  };
  return map[ext] || 'plaintext';
}

// ── TABS ─────────────────────────────────────────────────────────
function renderTabs() {
  const list = document.getElementById('tabs-list');
  list.innerHTML = '';
  openTabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.path === currentFilePath ? ' active' : '');
    if (unsavedFiles.has(tab.path)) el.classList.add('tab-unsaved');

    el.innerHTML = `<span>${tab.name}</span><span class="tab-close">×</span>`;
    el.addEventListener('click', () => {
      if (tab.untitled) {
        currentFilePath = tab.path;
        renderTabs();
        if (editor) editor.setValue('');
        document.getElementById('welcome').style.display = 'none';
        document.getElementById('editor-container').style.display = 'flex';
      } else {
        openFile(tab.path, tab.name);
      }
    });
    el.querySelector('.tab-close').addEventListener('click', e => {
      e.stopPropagation();
      closeTab(tab.path);
    });
    list.appendChild(el);
  });
}

function updateTabUnsaved(filePath, unsaved) {
  const tabs = document.querySelectorAll('.tab');
  openTabs.forEach((tab, i) => {
    if (tab.path === filePath && tabs[i]) {
      tabs[i].classList.toggle('tab-unsaved', unsaved);
    }
  });
}

function closeTab(filePath) {
  openTabs = openTabs.filter(t => t.path !== filePath);
  unsavedFiles.delete(filePath);
  if (currentFilePath === filePath) {
    if (openTabs.length > 0) {
      const last = openTabs[openTabs.length - 1];
      if (last.untitled) {
        currentFilePath = last.path;
        renderTabs();
        if (editor) editor.setValue('');
      } else {
        openFile(last.path, last.name);
      }
    } else {
      currentFilePath = null;
      document.getElementById('welcome').style.display = 'flex';
      document.getElementById('editor-container').style.display = 'none';
      document.getElementById('status-file').textContent = 'No file open';
      document.getElementById('status-lang').textContent = 'Plain Text';
      document.getElementById('toolbar-file-info').textContent = '';
    }
  }
  renderTabs();
}

// ── SAVE FILE ────────────────────────────────────────────────────
async function saveCurrentFile() {
  if (!editor) return toast('No file open to save', 'error');

  if (currentFilePath && currentFilePath.startsWith('__untitled__')) {
    return saveFileAs();
  }

  if (!currentFilePath) return toast('No file open to save', 'error');
  await window.api.saveFile(currentFilePath, editor.getValue());
  unsavedFiles.delete(currentFilePath);
  updateTabUnsaved(currentFilePath, false);
  toast('Saved', 'success');
}

// ── FORMAT ───────────────────────────────────────────────────────
function formatDocument() {
  if (!editor) return toast('No file open', 'error');
  editor.trigger('keyboard', 'editor.action.formatDocument', null);
  toast('Document formatted', 'success');
}

// ── ZOOM ─────────────────────────────────────────────────────────
function zoomEditor(delta) {
  if (!editor) return;
  editorFontSize = Math.max(10, Math.min(24, editorFontSize + delta));
  editor.updateOptions({ fontSize: editorFontSize });
  toast(`Font size: ${editorFontSize}px`, 'info');
}

// ── NEW FILE / FOLDER ────────────────────────────────────────────
async function createNewFile() {
  if (!currentProjectPath) return newTextFile();
  const name = prompt('File name:');
  if (!name) return;
  const base = contextTargetPath || currentProjectPath;
  await window.api.createFile(base + '/' + name);
  await loadFileTree();
  toast(`Created: ${name}`, 'success');
}

async function createNewFolder() {
  if (!currentProjectPath) return toast('Open a folder first', 'error');
  const name = prompt('Folder name:');
  if (!name) return;
  const base = contextTargetPath || currentProjectPath;
  await window.api.createFolder(base + '/' + name);
  await loadFileTree();
  toast(`Created folder: ${name}`, 'success');
}

document.getElementById('btn-new-file').addEventListener('click', createNewFile);
document.getElementById('btn-new-folder').addEventListener('click', createNewFolder);

document.getElementById('btn-refresh').addEventListener('click', async () => {
  await loadFileTree();
  await refreshGitStatus();
  toast('Refreshed', 'info');
});

// ── ACTIVITY BAR ─────────────────────────────────────────────────
document.getElementById('act-explorer').addEventListener('click', () => {
  document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('act-explorer').classList.add('active');
  document.getElementById('sidebar').style.display = 'flex';
});

document.getElementById('act-search').addEventListener('click', () => {
  document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('act-search').classList.add('active');
  if (editor) editor.trigger('keyboard', 'actions.find', null);
  else toast('Open a file to search', 'error');
});

document.getElementById('act-git').addEventListener('click', () => {
  document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('act-git').classList.add('active');
  refreshGitStatus();
  showInfoModal('Source Control', `
    <div style="font-size:12px;color:var(--text2);line-height:2.2;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="width:8px;height:8px;background:var(--accent2);border-radius:50%;display:inline-block;"></span>
        Green dot = new / untracked file
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <span style="width:8px;height:8px;background:var(--warning);border-radius:50%;display:inline-block;"></span>
        Yellow dot = modified file
      </div>
      Git changelog is auto-generated when you click
      <b style="color:var(--text);">Generate Research Package</b>.<br><br>
      Saved to: <code style="color:var(--accent);font-size:11px;">HardPaper-Output/</code>
    </div>
  `);
});

document.getElementById('act-experiment').addEventListener('click', () => {
  document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('act-experiment').classList.add('active');
  showExperimentTracker();
});

document.getElementById('act-citations').addEventListener('click', () => {
  document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('act-citations').classList.add('active');
  showCitationManager();
});

document.getElementById('act-preview').addEventListener('click', () => {
  document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('act-preview').classList.add('active');
  if (previewRunning) stopPreview(); else startPreview();
});

document.getElementById('act-settings').addEventListener('click', () => {
  document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('act-settings').classList.add('active');
  showInfoModal('Settings', `
    <div style="font-size:12px;color:var(--text2);line-height:2.2;">
      <b style="color:var(--text);">Gemini API Key</b><br>
      Add to <code style="color:var(--accent);">.env</code>:
      <code style="color:var(--accent);font-size:11px;">GEMINI_API_KEY=your_key</code><br><br>
      <b style="color:var(--text);">Theme</b> — View → Toggle Light/Dark<br>
      <b style="color:var(--text);">Format</b> — Shift+Alt+F<br>
      <b style="color:var(--text);">Commands</b> — Ctrl+Shift+P
    </div>
  `);
});

// ── EXPERIMENT TRACKER ────────────────────────────────────────────
async function showExperimentTracker() {
  if (!currentProjectPath) return showInfoModal('Experiment Tracker', '<p style="color:var(--text2);font-size:12px;">Open a project first.</p>');

  const experiments = await window.api.getExperiments(currentProjectPath);

  const logBtn = `
    <button onclick="logNewExperiment()" style="
      padding:7px 16px;background:linear-gradient(135deg,var(--accent),var(--accent-hover));
      color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;margin-bottom:12px;
      box-shadow:0 4px 12px rgba(157,125,255,0.3);">
      + Log New Experiment
    </button>`;

  if (!experiments.length) {
    return showInfoModal('Experiment Tracker', logBtn + '<p style="color:var(--text2);font-size:12px;">No experiments logged yet.</p>');
  }

  const html = logBtn + experiments.map(e => `
    <div class="experiment-row">
      <div class="experiment-id">${e.runId} ${e.gitCommit ? `· <span style="color:var(--text3);">${e.gitCommit}</span>` : ''}</div>
      <div class="experiment-meta">
        <div style="color:var(--text3);font-size:10px;">${new Date(e.timestamp).toLocaleString()}</div>
        ${e.dataset ? `<div>Dataset: <b style="color:var(--text);">${e.dataset}</b></div>` : ''}
        ${e.hardware ? `<div>Hardware: <b style="color:var(--text);">${e.hardware}</b></div>` : ''}
        <div style="margin-top:4px;">
          ${e.accuracy !== undefined ? `<span class="experiment-metric">accuracy: ${e.accuracy}</span>` : ''}
          ${e.loss !== undefined ? `<span class="experiment-metric">loss: ${e.loss}</span>` : ''}
          ${e.epochs !== undefined ? `<span class="experiment-metric">epochs: ${e.epochs}</span>` : ''}
          ${e.lr !== undefined ? `<span class="experiment-metric">lr: ${e.lr}</span>` : ''}
          ${e.batchSize !== undefined ? `<span class="experiment-metric">batch: ${e.batchSize}</span>` : ''}
        </div>
        ${e.notes ? `<div style="margin-top:4px;font-style:italic;color:var(--text3);">${e.notes}</div>` : ''}
      </div>
    </div>`).join('');

  showInfoModal('Experiment Tracker', html);
}

window.logNewExperiment = async function() {
  if (!currentProjectPath) return toast('Open a project first', 'error');

  const data = {
    accuracy: prompt('Accuracy (e.g. 0.95):') || undefined,
    loss: prompt('Loss (e.g. 0.05):') || undefined,
    epochs: prompt('Epochs:') || undefined,
    lr: prompt('Learning rate:') || undefined,
    batchSize: prompt('Batch size:') || undefined,
    dataset: prompt('Dataset version:') || undefined,
    hardware: prompt('Hardware (e.g. RTX 3090):') || undefined,
    notes: prompt('Notes:') || undefined,
  };

  Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });
  await window.api.logExperiment(currentProjectPath, data);
  toast('Experiment logged!', 'success');
  showExperimentTracker();
};

// ── CITATION MANAGER ─────────────────────────────────────────────
async function showCitationManager() {
  if (!currentProjectPath) return showInfoModal('Citation Manager', '<p style="color:var(--text2);font-size:12px;">Open a project first.</p>');

  const citations = await window.api.getCitations(currentProjectPath);

  const addBtn = `
    <button onclick="addNewCitation()" style="
      padding:7px 16px;background:linear-gradient(135deg,var(--accent),var(--accent-hover));
      color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;margin-bottom:12px;
      box-shadow:0 4px 12px rgba(157,125,255,0.3);">
      + Add Citation
    </button>`;

  if (!citations.length) {
    return showInfoModal('Citation Manager', addBtn + `
      <p style="color:var(--text2);font-size:12px;">
        No citations found.<br>
        Create a <code style="color:var(--accent);">references.bib</code> file or click Add Citation.
      </p>`);
  }

  const html = addBtn + citations.map(c => `
    <div class="citation-item">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div class="citation-key">@${c.type || 'misc'}{${c.key}}</div>
        <div style="display:flex;gap:6px;">
          ${c.doi ? `<button onclick="validateCitationDOI('${c.doi}')" style="font-size:10px;background:none;border:1px solid var(--border);color:var(--text3);border-radius:3px;padding:2px 6px;cursor:pointer;">Validate DOI</button>` : ''}
          <button onclick="deleteCitationItem('${c.key}')" style="font-size:10px;background:none;border:1px solid var(--accent3);color:var(--accent3);border-radius:3px;padding:2px 6px;cursor:pointer;">Delete</button>
        </div>
      </div>
      <div class="citation-title">${c.title || 'No title'}</div>
      <div class="citation-authors">${c.author || 'No author'}</div>
      ${c.year ? `<div class="citation-doi">${c.year}${c.journal ? ' · ' + c.journal : ''}</div>` : ''}
      ${c.doi ? `<div class="citation-doi">DOI: ${c.doi}</div>` : ''}
      ${c.duplicate ? `<div style="color:var(--warning);font-size:10px;margin-top:4px;">⚠ Possible duplicate</div>` : ''}
    </div>`).join('');

  showInfoModal('Citation Manager', html);
}

window.addNewCitation = async function() {
  if (!currentProjectPath) return;
  const citation = {
    type: prompt('Type (article/book/misc):') || 'misc',
    key: prompt('Citation key (e.g. smith2024):') || `ref${Date.now()}`,
    title: prompt('Title:') || '',
    author: prompt('Author(s):') || '',
    year: prompt('Year:') || '',
    doi: prompt('DOI (optional):') || '',
    journal: prompt('Journal/Booktitle (optional):') || '',
  };
  Object.keys(citation).forEach(k => { if (!citation[k]) delete citation[k]; });
  await window.api.saveCitation(currentProjectPath, citation);
  toast('Citation saved!', 'success');
  showCitationManager();
};

window.deleteCitationItem = async function(key) {
  if (!confirm(`Delete citation: ${key}?`)) return;
  await window.api.deleteCitation(currentProjectPath, key);
  toast('Citation deleted', 'info');
  showCitationManager();
};

window.validateCitationDOI = async function(doi) {
  showLoading('Validating DOI...');
  try {
    const result = await window.api.validateDOI(doi);
    if (result.valid) toast('DOI is valid ✓', 'success');
    else toast('DOI is invalid or unreachable', 'error');
  } catch (e) {
    toast('DOI validation failed', 'error');
  } finally {
    hideLoading();
  }
};

// ── CONTEXT MENU ─────────────────────────────────────────────────
const ctxMenu = document.getElementById('context-menu');

function showContextMenu(x, y, targetPath) {
  contextTargetPath = targetPath;
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
  ctxMenu.classList.add('show');
}

document.getElementById('ctx-new-file').addEventListener('click', async () => {
  const name = prompt('File name:');
  if (!name) return;
  const base = contextTargetPath || currentProjectPath;
  await window.api.createFile(base + '/' + name);
  await loadFileTree();
});

document.getElementById('ctx-new-folder').addEventListener('click', async () => {
  const name = prompt('Folder name:');
  if (!name) return;
  const base = contextTargetPath || currentProjectPath;
  await window.api.createFolder(base + '/' + name);
  await loadFileTree();
});

document.getElementById('ctx-rename').addEventListener('click', async () => {
  if (!contextTargetPath) return;
  const parts = contextTargetPath.replace(/\\/g, '/').split('/');
  const oldName = parts[parts.length - 1];
  const newName = prompt('New name:', oldName);
  if (!newName || newName === oldName) return;
  parts[parts.length - 1] = newName;
  const newPath = parts.join('/');
  await window.api.renameItem(contextTargetPath, newPath);
  if (currentFilePath === contextTargetPath) {
    closeTab(contextTargetPath);
    await openFile(newPath, newName);
  }
  await loadFileTree();
  toast(`Renamed to: ${newName}`, 'success');
});

document.getElementById('ctx-delete').addEventListener('click', async () => {
  if (!contextTargetPath) return;
  if (!confirm('Delete this item?')) return;
  await window.api.deleteItem(contextTargetPath);
  if (currentFilePath === contextTargetPath) closeTab(contextTargetPath);
  await loadFileTree();
  toast('Deleted', 'info');
});

// ── GENERATE RESEARCH ────────────────────────────────────────────
async function generateResearch() {
  if (!currentProjectPath) return toast('Open a project folder first', 'error');
  if (!hasGeminiKey) return promptApiKey(() => generateResearch());

  const title = document.getElementById('paper-title').value.trim() || 'Research Paper';
  const author = document.getElementById('paper-author').value.trim() || 'Author';
  const template = document.getElementById('paper-template').value;

  document.getElementById('research-progress-wrap').style.display = 'block';
  showLoading('Generating research paper...');

  try {
    const result = await window.api.generateResearch(currentProjectPath, title, author, template);
    if (result.success) {
      lastResearchData = result;
      displayResearchOutput(result.sections, title, author, template);

      await window.api.saveResearchHistory(currentProjectPath, {
        title, author, template,
        date: new Date().toLocaleString(),
        sections: Object.keys(result.sections),
      });

      toast('Research Package generated!', 'success');
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoading();
    document.getElementById('research-progress-wrap').style.display = 'none';
  }
}

document.getElementById('btn-generate-research').addEventListener('click', generateResearch);

function displayResearchOutput(sections, title, author, template) {
  const sectionNames = ['Abstract', 'Introduction', 'System Design', 'Implementation', 'Evaluation', 'References'];
  const templateLabels = {
    generic: 'Generic', ieee: 'IEEE', acm: 'ACM', springer: 'Springer', elsevier: 'Elsevier'
  };

  let html = `
    <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border);">
      <div style="color:var(--accent2);font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Paper Generated Successfully
      </div>
      <div style="font-size:11px;color:var(--text2);">
        <b style="color:var(--text);">${title}</b><br>
        <span>by ${author}</span><br>
        <span style="color:var(--text3);">Template: ${templateLabels[template] || template}</span>
      </div>
    </div>`;

  sectionNames.forEach(name => {
    const content = sections[name] || 'Generated successfully.';
    html += `
      <div class="output-section">
        <div class="output-section-title" onclick="toggleSection(this)">
          ${name}
          <button class="output-edit-btn" onclick="event.stopPropagation();editSection('${name}')">Edit</button>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:4px;flex-shrink:0;"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="output-section-content" id="section-content-${name.replace(/\s/g, '-')}">${content}</div>
      </div>`;
  });

  document.getElementById('research-output').innerHTML = html;
}

window.toggleSection = function(el) {
  const content = el.nextElementSibling;
  content.classList.toggle('expanded');
};

window.editSection = async function(sectionName) {
  if (!hasGeminiKey) return promptApiKey(() => window.editSection(sectionName));
  const instruction = prompt(`How do you want to edit the ${sectionName} section?`);
  if (!instruction) return;

  const contentEl = document.getElementById(`section-content-${sectionName.replace(/\s/g, '-')}`);
  const currentContent = contentEl ? contentEl.textContent : '';

  showLoading(`Editing ${sectionName}...`);
  try {
    const updated = await window.api.aiEditSection(sectionName, currentContent, instruction);
    if (contentEl) {
      contentEl.textContent = updated;
      contentEl.classList.add('expanded');
    }
    toast(`${sectionName} updated!`, 'success');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
};

// ── GENERATE WEB PREVIEW ─────────────────────────────────────────
async function generateWebPreview() {
  if (!currentProjectPath) return toast('Open a project first', 'error');
  if (!hasGeminiKey) return promptApiKey(() => generateWebPreview());
  if (!lastResearchData) return toast('Generate a research paper first', 'error');

  showLoading('AI is building your research website...');
  try {
    const result = await window.api.generateWebPreview(currentProjectPath, lastResearchData);
    if (result.success) {
      toast('Research website generated! Opening preview...', 'success');
      await window.api.openPreviewWindow(result.previewPath);
    }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

document.getElementById('btn-web-preview').addEventListener('click', generateWebPreview);

// ── RESEARCH HISTORY ─────────────────────────────────────────────
document.getElementById('btn-research-history').addEventListener('click', async () => {
  if (!currentProjectPath) return toast('Open a project first', 'error');
  const history = await window.api.getResearchHistory(currentProjectPath);

  if (!history.length) return showInfoModal('Research History', '<p style="color:var(--text2);font-size:12px;">No research papers generated yet.</p>');

  const html = history.map(h => `
    <div style="padding:10px;background:var(--bg4);border-radius:6px;margin-bottom:8px;">
      <div style="font-weight:600;color:var(--text);font-size:12px;">${h.title}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:2px;">by ${h.author}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px;">Template: ${h.template || 'Generic'}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px;">${h.date}</div>
    </div>`).join('');

  showInfoModal('Research History', html);
});

// ── EXPORT ───────────────────────────────────────────────────────
document.getElementById('btn-export-pdf').addEventListener('click', async () => {
  if (!currentProjectPath) return toast('Open a project first', 'error');
  if (!hasGeminiKey) return promptApiKey(() => document.getElementById('btn-export-pdf').click());
  showLoading('Compiling PDF via latexonline.cc...');
  try {
    const result = await window.api.compilePdf(currentProjectPath);
    if (result.success) {
      toast('PDF compiled! Opening preview...', 'success');
      const iframe = document.getElementById('pdf-preview-iframe');
      const wrap = document.getElementById('pdf-preview-wrap');
      iframe.src = 'file://' + result.pdfPath;
      wrap.style.display = 'flex';
    }
  } catch (e) {
    toast('PDF compile failed: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
});

document.getElementById('btn-export-word').addEventListener('click', async () => {
  if (!currentProjectPath) return toast('Open a project first', 'error');
  showLoading('Exporting to Word...');
  try {
    await window.api.exportResearch(currentProjectPath, 'word');
    toast('Exported to Word! Check HardPaper-Output folder', 'success');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
});

document.getElementById('btn-export-md').addEventListener('click', async () => {
  if (!currentProjectPath) return toast('Open a project first', 'error');
  showLoading('Exporting to Markdown...');
  try {
    await window.api.exportResearch(currentProjectPath, 'markdown');
    toast('Exported to Markdown! Check HardPaper-Output folder', 'success');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
});

// ── LIVE PREVIEW ─────────────────────────────────────────────────
async function startPreview() {
  if (!currentProjectPath) return toast('Open a project folder first', 'error');
  showLoading('Starting Live Preview...');
  try {
    const result = await window.api.startPreview(currentProjectPath);
    previewRunning = true;
    document.getElementById('status-preview').style.display = 'flex';
    window.open(result.url);
    toast('Preview at ' + result.url, 'success');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

async function stopPreview() {
  await window.api.stopPreview();
  previewRunning = false;
  document.getElementById('status-preview').style.display = 'none';
  toast('Preview stopped', 'info');
}

window.api.onPreviewReady(url => toast('Preview ready: ' + url, 'success'));

// ── TOGGLE ───────────────────────────────────────────────────────
function toggleExplorer() {
  const s = document.getElementById('sidebar');
  s.style.display = s.style.display === 'none' ? 'flex' : 'none';
}


// ── COMMAND PALETTE ───────────────────────────────────────────────
const commands = [
  { label: 'New Text File', shortcut: 'Ctrl+N', action: newTextFile },
  { label: 'Open File', shortcut: 'Ctrl+O', action: openSingleFile },
  { label: 'Open Folder', action: openFolder },
  { label: 'Upload Project', action: uploadProject },
  { label: 'Save File', shortcut: 'Ctrl+S', action: saveCurrentFile },
  { label: 'Save As', shortcut: 'Ctrl+Shift+S', action: saveFileAs },
  { label: 'Format Document', shortcut: 'Shift+Alt+F', action: formatDocument },
  { label: 'Toggle Explorer', action: toggleExplorer },
  { label: 'Toggle Light/Dark Mode', action: toggleTheme },
  { label: 'Start Live Preview', action: startPreview },
  { label: 'Stop Live Preview', action: stopPreview },
  { label: 'Generate Research Package', action: generateResearch },
  { label: 'Generate Web Preview', action: generateWebPreview },
  { label: 'Show Experiment Tracker', action: showExperimentTracker },
  { label: 'Show Citation Manager', action: showCitationManager },
  { label: 'Zoom In', shortcut: 'Ctrl++', action: () => zoomEditor(1) },
  { label: 'Zoom Out', shortcut: 'Ctrl+-', action: () => zoomEditor(-1) },
  { label: 'Find in File', shortcut: 'Ctrl+F', action: () => editor && editor.trigger('keyboard', 'actions.find', null) },
  { label: 'Find & Replace', shortcut: 'Ctrl+H', action: () => editor && editor.trigger('keyboard', 'editor.action.startFindReplaceAction', null) },
  { label: 'Keyboard Shortcuts', action: showShortcuts },
  { label: 'About HardPaper', action: showAbout },
];

let cpSelectedIndex = 0;

function openCommandPalette() {
  document.getElementById('command-palette').classList.add('show');
  document.getElementById('cp-input').value = '';
  renderCommandList('');
  document.getElementById('cp-input').focus();
}

function closeCommandPalette() {
  document.getElementById('command-palette').classList.remove('show');
}

function renderCommandList(filter) {
  const list = document.getElementById('cp-list');
  const filtered = commands.filter(c => c.label.toLowerCase().includes(filter.toLowerCase()));
  cpSelectedIndex = 0;

  list.innerHTML = filtered.map((c, i) => `
    <div class="cp-item ${i === 0 ? 'selected' : ''}" data-index="${i}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      ${c.label}
      ${c.shortcut ? `<span class="cp-shortcut">${c.shortcut}</span>` : ''}
    </div>`).join('');

  list.querySelectorAll('.cp-item').forEach((el, i) => {
    el.addEventListener('click', () => { filtered[i].action(); closeCommandPalette(); });
    el.addEventListener('mouseover', () => {
      list.querySelectorAll('.cp-item').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      cpSelectedIndex = i;
    });
  });
}

document.getElementById('cp-input').addEventListener('input', e => renderCommandList(e.target.value));

document.getElementById('cp-input').addEventListener('keydown', e => {
  const items = document.querySelectorAll('.cp-item');
  if (e.key === 'ArrowDown') {
    cpSelectedIndex = Math.min(cpSelectedIndex + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    cpSelectedIndex = Math.max(cpSelectedIndex - 1, 0);
  } else if (e.key === 'Enter') {
    const filtered = commands.filter(c => c.label.toLowerCase().includes(e.target.value.toLowerCase()));
    if (filtered[cpSelectedIndex]) { filtered[cpSelectedIndex].action(); closeCommandPalette(); }
    return;
  } else if (e.key === 'Escape') {
    closeCommandPalette(); return;
  }
  items.forEach((el, i) => el.classList.toggle('selected', i === cpSelectedIndex));
});

document.getElementById('command-palette').addEventListener('click', e => {
  if (e.target === document.getElementById('command-palette')) closeCommandPalette();
});

// ── KEYBOARD SHORTCUTS ───────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key === 'P') { e.preventDefault(); openCommandPalette(); }
  if (e.ctrlKey && e.key === 'o') { e.preventDefault(); openSingleFile(); }
  if (e.ctrlKey && e.key === 'n') { e.preventDefault(); newTextFile(); }
  if (e.ctrlKey && e.shiftKey && e.key === 'S') { e.preventDefault(); saveFileAs(); }
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveCurrentFile(); }
  if (e.ctrlKey && e.key === '+') { e.preventDefault(); zoomEditor(1); }
  if (e.ctrlKey && e.key === '-') { e.preventDefault(); zoomEditor(-1); }
  if (e.key === 'Escape') closeCommandPalette();
});

// ── HELP MODALS ──────────────────────────────────────────────────
function showShortcuts() {
  showInfoModal('Keyboard Shortcuts', `
    <table style="width:100%;border-collapse:collapse;">
      ${[
        ['Ctrl+Shift+P', 'Command Palette'],
        ['Ctrl+N', 'New Text File'],
        ['Ctrl+O', 'Open File'],
        ['Ctrl+S', 'Save File'],
        ['Ctrl+Shift+S', 'Save As'],
        ['Ctrl+F', 'Find in File'],
        ['Ctrl+H', 'Find & Replace'],
        ['Ctrl+Z', 'Undo'],
        ['Ctrl+Y', 'Redo'],
        ['Shift+Alt+F', 'Format Document'],
        ['Ctrl++', 'Zoom In'],
        ['Ctrl+-', 'Zoom Out'],
      ].map(([k, v]) => `
        <tr>
          <td style="padding:5px 0;font-family:var(--mono);font-size:11px;color:var(--accent);">${k}</td>
          <td style="padding:5px 8px;font-size:12px;color:var(--text2);">${v}</td>
        </tr>`).join('')}
    </table>
  `);
}

function showAbout() {
  showInfoModal('About HardPaper', `
    <div style="text-align:center;margin-bottom:16px;">
      <div style="font-size:48px;color:var(--accent);margin-bottom:8px;
        filter:drop-shadow(0 0 20px rgba(157,125,255,0.6));
        animation:float 3s ease-in-out infinite;">⬡</div>
      <div style="font-size:16px;font-weight:600;color:var(--text);">HardPaper v2.0</div>
      <div style="font-size:11px;color:var(--text2);margin-top:4px;">Research IDE & Paper Generator</div>
    </div>
    <div style="font-size:12px;color:var(--text2);line-height:2.2;">
      <b style="color:var(--text);">Runtime:</b> Electron<br>
      <b style="color:var(--text);">Editor:</b> Monaco Editor<br>
      <b style="color:var(--text);">AI:</b> Google Gemini<br>
      <b style="color:var(--text);">Research:</b> IEEE, ACM, Springer, Elsevier, Generic templates<br>
      <b style="color:var(--text);">Features:</b> Experiment Tracker, Citation Manager, AST Analysis
    </div>
  `);
}

// ── INFO MODAL ───────────────────────────────────────────────────
function showInfoModal(title, html) {
  const existing = document.getElementById('info-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'info-modal';
  modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.65);
    display:flex;align-items:center;justify-content:center;
    z-index:999999;backdrop-filter:blur(3px);`;

  modal.innerHTML = `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;
      padding:24px 28px;min-width:360px;max-width:560px;max-height:80vh;overflow-y:auto;
      box-shadow:0 12px 40px rgba(0,0,0,0.6),0 0 0 1px var(--glass-border);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <span style="font-size:14px;font-weight:600;color:var(--text);">${title}</span>
        <button onclick="document.getElementById('info-modal').remove()"
          style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:20px;
          line-height:1;border-radius:4px;padding:2px 6px;transition:all 0.1s;"
          onmouseover="this.style.background='var(--bg4)'"
          onmouseout="this.style.background='none'">×</button>
      </div>
      <div style="font-size:12px;color:var(--text2);line-height:1.8;">${html}</div>
    </div>`;

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// ── HELPERS ──────────────────────────────────────────────────────
function showLoading(text) {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').classList.add('show');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('show');
}

function toast(msg, type = 'info') {
  const existing = document.querySelectorAll('.toast');
  existing.forEach((t, i) => { t.style.bottom = (30 + (i + 1) * 48) + 'px'; });

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastIn 0.25s ease reverse';
    setTimeout(() => el.remove(), 250);
  }, 3000);
}