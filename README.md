# Page Summarizer - Chrome Extension

AI-powered web page summarizer with bilingual support.

## Features

- 📄 **Summary Tab**: Select provider, model, custom prompt, get summary
- ⚙️ **Settings Tab**: Configure endpoints, API keys, models, theme, translation
- 🌐 **Multi-Provider**: Google Gemini, MiniMax, OpenAI, Custom
- 🎨 **Themes**: System, Dark, Light
- 🌏 **Bilingual**: Auto-translate to Chinese
- 💾 **Persistent**: Settings saved per provider

## Installation

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `chrome-extension` folder

## Usage

### Summary Tab
1. Select AI Provider
2. Choose Model
3. Enter Custom Prompt (optional)
4. Click **Summarize Page**

### Settings Tab
- **Provider**: Switch between Gemini/MiniMax/OpenAI/Custom
- **Base URL**: Pre-populated, editable
- **Models**: Add/remove model IDs
- **API Key**: Enter & save (validates on save)
- **Theme**: System/Dark/Light
- **Translation**: Toggle Chinese translation

## Configuration

### Default Providers

| Provider | Base URL | Default Model |
|----------|----------|---------------|
| Gemini | `.../v1beta/models` | gemini-2.5-flash |
| MiniMax | `https://api.minimaxi.com/v1` | MiniMax-M2.5 |
| OpenAI | `.../v1` | gpt-4o-mini |

## File Structure

```
chrome-extension/
├── config.js       # Provider configurations
├── popup.html      # UI with tabs
├── popup.js        # Main logic
├── background.js  # API calls
└── README.md
```

## Version

v1.1 - Tab-based UI with settings
