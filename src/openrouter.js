// Streams a chat completion from OpenRouter.
// model.api = OpenRouter API key, model.model = model id (e.g. "openai/gpt-4o-mini").
async function stream({ model, systemPrompt, messages, onToken }) {
  if (!model.api) throw new Error('Missing OpenRouter API key in model json');

  const body = {
    model: model.model,
    stream: true,
    messages: [{ role: 'system', content: systemPrompt }, ...messages]
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${model.api}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nebula.ai',
      'X-Title': 'Nebula AI'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${txt}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const token = json.choices?.[0]?.delta?.content || '';
        if (token) { full += token; onToken(token); }
      } catch (_) { /* ignore partial */ }
    }
  }
  return full;
}

// Non-streaming completion with optional native tool-calling.
// Returns the raw assistant message { content, tool_calls } so the agent can
// use proper function-calling instead of parsing JSON out of text.
async function complete({ model, messages, tools }) {
  if (!model.api) throw new Error('Missing OpenRouter API key in model json');
  const body = { model: model.model, stream: false, messages };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${model.api}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nebula.ai',
      'X-Title': 'Nebula AI'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) { const txt = await res.text(); throw new Error(`OpenRouter ${res.status}: ${txt}`); }
  const json = await res.json();
  const msg = json.choices?.[0]?.message || {};
  return { content: msg.content || '', tool_calls: msg.tool_calls || null };
}

// Streaming completion WITH tool support. Streams text deltas via onToken and
// returns the final { content, tool_calls } once the stream ends. Used by the
// agent so the user sees the model's reasoning live.
async function streamComplete({ model, messages, tools, onToken }) {
  if (!model.api) throw new Error('Missing OpenRouter API key in model json');
  const body = { model: model.model, stream: true, messages };
  if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${model.api}`, 'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nebula.ai', 'X-Title': 'Nebula AI' },
    body: JSON.stringify(body)
  });
  if (!res.ok) { const txt = await res.text(); throw new Error(`OpenRouter ${res.status}: ${txt}`); }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let content = ''; let buffer = '';
  const toolAcc = {}; // index -> { id, name, arguments }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta || {};
        if (delta.content) { content += delta.content; if (onToken) onToken(delta.content); }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const i = tc.index ?? 0;
            toolAcc[i] = toolAcc[i] || { id: '', name: '', arguments: '' };
            if (tc.id) toolAcc[i].id = tc.id;
            if (tc.function?.name) toolAcc[i].name = tc.function.name;
            if (tc.function?.arguments) toolAcc[i].arguments += tc.function.arguments;
          }
        }
      } catch (_) {}
    }
  }
  const tool_calls = Object.values(toolAcc).map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.arguments } }));
  return { content, tool_calls: tool_calls.length ? tool_calls : null };
}

module.exports = { stream, complete, streamComplete };
