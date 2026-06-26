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

  // PERF: creating/disposal of a full context every turn is expensive on low-end PCs.
  // Keep a cached context+session per model and only recreate if something goes wrong.
  let cached = cache.get(model.ggufPath);
  if (!cached.context){
    cached.context = await llamaModel.createContext({
      // Conservative defaults to reduce lag on low-end machines.
      // node-llama-cpp will pick reasonable threads unless overridden.
      contextSize: 2048
    });
    cached.session = new LlamaChatSession({
      contextSequence: cached.context.getSequence(),
      systemPrompt
    });
  }

  // memory: replay recent user turns so the model has context (kept small).
  // NOTE: We do NOT re-create session each time; instead we just prompt sequentially.
  const session = cached.session;

  const last = messages[messages.length - 1];
  let full = '';

  // PERF: throttle token callbacks to the renderer (DOM updates are expensive).
  let buf = '';
  let lastFlush = 0;
  const FLUSH_MS = 33; // ~30fps
  const flush = () => {
    if (!buf) return;
    onToken(buf);
    buf = '';
    lastFlush = Date.now();
  };

  try {
    await session.prompt(last.content, {
      onTextChunk(chunk) {
        full += chunk;
        buf += chunk;
        const now = Date.now();
        if (now - lastFlush >= FLUSH_MS) flush();
      }
    });
  } catch (e) {
    // If the cached context/session got into a bad state, reset once.
    try { if (cached.context) await cached.context.dispose(); } catch (_) {}
    cached.context = null;
    cached.session = null;
    throw e;
  } finally {
    flush();
  }

  return full;
}

module.exports = { stream };
