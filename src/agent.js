// Multi-step agent loop.
// - OpenRouter models: try NATIVE function-calling first. If the model responds
//   without any tool_calls on the first step, fall back to JSON-in-text protocol
//   for the remainder of the conversation.
// - Local/other models: use JSON-in-text protocol from the start.
// We never leak raw JSON to the user; unparseable output is shown as a normal answer.
const openrouter = require('./openrouter');
const localModel = require('./localModel');
const { runTool, TOOL_SPEC, TOOL_SCHEMA } = require('./tools');

const MAX_STEPS = 25;

// Generic streaming helper that works for both OpenRouter and local models.
async function streamResponse({ model, systemPrompt, messages, onToken }) {
  if (model.type === 'openrouter') {
    return openrouter.stream({ model, systemPrompt, messages, onToken });
  }
  return localModel.stream({ model, systemPrompt, messages, onToken });
}

function nativeSystemPrompt() {
  return [
    'You are Nebula AI, an autonomous coding agent (like Cursor) with access to the user\'s machine',
    'through the provided tools: read/write/create/delete files, list directories, and run shell commands.',
    '',
    'Behave naturally:',
    '- For greetings, questions, or chit-chat, just reply in plain text. Do NOT call a tool.',
    '- Only use tools when the task genuinely requires inspecting or changing the system.',
    '- Work step by step: inspect before editing, and verify your work when useful.',
    '- When done, give a concise final answer in markdown.'
  ].join('\n');
}

function textSystemPrompt() {
  return [
    'You are Nebula AI, an autonomous coding agent with access to the user\'s machine.',
    '',
    'If the user just greets you or asks something that needs no tools, reply normally in plain text.',
    'ONLY when you need to act on the system, output a single line of JSON (no prose, no code fences):',
    '{"tool":"<name>","args":{...}}',
    '',
    TOOL_SPEC,
    '',
    'After you receive a TOOL RESULT, continue. When finished, reply in plain text (no JSON).'
  ].join('\n');
}

// Parse a possible tool call out of free text. Handles multiple/concatenated
// JSON objects. Returns { tool, args } or null. Never throws.
function parseTextToolCall(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const candidates = [];
  // collect each top-level {...} block
  let depth = 0, start = -1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') { depth--; if (depth === 0 && start !== -1) { candidates.push(t.slice(start, i + 1)); start = -1; } }
  }
  for (const block of candidates) {
    try {
      const obj = JSON.parse(block);
      if (obj && obj.tool) return { tool: obj.tool, args: obj.args || {} };
    } catch (_) {}
  }
  return null;
}

// Does the text look like it's ONLY a JSON tool blob (so we shouldn't show it)?
function isPureJson(text) {
  const t = (text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  return /^[{\[]/.test(t) && /[}\]]$/.test(t);
}

async function execTool(tool, args, requireApproval, callbacks) {
  callbacks.onStep({ phase: 'plan', tool, args });
  if (requireApproval) {
    const ok = await callbacks.requestApproval({ tool, args });
    if (!ok) {
      const denied = 'User denied permission to run ' + tool + '.';
      callbacks.onStep({ phase: 'result', tool, result: denied, denied: true });
      return denied;
    }
  }
  let result;
  try { result = await runTool(tool, args); }
  catch (err) { result = 'ERROR: ' + (err.message || String(err)); }
  callbacks.onStep({ phase: 'result', tool, args, result });
  return result;
}

/* -------- Text-based tool protocol (works for ALL model types) -------- */
async function runText({ model, messages, requireApproval, callbacks }) {
  const convo = [{ role: 'system', content: textSystemPrompt() }, ...messages];

  for (let step = 0; step < MAX_STEPS; step++) {
    let raw = '';
    const sys = convo.find(m => m.role === 'system');
    const rest = convo.filter(m => m.role !== 'system');
    await streamResponse({ model, systemPrompt: sys.content, messages: rest, onToken: (t) => { raw += t; } });

    const call = parseTextToolCall(raw);
    if (call) {
      const result = await execTool(call.tool, call.args, requireApproval, callbacks);
      convo.push({ role: 'assistant', content: raw });
      convo.push({ role: 'user', content: 'TOOL RESULT (' + call.tool + '):\n' + result });
      continue;
    }

    // no tool -> final answer. Never show raw JSON blobs to the user.
    const finalText = isPureJson(raw) ? 'Done.' : raw;
    callbacks.onFinal(finalText);
    return finalText;
  }
  const m = 'Reached the maximum number of steps (' + MAX_STEPS + ').';
  callbacks.onFinal(m); return m;
}

async function run({ model, messages, requireApproval, callbacks }) {
  // OpenRouter models: try native function-calling first, fall back to text.
  if (model.type === 'openrouter') {
    // Check if the model is known to support native function-calling.
    // Models from providers like Anthropic, OpenAI, Google typically do;
    // small/free models often don't. Use toolsLikely as a hint.
    if (model.toolsLikely) {
      const result = await tryNativeThenFallback({ model, messages, requireApproval, callbacks });
      return result;
    }
  }
  return runText({ model, messages, requireApproval, callbacks });
}

// Try native function-calling. If the model's first response has no tool_calls
// (meaning it likely doesn't support function-calling), fall back to text.
async function tryNativeThenFallback({ model, messages, requireApproval, callbacks }) {
  const convo = [{ role: 'system', content: nativeSystemPrompt() }, ...messages];

  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await openrouter.streamComplete({
      model, messages: convo, tools: TOOL_SCHEMA,
      onToken: (t) => callbacks.onThought && callbacks.onThought(t)
    });

    if (msg.tool_calls && msg.tool_calls.length) {
      convo.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        const name = tc.function?.name;
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch (_) {}
        const result = await execTool(name, args, requireApproval, callbacks);
        convo.push({ role: 'tool', tool_call_id: tc.id, name, content: result });
      }
      if (callbacks.onThoughtFlush) callbacks.onThoughtFlush();
      continue;
    }

    // No tool_calls returned. On the very first step this likely means the
    // model doesn't support function-calling at all — fall back to text.
    if (step === 0 && (!msg.content || msg.content.length < 5)) {
      return runText({ model, messages, requireApproval, callbacks });
    }

    // Otherwise treat as final answer
    callbacks.onFinal(msg.content || '');
    return msg.content || '';
  }
  const m = 'Reached the maximum number of steps (' + MAX_STEPS + ').';
  callbacks.onFinal(m); return m;
}

module.exports = { run };
