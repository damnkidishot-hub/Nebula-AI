const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Models live in a top-level "models" folder next to the app.
function modelsDir() {
  // In dev: project/models . In packaged app: resources/models or userData/models.
  const candidates = [
    path.join(__dirname, '..', 'models'),
    path.join(process.resourcesPath || '', 'models'),
    path.join(app.getPath('userData'), 'models')
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  const fallback = path.join(__dirname, '..', 'models');
  if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

// Reads every .json in models/. Each json describes one model.
// json file name = the model display name.
function listModels() {
  const dir = modelsDir();
  const out = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.toLowerCase().endsWith('.json')) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const name = path.basename(file, '.json');
      const type = (raw['Model type'] || raw.type || 'local').toLowerCase();
      const modelId = raw.Model || raw.model || '';
      out.push({
        name,
        type,
        api: raw.api && raw.api !== 'none' ? raw.api : null,
        model: modelId,
        ggufPath: type === 'local' ? path.join(dir, modelId) : null,
        // Whether the model is likely to support NATIVE function-calling.
        // Free / small models usually don't; major frontier providers do.
        // When false, the agent uses the reliable JSON-in-text protocol instead.
        toolsLikely: type === 'openrouter' ? supportsNativeTools(modelId) : false
      });
    } catch (e) {
      // skip malformed json
    }
  }
  return out;
}

// Heuristic: only well-known commercial/OpenAI-compatible models reliably
// support native function-calling on OpenRouter. Free, auto-router, and
// experimental models are treated as NOT supporting it (they get the text
// protocol, which works universally).
function supportsNativeTools(modelId) {
  const id = (modelId || '').toLowerCase();
  if (!id) return false;
  // Free / auto-routed / experimental models -> assume NO native tools.
  if (id.includes(':free')) return false;
  if (id.startsWith('openrouter/')) return false; // auto-router
  // Known tool-capable provider prefixes on OpenRouter.
  const capable = [
    'openai/',        // gpt-4o, gpt-4.1, etc.
    'anthropic/',     // claude 3.5/3.7
    'google/',        // gemini
    'meta-llama/llama-3.3', 'meta-llama/llama-4',
    'mistralai/',     // mistral large
    'x-ai/',          // grok
    'qwen/qwen-2.5-', 'qwen/qwen3-', 'qwen/qwq'
  ];
  return capable.some(p => id.startsWith(p));
}

function getModel(name) {
  return listModels().find(m => m.name === name) || null;
}

module.exports = { listModels, getModel, modelsDir };
