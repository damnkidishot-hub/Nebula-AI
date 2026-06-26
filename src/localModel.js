// Streams from a local .gguf model using node-llama-cpp.
// node-llama-cpp is an OPTIONAL dependency. It is only loaded when a local
// model is actually used, so the app installs and runs (OpenRouter) without it.
// To enable local models, run:  npm run local-models
let cache = new Map(); // ggufPath -> { model, LlamaChatSession }

async function loadLib() {
  try {
    return await import('node-llama-cpp');
  } catch (e) {
    throw new Error('Local models require node-llama-cpp. Install it with:  npm run local-models');
  }
}

async function load(ggufPath) {
  if (cache.has(ggufPath)) return cache.get(ggufPath);
  const { getLlama, LlamaChatSession } = await loadLib();
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath: ggufPath });
  const entry = { model, LlamaChatSession };
  cache.set(ggufPath, entry);
  return entry;
}

async function stream({ model, systemPrompt, messages, onToken }) {
  if (!model.ggufPath) throw new Error('Missing gguf path for local model');
  const fs = require('fs');
  if (!fs.existsSync(model.ggufPath)) throw new Error('GGUF file not found: ' + model.ggufPath);

  const { model: llamaModel, LlamaChatSession } = await load(model.ggufPath);
  const context = await llamaModel.createContext();
  const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt });

  // memory: replay recent user turns so the model has context (kept small).
  const history = messages.slice(0, -1).slice(-8);
  for (const m of history) {
    if (m.role === 'user') { await session.prompt(m.content, { maxTokens: 1 }).catch(() => {}); }
  }

  const last = messages[messages.length - 1];
  let full = '';
  await session.prompt(last.content, { onTextChunk(chunk) { full += chunk; onToken(chunk); } });
  await context.dispose();
  return full;
}

module.exports = { stream };
