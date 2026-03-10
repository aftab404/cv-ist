const editorMdEl = document.getElementById('editor-md');
const editorHtmlEl = document.getElementById('editor-html');
const editorCssEl = document.getElementById('editor-css');
const previewEl = document.getElementById('preview');
const chatLogEl = document.getElementById('chat-log');
const chatFormEl = document.getElementById('chat-form');
const chatInputEl = document.getElementById('chat-input');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const loadTemplateBtn = document.getElementById('load-template-btn');
const clearBtn = document.getElementById('clear-btn');
const copyMdBtn = document.getElementById('copy-md-btn');
const apiKeyInputEl = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const keyStatusEl = document.getElementById('key-status');
const masterDataInputEl = document.getElementById('master-data-input');
const saveMasterDataBtn = document.getElementById('save-master-data-btn');
const clearMasterDataBtn = document.getElementById('clear-master-data-btn');
const masterDataStatusEl = document.getElementById('master-data-status');
const involvementSelectEl = document.getElementById('involvement-level');
const cvUploadInputEl = document.getElementById('cv-upload-input');
const diffModalEl = document.getElementById('diff-modal');
const diffOutputEl = document.getElementById('diff-output');
const acceptDiffBtn = document.getElementById('accept-diff-btn');
const rejectDiffBtn = document.getElementById('reject-diff-btn');
const layoutEl = document.getElementById('resizable-layout');
const settingsModalEl = document.getElementById('settings-modal');
const openSettingsBtn = document.getElementById('open-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));

const storageKeys = {
  apiKey: 'openai_api_key',
  masterData: 'cv_master_data',
  layoutWidths: 'cv_layout_widths',
  involvement: 'cv_involvement_level',
};

const starterMarkdown = `# Your Name

**Target Role**  
Email | Phone | City | LinkedIn | Portfolio

---

## Professional Summary
2-4 lines that position your profile for the target role.

## Experience
### Job Title - Company  
Month YYYY - Month YYYY
- Achievement with impact metric.
- Ownership and collaboration detail.

## Education
**Degree** - University, Year

## Projects
### Project Name
- Problem solved, stack used, result.

## Skills
- Technical:
- Domain:
- Soft:`;

const state = {
  history: [],
  isLoading: false,
  model: 'gpt-4.1-mini',
  pendingChange: null,
  activeTab: 'markdown',
  involvement: 'medium',
  stepQueue: [],
  stepIndex: 0,
};

const previewHost = document.createElement('div');
previewHost.className = 'preview-host';
previewEl.appendChild(previewHost);

const previewShadow = previewHost.attachShadow({ mode: 'open' });
const previewStyleEl = document.createElement('style');
const previewContentEl = document.createElement('div');
previewContentEl.className = 'preview-body';
previewShadow.appendChild(previewStyleEl);
previewShadow.appendChild(previewContentEl);

let mdEditor;
let htmlEditor;
let cssEditor;

function applyCustomCss() {
  const cssText = cssEditor ? cssEditor.getValue() : '';
  previewStyleEl.textContent = cssText;
}

function renderMarkdown() {
  const mdText = mdEditor ? mdEditor.getValue() : '';
  const htmlText = marked.parse(mdText || '');
  previewContentEl.innerHTML = htmlText;
  if (htmlEditor) {
    htmlEditor.setValue(htmlText);
  }
  applyCustomCss();
}

function resizeEditors() {
  if (mdEditor) mdEditor.setSize(null, '100%');
  if (htmlEditor) htmlEditor.setSize(null, '100%');
  if (cssEditor) cssEditor.setSize(null, '100%');
}

function refreshActiveEditor() {
  if (state.activeTab === 'markdown' && mdEditor) {
    mdEditor.refresh();
  }
  if (state.activeTab === 'html' && htmlEditor) {
    htmlEditor.refresh();
  }
  if (state.activeTab === 'css' && cssEditor) {
    cssEditor.refresh();
  }
  resizeEditors();
}

function setActiveTab(tab) {
  state.activeTab = tab;

  tabButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  editorMdEl.classList.toggle('hidden', tab !== 'markdown');
  editorHtmlEl.classList.toggle('hidden', tab !== 'html');
  editorCssEl.classList.toggle('hidden', tab !== 'css');

  if (tab === 'html' && htmlEditor) {
    htmlEditor.setValue(marked.parse(mdEditor ? mdEditor.getValue() : ''));
  }

  requestAnimationFrame(refreshActiveEditor);
}

function createEditor({ parent, value, mode, readOnly }) {
  return CodeMirror(parent, {
    value,
    mode,
    lineNumbers: true,
    lineWrapping: true,
    readOnly: !!readOnly,
    viewportMargin: Infinity,
  });
}

function pushMessage(role, text, extraClass = '') {
  const div = document.createElement('div');
  div.className = `msg ${role} ${extraClass}`.trim();
  div.textContent = text;
  chatLogEl.appendChild(div);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
  return div;
}

function scrollChatToBottom() {
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

function startThinking() {
  state.isLoading = true;
  return pushMessage('assistant', 'Starting analysis and tailoring stream...', 'thinking');
}

function finishThinking(el) {
  state.isLoading = false;
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
  }
}

function setKeyStatus() {
  const key = localStorage.getItem(storageKeys.apiKey) || '';
  if (key) {
    keyStatusEl.textContent = 'Key saved locally';
    keyStatusEl.classList.add('ok');
  } else {
    keyStatusEl.textContent = 'Not saved';
    keyStatusEl.classList.remove('ok');
  }
}

function setMasterDataStatus() {
  const value = (localStorage.getItem(storageKeys.masterData) || '').trim();
  if (value) {
    masterDataStatusEl.textContent = 'Context saved locally';
    masterDataStatusEl.classList.add('ok');
  } else {
    masterDataStatusEl.textContent = 'No context saved';
    masterDataStatusEl.classList.remove('ok');
  }
}

function setInvolvementLevel(value) {
  state.involvement = value;
  localStorage.setItem(storageKeys.involvement, value);
}

function saveApiKey() {
  const key = apiKeyInputEl.value.trim();
  if (!key) {
    localStorage.removeItem(storageKeys.apiKey);
    setKeyStatus();
    pushMessage('assistant', 'Cleared API key from local storage.');
    return;
  }

  localStorage.setItem(storageKeys.apiKey, key);
  setKeyStatus();
  pushMessage('assistant', 'API key saved locally in your browser for this app.');
}

function saveMasterData() {
  const value = masterDataInputEl.value.trim();
  if (!value) {
    localStorage.removeItem(storageKeys.masterData);
    setMasterDataStatus();
    pushMessage('assistant', 'Master data context cleared.');
    return;
  }

  localStorage.setItem(storageKeys.masterData, value);
  setMasterDataStatus();
  pushMessage('assistant', 'Master data context saved. I will use it as background for CV generation and edits.');
}

function clearMasterData() {
  masterDataInputEl.value = '';
  localStorage.removeItem(storageKeys.masterData);
  setMasterDataStatus();
  pushMessage('assistant', 'Master data context cleared.');
}

function getMasterData() {
  const inlineValue = masterDataInputEl.value.trim();
  if (inlineValue) {
    return inlineValue;
  }
  return (localStorage.getItem(storageKeys.masterData) || '').trim();
}

function addHistory(role, content) {
  state.history.push({ role, content });
  if (state.history.length > 20) {
    state.history = state.history.slice(-20);
  }
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function computeLineDiff(oldText, newText) {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'ctx', line: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', line: a[i] });
      i += 1;
    } else {
      ops.push({ type: 'add', line: b[j] });
      j += 1;
    }
  }

  while (i < n) {
    ops.push({ type: 'del', line: a[i] });
    i += 1;
  }

  while (j < m) {
    ops.push({ type: 'add', line: b[j] });
    j += 1;
  }

  return ops;
}

function renderDiff(oldText, newText) {
  const ops = computeLineDiff(oldText, newText);
  const rows = ['<span class="diff-line ctx">--- current.md</span>', '<span class="diff-line ctx">+++ proposed.md</span>'];

  for (const op of ops) {
    if (op.type === 'add') {
      rows.push(`<span class="diff-line add">+ ${escapeHtml(op.line)}</span>`);
    } else if (op.type === 'del') {
      rows.push(`<span class="diff-line del">- ${escapeHtml(op.line)}</span>`);
    } else {
      rows.push(`<span class="diff-line ctx">  ${escapeHtml(op.line)}</span>`);
    }
  }

  diffOutputEl.innerHTML = rows.join('\n');
}

function openDiffModal() {
  diffModalEl.classList.remove('hidden');
}

function closeDiffModal() {
  diffModalEl.classList.add('hidden');
}

function openSettingsModal() {
  settingsModalEl.classList.remove('hidden');
}

function closeSettingsModal() {
  settingsModalEl.classList.add('hidden');
}

function openPrintWindow() {
  const mdText = mdEditor ? mdEditor.getValue() : '';
  if (!mdText.trim()) {
    pushMessage('assistant', 'Add content first, then print the CV.');
    return;
  }

  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    pushMessage('assistant', 'Popup blocked. Please allow popups to print.');
    return;
  }

  const customCss = cssEditor ? cssEditor.getValue() : '';

  const printStyles = `
    <style>
      body { font-family: "Space Grotesk", sans-serif; color: #1b1e17; padding: 32px; }
      h1, h2, h3 { margin-top: 1.2em; margin-bottom: 0.4em; }
      hr { border: 0; border-top: 1px solid #d5cfbc; }
      ul { padding-left: 20px; }
      .preview { max-width: 800px; margin: 0 auto; }
    </style>
    <style>${customCss}</style>
  `;

  const previewHtml = previewContentEl.innerHTML;
  printWindow.document.write(`<!doctype html><html><head><title>CV Print</title>${printStyles}</head><body><div class="preview">${previewHtml}</div></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function applyChanges(markdown, cssText) {
  if (mdEditor) {
    mdEditor.setValue(markdown);
  }
  if (cssEditor && typeof cssText === 'string') {
    cssEditor.setValue(cssText);
  }
  renderMarkdown();
}

function buildStepQueue(currentMarkdown, nextMarkdown) {
  const currentLines = currentMarkdown.split('\n');
  const nextLines = nextMarkdown.split('\n');
  const steps = [];

  const maxLines = Math.max(currentLines.length, nextLines.length);
  for (let i = 0; i < maxLines; i += 1) {
    const beforeLine = currentLines[i];
    const afterLine = nextLines[i];
    if (beforeLine === afterLine) continue;

    const before = currentLines.slice();
    const after = currentLines.slice();
    if (typeof afterLine === 'undefined') {
      after.splice(i, 1);
    } else if (typeof beforeLine === 'undefined') {
      after.splice(i, 0, afterLine);
    } else {
      after[i] = afterLine;
    }

    steps.push({
      description: `Update line ${i + 1}.`,
      before: before.join('\n'),
      after: after.join('\n'),
    });
  }

  if (!steps.length) {
    steps.push({
      description: 'No line-level changes detected. Applying full update.',
      before: currentMarkdown,
      after: nextMarkdown,
    });
  }

  return steps;
}

function presentStep(step) {
  pushMessage('assistant', `Step ${state.stepIndex + 1}: ${step.description}`);
  state.pendingChange = {
    assistantMessage: step.description,
    currentMarkdown: step.before,
    proposedMarkdown: step.after,
  };
  renderDiff(step.before, step.after);
  openDiffModal();
}

function handleHighInvolvement(currentMarkdown, proposedMarkdown) {
  state.stepQueue = buildStepQueue(currentMarkdown, proposedMarkdown);
  state.stepIndex = 0;
  presentStep(state.stepQueue[state.stepIndex]);
}

function continueHighInvolvement() {
  if (state.stepIndex < state.stepQueue.length - 1) {
    state.stepIndex += 1;
    presentStep(state.stepQueue[state.stepIndex]);
  } else {
    state.stepQueue = [];
    state.stepIndex = 0;
    pushMessage('assistant', 'All steps completed.');
  }
}

function stageChange({ assistantMessage, currentMarkdown, proposedMarkdown, cssText }) {
  if (state.involvement === 'low') {
    applyChanges(proposedMarkdown, cssText);
    pushMessage('assistant', assistantMessage);
    return;
  }

  if (state.involvement === 'high') {
    handleHighInvolvement(currentMarkdown, proposedMarkdown);
    return;
  }

  state.pendingChange = {
    assistantMessage,
    currentMarkdown,
    proposedMarkdown,
  };

  renderDiff(currentMarkdown, proposedMarkdown);
  openDiffModal();
  pushMessage('assistant', 'Proposed CV changes are ready. Review the diff and choose Accept or Reject.');
}

function acceptPendingChange() {
  if (!state.pendingChange) return;

  const pending = state.pendingChange;
  applyChanges(pending.proposedMarkdown, cssEditor ? cssEditor.getValue() : '');
  pushMessage('assistant', 'Accepted. The proposed changes are now applied to your CV.');

  state.pendingChange = null;
  closeDiffModal();

  if (state.involvement === 'high') {
    continueHighInvolvement();
  }
}

function rejectPendingChange() {
  if (!state.pendingChange) return;

  pushMessage('assistant', 'Rejected. Your markdown remains unchanged. Ask for another revision if needed.');
  addHistory('assistant', '[User rejected proposed markdown changes.]');

  state.pendingChange = null;
  closeDiffModal();

  if (state.involvement === 'high') {
    continueHighInvolvement();
  }
}

function parseSseChunk(rawEvent) {
  const lines = rawEvent.split('\n');
  let eventName = 'message';
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  const rawData = dataLines.join('\n');
  if (!rawData) {
    return { eventName, payload: null };
  }

  try {
    return { eventName, payload: JSON.parse(rawData) };
  } catch {
    return { eventName, payload: null };
  }
}

async function callBackendStream(userMessage, onToken) {
  const apiKey = (apiKeyInputEl.value || localStorage.getItem(storageKeys.apiKey) || '').trim();

  if (!apiKey) {
    throw new Error('Add your OpenAI API key first, then send your request.');
  }

  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      message: userMessage,
      markdown: mdEditor ? mdEditor.getValue() : '',
      html: htmlEditor ? htmlEditor.getValue() : '',
      css: cssEditor ? cssEditor.getValue() : '',
      history: state.history,
      masterData: getMasterData(),
      model: state.model,
    }),
  });

  if (!response.ok) {
    let errorMessage = 'Backend request failed.';
    try {
      const err = await response.json();
      errorMessage = err?.error || errorMessage;
    } catch {
      // ignore parse failure
    }
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error('Streaming response body is not available.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let donePayload = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);

      if (rawEvent) {
        const { eventName, payload } = parseSseChunk(rawEvent);

        if (eventName === 'token' && payload?.token) {
          onToken(payload.token);
        } else if (eventName === 'done' && payload) {
          donePayload = payload;
        } else if (eventName === 'error') {
          throw new Error(payload?.error || 'Streaming error from server.');
        }
      }

      boundary = buffer.indexOf('\n\n');
    }
  }

  if (!donePayload) {
    throw new Error('Stream ended before completion payload was received.');
  }

  if (typeof donePayload.assistantMessage !== 'string' || typeof donePayload.markdown !== 'string') {
    throw new Error('Stream returned invalid final payload.');
  }

  return donePayload;
}

async function loadMarkdownFromFile(file) {
  if (!file) return;
  const name = file.name || '';
  if (!name.toLowerCase().endsWith('.md') && !file.type.includes('markdown')) {
    pushMessage('assistant', 'Please upload a markdown (.md) file.');
    cvUploadInputEl.value = '';
    return;
  }

  try {
    const text = await file.text();
    if (mdEditor) {
      mdEditor.setValue(text);
    }
    renderMarkdown();
    state.history = [];
    state.pendingChange = null;
    closeDiffModal();
    pushMessage('assistant', `Loaded ${name} into the editor. You can now ask for edits.`);
  } catch {
    pushMessage('assistant', 'Failed to read the uploaded file. Please try again.');
  } finally {
    cvUploadInputEl.value = '';
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function applyColumnWidths(leftPercent, middlePercent, rightPercent) {
  const left = `${leftPercent}%`;
  const middle = `${middlePercent}%`;
  const right = `${rightPercent}%`;
  layoutEl.style.gridTemplateColumns = `minmax(220px, ${left}) 10px minmax(220px, ${middle}) 10px minmax(200px, ${right})`;
}

function saveLayoutWidths(widths) {
  localStorage.setItem(storageKeys.layoutWidths, JSON.stringify(widths));
}

function loadLayoutWidths() {
  try {
    const raw = localStorage.getItem(storageKeys.layoutWidths);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed) || parsed.length !== 3) return null;
    return parsed.map((v) => Number(v));
  } catch {
    return null;
  }
}

function setupResizableLayout() {
  const handles = Array.from(layoutEl.querySelectorAll('.resize-handle'));
  if (!handles.length) return;

  let isDragging = false;
  let activeHandle = null;
  let startX = 0;
  let startWidths = [34, 38, 28];

  const stored = loadLayoutWidths();
  if (stored) {
    applyColumnWidths(stored[0], stored[1], stored[2]);
    startWidths = stored;
  } else {
    applyColumnWidths(startWidths[0], startWidths[1], startWidths[2]);
  }

  function onPointerMove(event) {
    if (!isDragging || !activeHandle) return;

    const rect = layoutEl.getBoundingClientRect();
    const delta = ((event.clientX - startX) / rect.width) * 100;
    let [left, middle, right] = startWidths;

    if (activeHandle === 'left') {
      left = clamp(left + delta, 20, 60);
      middle = clamp(middle - delta, 20, 60);
    }

    if (activeHandle === 'right') {
      middle = clamp(middle + delta, 20, 60);
      right = clamp(right - delta, 20, 60);
    }

    const total = left + middle + right;
    left = (left / total) * 100;
    middle = (middle / total) * 100;
    right = (right / total) * 100;

    applyColumnWidths(left, middle, right);
    saveLayoutWidths([left, middle, right]);
    resizeEditors();
  }

  function stopDragging() {
    if (!isDragging) return;
    isDragging = false;
    activeHandle = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDragging);
    resizeEditors();
  }

  handles.forEach((handle) => {
    handle.addEventListener('pointerdown', (event) => {
      isDragging = true;
      activeHandle = handle.dataset.handle;
      startX = event.clientX;
      startWidths = loadLayoutWidths() || startWidths;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', stopDragging);
    });
  });
}

function setupEditors() {
  mdEditor = createEditor({
    parent: editorMdEl,
    value: starterMarkdown,
    mode: 'markdown',
  });

  htmlEditor = createEditor({
    parent: editorHtmlEl,
    value: '',
    mode: 'htmlmixed',
    readOnly: true,
  });

  cssEditor = createEditor({
    parent: editorCssEl,
    value: '',
    mode: 'css',
  });

  mdEditor.on('change', () => {
    renderMarkdown();
  });

  cssEditor.on('change', () => {
    applyCustomCss();
  });

  renderMarkdown();
  resizeEditors();
}

chatFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.isLoading) return;

  if (state.pendingChange) {
    pushMessage('assistant', 'Please Accept or Reject the current diff before requesting another change.');
    return;
  }

  const userText = chatInputEl.value.trim();
  if (!userText) return;

  const currentMarkdown = mdEditor ? mdEditor.getValue() : '';

  pushMessage('user', userText);
  addHistory('user', userText);
  chatInputEl.value = '';

  const thinkingEl = startThinking();
  const liveAssistantEl = pushMessage('assistant', '', 'live');

  try {
    const result = await callBackendStream(userText, (token) => {
      liveAssistantEl.textContent += token;
      scrollChatToBottom();
    });

    const finalAssistantMessage = result.assistantMessage.trim() || liveAssistantEl.textContent.trim() || 'Update ready.';
    liveAssistantEl.textContent = finalAssistantMessage;
    addHistory('assistant', finalAssistantMessage);

    if (result.markdown !== currentMarkdown) {
      stageChange({
        assistantMessage: finalAssistantMessage,
        currentMarkdown,
        proposedMarkdown: result.markdown,
        cssText: result.css,
      });
    }

    if (typeof result.css === 'string' && cssEditor && result.css !== cssEditor.getValue()) {
      cssEditor.setValue(result.css);
      applyCustomCss();
    }
  } catch (error) {
    if (!liveAssistantEl.textContent.trim()) {
      liveAssistantEl.textContent = `Error: ${error.message}`;
    } else {
      pushMessage('assistant', `Error: ${error.message}`);
    }
  } finally {
    finishThinking(thinkingEl);
  }
});

saveKeyBtn.addEventListener('click', saveApiKey);
saveMasterDataBtn.addEventListener('click', saveMasterData);
clearMasterDataBtn.addEventListener('click', clearMasterData);

involvementSelectEl.addEventListener('change', (e) => {
  setInvolvementLevel(e.target.value);
});

apiKeyInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveApiKey();
  }
});

cvUploadInputEl.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  loadMarkdownFromFile(file);
});

acceptDiffBtn.addEventListener('click', acceptPendingChange);
rejectDiffBtn.addEventListener('click', rejectPendingChange);

diffModalEl.addEventListener('click', (e) => {
  if (e.target === diffModalEl) {
    rejectPendingChange();
  }
});

openSettingsBtn.addEventListener('click', () => {
  openSettingsModal();
});

closeSettingsBtn.addEventListener('click', () => {
  closeSettingsModal();
});

settingsModalEl.addEventListener('click', (e) => {
  if (e.target === settingsModalEl) {
    closeSettingsModal();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeSettingsModal();
  }
});

window.addEventListener('resize', () => {
  resizeEditors();
});

loadTemplateBtn.addEventListener('click', () => {
  if (mdEditor) {
    mdEditor.setValue(starterMarkdown);
  }
  renderMarkdown();
  pushMessage('assistant', 'Loaded a markdown CV template. Ask me to tailor it to a job posting.');
});

clearBtn.addEventListener('click', () => {
  if (mdEditor) {
    mdEditor.setValue('');
  }
  if (cssEditor) {
    cssEditor.setValue('');
  }
  if (htmlEditor) {
    htmlEditor.setValue('');
  }
  applyCustomCss();
  renderMarkdown();
  state.history = [];
  state.pendingChange = null;
  closeDiffModal();
  pushMessage('assistant', 'Cleared editor and chat memory for a fresh start.');
});

copyMdBtn.addEventListener('click', async () => {
  try {
    const mdText = mdEditor ? mdEditor.getValue() : '';
    await navigator.clipboard.writeText(mdText);
    pushMessage('assistant', 'Markdown copied to clipboard.');
  } catch {
    pushMessage('assistant', 'Clipboard copy failed. You can still copy directly from the editor.');
  }
});

exportPdfBtn.addEventListener('click', () => {
  openPrintWindow();
  pushMessage('assistant', 'Use the print dialog to Save as PDF for selectable text.');
});

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveTab(button.dataset.tab);
  });
});

(function init() {
  const savedKey = localStorage.getItem(storageKeys.apiKey) || '';
  if (savedKey) {
    apiKeyInputEl.value = savedKey;
  }

  const savedMasterData = localStorage.getItem(storageKeys.masterData) || '';
  if (savedMasterData) {
    masterDataInputEl.value = savedMasterData;
  }

  const savedInvolvement = localStorage.getItem(storageKeys.involvement) || 'medium';
  involvementSelectEl.value = savedInvolvement;
  state.involvement = savedInvolvement;

  setupEditors();
  setKeyStatus();
  setMasterDataStatus();
  setupResizableLayout();
  setActiveTab('markdown');

  pushMessage(
    'assistant',
    'Paste your OpenAI API key and optional master data context, then ask me to tailor your CV. I will stream rationale live and propose diffed markdown changes.'
  );
})();
