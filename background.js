// background.js - MV3 Service Worker
// Handles summarisation and translation API calls in the background
// so they persist even when the popup is closed.

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

// Strip <think>...</think> blocks from reasoning models
function stripThinkTags(text) {
  if (!text) return '';
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// Build API request for a given provider
function buildRequest(provider, apiKey, baseUrl, model, systemPrompt, userContent, maxTokens) {
  const config = PROVIDER_CONFIG[provider];

  if (provider === 'gemini') {
    return {
      url: `${baseUrl}/${model}:generateContent`,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userContent }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 },
          systemInstruction: { parts: [{ text: systemPrompt }] }
        })
      }
    };
  } else {
    return {
      url: `${baseUrl}${config.endpoint}`,
      options: {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          max_tokens: maxTokens,
          temperature: 0.1
        })
      }
    };
  }
}

// Extract response text from API response
function extractResponse(provider, json) {
  if (provider === 'gemini') {
    return json.candidates?.[0]?.content?.parts?.[0]?.text;
  }
  return json.choices?.[0]?.message?.content;
}

// Fetch with timeout (30 seconds)
async function fetchWithTimeout(url, options, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Main summarise handler
async function handleSummarise({ provider, model, apiKey, baseUrl, prompt, translate, tabId }) {
  try {
    // Step 1: Extract page content
    await chrome.storage.local.set({ summaryStatus: 'extracting' });

    const data = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (document.body.innerText || '').replace(/\s+/g, ' ').trim().substring(0, 5000)
    });

    const pageText = data[0]?.result;
    if (!pageText || pageText.length < 50) throw new Error('No content found on page');

    // Step 2: Summarise
    await chrome.storage.local.set({ summaryStatus: 'summarising' });

    const summarySystem = 'You are a professional summariser. Output ONLY the final result. Do NOT show any thinking, reasoning, or explanation. Do NOT include any meta-commentary. Just give the answer directly.';

    const summaryReq = buildRequest(provider, apiKey, baseUrl, model, summarySystem, prompt + '\n\n' + pageText, 800);
    const summaryResp = await fetchWithTimeout(summaryReq.url, summaryReq.options);
    if (!summaryResp.ok) throw new Error('API error: ' + summaryResp.status);

    const summaryJson = await summaryResp.json();
    let summary = extractResponse(provider, summaryJson);
    if (!summary) throw new Error('No summary returned');

    summary = stripThinkTags(summary);

    // Step 3: Check if translation needed
    const needsTranslation = translate && !/[\u4e00-\u9fa5]/.test(summary.substring(0, 200));

    // Save summary — only set 'translating' if actually going to translate
    await chrome.storage.local.set({
      currentSummary: summary,
      currentTranslation: '',
      summaryStatus: needsTranslation ? 'translating' : 'done'
    });

    // Step 4: Translate if needed
    if (needsTranslation) {
      const translateSystem = 'You are a pure translator. Translate the following text to Chinese. Output ONLY the translated text. Do NOT re-analyse, re-summarise, or add any extra content. Do NOT reference any original article or source material. Just translate the exact text given to you word by word, preserving the original format and structure.';
      const translateContent = 'Translate the following text to Chinese. Do NOT add anything extra, just translate:\n\n' + summary;

      try {
        const transReq = buildRequest(provider, apiKey, baseUrl, model, translateSystem, translateContent, 1000);
        const transResp = await fetchWithTimeout(transReq.url, transReq.options);

        if (transResp.ok) {
          const transJson = await transResp.json();
          let translation = extractResponse(provider, transJson);
          translation = stripThinkTags(translation);

          await chrome.storage.local.set({
            currentTranslation: translation || '',
            summaryStatus: 'done'
          });
        } else {
          await chrome.storage.local.set({
            currentTranslation: '',
            summaryStatus: 'done',
            summaryError: 'Translation failed: API error ' + transResp.status
          });
        }
      } catch (transErr) {
        // Translation timed out or failed — still mark as done with summary
        await chrome.storage.local.set({
          currentTranslation: '',
          summaryStatus: 'done',
          summaryError: 'Translation failed: ' + transErr.message
        });
      }
    }

    // Notify user
    chrome.notifications.create('summary-ready', {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Page Summariser',
      message: 'Summary is ready! Click the extension icon to view.'
    });

  } catch (e) {
    console.error('Summarise error:', e);
    await chrome.storage.local.set({
      summaryStatus: 'error',
      summaryError: e.message
    });

    chrome.notifications.create('summary-error', {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Page Summariser',
      message: 'Summarisation failed: ' + e.message
    });
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'summarise') {
    handleSummarise(msg).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // keep channel open for async response
  }
});
