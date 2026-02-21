// popup.js - Full-featured Page Summariser

// Provider configurations
const PROVIDER_CONFIG = {
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-001'],
    endpoint: ''
  },
  minimax: {
    name: 'MiniMax', 
    baseUrl: 'https://api.minimaxi.com/v1',
    model: 'MiniMax-M2.5',
    models: ['MiniMax-M2.5'],
    endpoint: '/chat/completions'
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
    endpoint: '/chat/completions'
  }
};

// State
let currentProvider = 'gemini';
let configProvider = 'gemini';
let currentSummary = '';
let currentTranslation = '';

// DOM elements
const providerSelect = document.getElementById('provider');
const configProviderSelect = document.getElementById('configProvider');
const modelSelect = document.getElementById('model');
const promptInput = document.getElementById('prompt');
const apiKeyInput = document.getElementById('apiKey');
const baseUrlInput = document.getElementById('baseUrl');
const modelListInput = document.getElementById('modelList');
const summarizeBtn = document.getElementById('summarizeBtn');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const resultDiv = document.getElementById('result');
const saveStatus = document.getElementById('apiValidation');
const keyMask = document.getElementById('keyMask');
const themeSelect = document.getElementById('theme');
const translationToggle = document.getElementById('translationToggle');

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
  });
});

// Initialize
async function init() {
  const saved = await chrome.storage.local.get([
    'provider', 'theme', 'translationEnabled', 'currentSummary', 'currentTranslation'
  ]);
  
  // Theme
  if (saved.theme === 'dark') {
    document.body.classList.add('dark');
    themeSelect.value = 'dark';
  }
  
  // Translation toggle
  if (saved.translationEnabled) {
    translationToggle.classList.add('active');
  }
  
  // Current summary
  if (saved.currentSummary) {
    currentSummary = saved.currentSummary;
    currentTranslation = saved.currentTranslation || '';
    displaySummary(currentSummary, currentTranslation);
  }
  
  // Provider
  currentProvider = saved.provider || 'gemini';
  providerSelect.value = currentProvider;
  await loadProviderSettings(currentProvider);
  
  // Config provider
  configProviderSelect.value = configProvider;
  await loadConfigProviderSettings(configProvider);
}

async function loadProviderSettings(provider) {
  const key = `provider_${provider}`;
  const saved = await chrome.storage.local.get([key]);
  const config = PROVIDER_CONFIG[provider];
  const stored = saved[key] || {};
  
  // Merge with defaults
  const models = stored.models || config.models;
  const baseUrl = stored.baseUrl || config.baseUrl;
  const model = stored.model || config.model;
  const apiKey = stored.apiKey || '';
  const prompt = stored.prompt || 'Summarise this article in its original language. Output format: A brief summary paragraph, followed by a few key bullet points (3 - 5 items)';
  
  // Update UI
  providerSelect.value = provider;
  updateModelDropdown(models, model);
  promptInput.value = prompt;
  
  // Save merged
  await chrome.storage.local.set({ [key]: { baseUrl, model, models, apiKey, prompt } });
}

async function loadConfigProviderSettings(provider) {
  const key = `provider_${provider}`;
  const saved = await chrome.storage.local.get([key]);
  const config = PROVIDER_CONFIG[provider];
  const stored = saved[key] || {};
  
  const baseUrl = stored.baseUrl || config.baseUrl;
  const models = stored.models || config.models;
  const apiKey = stored.apiKey || '';
  
  configProviderSelect.value = provider;
  baseUrlInput.value = baseUrl;
  modelListInput.value = models.map(m => typeof m === 'string' ? m : m.id).join(', ');
  apiKeyInput.value = apiKey;
  updateKeyMask(apiKey);
}

function updateModelDropdown(models, selectedModel) {
  modelSelect.innerHTML = '';
  models.forEach(m => {
    const id = typeof m === 'string' ? m : m.id;
    const name = typeof m === 'string' ? m : m.name || m.id;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = name;
    if (id === selectedModel) opt.selected = true;
    modelSelect.appendChild(opt);
  });
}

function updateKeyMask(key) {
  if (key && key.length > 8) {
    keyMask.textContent = `(${key.substring(0, 4)}...${key.substring(key.length - 4)})`;
  } else if (key) {
    keyMask.textContent = `(${key.substring(0, 2)}...)`;
  } else {
    keyMask.textContent = '';
  }
}

// Provider change in summarize tab
providerSelect.addEventListener('change', async (e) => {
  currentProvider = e.target.value;
  await chrome.storage.local.set({ provider: currentProvider });
  await loadProviderSettings(currentProvider);
});

// Model change - save immediately  
modelSelect.addEventListener('change', async () => {
  const key = `provider_${currentProvider}`;
  const saved = await chrome.storage.local.get([key]);
  const current = saved[key] || {};
  await chrome.storage.local.set({ [key]: { ...current, model: modelSelect.value } });
});

// Config provider change in settings
configProviderSelect.addEventListener('change', async (e) => {
  configProvider = e.target.value;
  await loadConfigProviderSettings(configProvider);
});

// Prompt change - save immediately
promptInput.addEventListener('change', async () => {
  const key = `provider_${currentProvider}`;
  const saved = await chrome.storage.local.get([key]);
  const current = saved[key] || {};
  await chrome.storage.local.set({ [key]: { ...current, prompt: promptInput.value } });
});

// Save & Validate
saveBtn.addEventListener('click', async () => {
  const provider = configProvider;
  const apiKey = apiKeyInput.value.trim();
  const baseUrl = baseUrlInput.value.trim();
  const modelList = modelListInput.value.split(',').map(s => s.trim()).filter(s => s);
  const config = PROVIDER_CONFIG[provider];
  
  if (!apiKey) {
    saveStatus.textContent = 'API key required';
    saveStatus.className = 'validation-msg error';
    return;
  }
  
  saveStatus.textContent = 'Validating...';
  saveStatus.className = 'validation-msg';
  
  try {
    // Validate API key
    const isValid = await validateApiKey(provider, apiKey, baseUrl, modelList[0] || config.model);
    
    if (isValid) {
      const key = `provider_${provider}`;
      const saved = await chrome.storage.local.get([key]);
      const current = saved[key] || {};
      
      await chrome.storage.local.set({
        [key]: {
          ...current,
          apiKey,
          baseUrl: baseUrl || config.baseUrl,
          models: modelList.length > 0 ? modelList : config.models,
          model: modelList[0] || config.model
        }
      });
      
      updateKeyMask(apiKey);
      saveStatus.textContent = '✓ Valid & Saved';
      saveStatus.className = 'validation-msg success';
      
      // Reload if same provider
      if (provider === currentProvider) {
        await loadProviderSettings(provider);
      }
    } else {
      saveStatus.textContent = '✗ Invalid API key';
      saveStatus.className = 'validation-msg error';
    }
  } catch (e) {
    saveStatus.textContent = '✗ Error: ' + e.message;
    saveStatus.className = 'validation-msg error';
  }
});

async function validateApiKey(provider, apiKey, baseUrl, model) {
  const config = PROVIDER_CONFIG[provider];
  const url = provider === 'gemini' 
    ? `${baseUrl || config.baseUrl}/${model}:generateContent`
    : `${baseUrl || config.baseUrl}${config.endpoint}`;
  
  const headers = provider === 'gemini'
    ? { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }
    : { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  
  const body = provider === 'gemini'
    ? { contents: [{ parts: [{ text: 'hi' }] }] }
    : { model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 };
  
  try {
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    return resp.ok;
  } catch (e) {
    return false;
  }
}

// Reset to defaults
resetBtn.addEventListener('click', async () => {
  if (!confirm('Reset this provider to defaults?')) return;
  
  const config = PROVIDER_CONFIG[configProvider];
  const key = `provider_${configProvider}`;
  
  await chrome.storage.local.set({
    [key]: {
      baseUrl: config.baseUrl,
      model: config.model,
      models: config.models,
      apiKey: '',
      prompt: 'Summarise this article in its original language. Output format: A brief summary paragraph, followed by a few key bullet points (3 - 5 items)'
    }
  });
  
  await loadConfigProviderSettings(configProvider);
  saveStatus.textContent = '✓ Reset to defaults';
  saveStatus.className = 'validation-msg success';
});

// Theme
themeSelect.addEventListener('change', async () => {
  document.body.classList.toggle('dark', themeSelect.value === 'dark');
  await chrome.storage.local.set({ theme: themeSelect.value });
});

// Translation toggle
translationToggle.addEventListener('click', async () => {
  translationToggle.classList.toggle('active');
  await chrome.storage.local.set({ translationEnabled: translationToggle.classList.contains('active') });
});

// Summarize
summarizeBtn.addEventListener('click', async () => {
  const provider = currentProvider;
  const model = modelSelect.value;
  const prompt = promptInput.value;
  
  const key = `provider_${provider}`;
  const saved = await chrome.storage.local.get([key, 'translationEnabled']);
  const config = PROVIDER_CONFIG[provider];
  const pconfig = saved[key] || {};
  
  const apiKey = pconfig.apiKey;
  const baseUrl = pconfig.baseUrl || config.baseUrl;
  const translate = saved.translationEnabled;
  
  if (!apiKey) {
    resultDiv.innerHTML = '<span class="error">Set API key in Settings first</span>';
    return;
  }
  
  summarizeBtn.disabled = true;
  summarizeBtn.textContent = 'Summarising...';
  resultDiv.innerHTML = '<span class="loading">Extracting page content...</span>';
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    
    const data = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (document.body.innerText || '').replace(/\s+/g, ' ').trim().substring(0, 5000)
    });
    
    const pageText = data[0]?.result;
    if (!pageText || pageText.length < 50) throw new Error('No content');
    
    resultDiv.innerHTML = '<span class="loading">Analysing content...</span>';
    
    // Call API
    const summarizerSystem = 'You are a professional summariser. Output ONLY the final result. Do NOT show any thinking, reasoning, or explanation. Do NOT include any meta-commentary. Just give the answer directly.';
    
    let url, headers, body;
    if (provider === 'gemini') {
      url = `${baseUrl}/${model}:generateContent`;
      headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
      body = { 
        contents: [{ parts: [{ text: prompt + '\n\n' + pageText }] }], 
        generationConfig: { maxOutputTokens: 800, temperature: 0.1 },
        systemInstruction: { parts: [{ text: summarizerSystem }] }
      };
    } else {
      url = `${baseUrl}${config.endpoint}`;
      headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
      body = { 
        model, 
        messages: [
          { role: 'system', content: summarizerSystem },
          { role: 'user', content: prompt + '\n\n' + pageText }
        ], 
        max_tokens: 600,
        temperature: 0.1
      };
    }
    
    resultDiv.innerHTML = '<span class="loading">Generating summary...</span>';
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!resp.ok) throw new Error('API error: ' + resp.status);
    
    const json = await resp.json();
    console.log('Raw API response:', json);
    let summary = provider === 'gemini' 
      ? json.candidates?.[0]?.content?.parts?.[0]?.text 
      : json.choices?.[0]?.message?.content;
    
    if (!summary) throw new Error('No summary');
    
    // Strip <think>...</think> blocks from reasoning models
    summary = summary.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    currentSummary = summary;
    
    // Show summary immediately
    displaySummary(summary, '');
    await chrome.storage.local.set({ currentSummary: summary, currentTranslation: '' });
    
    // Then translate if enabled and not already Chinese
    console.log('Translation enabled:', translate, '| Has Chinese:', /[\u4e00-\u9fa5]/.test(summary.substring(0, 200)));
    if (translate && !/[\u4e00-\u9fa5]/.test(summary.substring(0, 200))) {
      // Show loading state in translation column
      displaySummaryWithTranslationLoading(summary);
      
      try {
        const translation = await translateText(summary, provider, model, apiKey, baseUrl);
        console.log('Translation result:', translation);
        currentTranslation = translation;
        displaySummary(summary, translation);
        await chrome.storage.local.set({ currentSummary: summary, currentTranslation: translation });
      } catch (e) {
        console.error('Translation failed:', e);
        // Show error in translation column instead of silently hiding
        resultDiv.innerHTML = `
          <div class="result-cols">
            <div class="result-col">
              <h4>${ICON_FILE_TEXT} Summary</h4>
              <div>${formatText(summary)}</div>
            </div>
            <div class="result-col cn">
              <h4>${ICON_LANGUAGES} 中文</h4>
              <div><span class="error">Translation failed: ${e.message}</span></div>
            </div>
          </div>
        `;
      }
    }
    
  } catch (e) {
    resultDiv.innerHTML = '<span class="error">' + e.message + '</span>';
  } finally {
    summarizeBtn.disabled = false;
    summarizeBtn.textContent = 'Summarise Page';
  }
});

// Lucide SVG icons (inline to avoid CDN dependency)
const ICON_FILE_TEXT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 17H8"/><path d="M16 13h-2"/></svg>';
const ICON_LANGUAGES = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>';

function displaySummary(summary, translation) {
  const isTranslation = translation && translation.length > 0;
  
  if (isTranslation) {
    resultDiv.innerHTML = `
      <div class="result-cols">
        <div class="result-col">
          <h4>${ICON_FILE_TEXT} Summary</h4>
          <div>${formatText(summary)}</div>
        </div>
        <div class="result-col cn">
          <h4>${ICON_LANGUAGES} 中文</h4>
          <div>${formatText(translation)}</div>
        </div>
      </div>
    `;
  } else {
    resultDiv.innerHTML = `<div class="result-col"><h4>${ICON_FILE_TEXT} Summary</h4><div>${formatText(summary)}</div></div>`;
  }
}

function displaySummaryWithTranslationLoading(summary) {
  resultDiv.innerHTML = `
    <div class="result-cols">
      <div class="result-col">
        <h4>${ICON_FILE_TEXT} Summary</h4>
        <div>${formatText(summary)}</div>
      </div>
      <div class="result-col cn">
        <h4>${ICON_LANGUAGES} 中文</h4>
        <div><span class="loading">Translating...</span></div>
      </div>
    </div>
  `;
}

function formatText(text) {
  if (!text) return '';
  // Escape HTML to prevent XSS from AI output
  const escaped = text.trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return escaped.replace(/\n/g, '<br>');
}



async function translateText(text, provider, model, apiKey, baseUrl) {
  const config = PROVIDER_CONFIG[provider];
  const translateSystem = 'You are a pure translator. Translate the following text to Chinese. Output ONLY the translated text. Do NOT re-analyse, re-summarise, or add any extra content. Do NOT reference any original article or source material. Just translate the exact text given to you word by word, preserving the original format and structure.';
  
  let url, headers, body;
  if (provider === 'gemini') {
    url = `${baseUrl}/${model}:generateContent`;
    headers = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
    body = {
      contents: [{ parts: [{ text: 'Translate the following text to Chinese. Do NOT add anything extra, just translate:\n\n' + text }] }],
      generationConfig: { maxOutputTokens: 1000, temperature: 0.1 },
      systemInstruction: { parts: [{ text: translateSystem }] }
    };
  } else {
    url = `${baseUrl}${config.endpoint}`;
    headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    body = {
      model,
      messages: [
        { role: 'system', content: translateSystem },
        { role: 'user', content: 'Translate the following text to Chinese. Do NOT add anything extra, just translate:\n\n' + text }
      ],
      max_tokens: 1000,
      temperature: 0.1
    };
  }
  
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error('Translation API error: ' + resp.status);
  
  const json = await resp.json();
  let result = provider === 'gemini' 
    ? json.candidates?.[0]?.content?.parts?.[0]?.text 
    : json.choices?.[0]?.message?.content;
  
  // Strip <think> tags from translation response too
  if (result) result = result.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return result || '';
}



// Start
init();
