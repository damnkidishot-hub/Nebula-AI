# Nebula AI

A ChatGPT-style desktop AI chatbot built with **Electron + Node.js**.
Supports **OpenRouter** (cloud) and **local GGUF** models, with auth, chat history,
streaming, code canvas, persistent memory, a model switcher, and an agent/normal mode switcher.

## Features

- Auth (register / login) with bcrypt-hashed passwords stored in SQLite
- Multiple HTML pages: `login.html`, `register.html`, `chat.html`
- ChatGPT-like UI with animated gradient background and smooth animations
- Streaming responses (token by token) for both OpenRouter and local models
- Code canvas with a copy button for fenced code blocks
- Persistent memory: every chat + message is stored and replayed (context-limited)
- Profile (display name + avatar) and a settings modal
- **Model switcher** built from the `models/` folder
- **Mode switcher**: Normal (works now) and Agent (wired up, logic added later)

## Setup

```bash
npm install
npm start
```

No native build tools required. The database is a plain JSON file, so there is
nothing to compile.

### Optional: local GGUF models

OpenRouter works out of the box. To also run local `.gguf` models, install the
optional engine once:

```bash
npm run local-models
```

> This pulls `node-llama-cpp@latest` (prebuilt binaries, no Visual Studio needed).
> If you only use OpenRouter, you can skip this step.

**Model architecture support:** the local engine is `llama.cpp`. It supports common
architectures (Llama, Qwen, Mistral, Phi, Gemma, etc.). If you see
`unknown model architecture: 'xxx'` (e.g. `lfm2`), your GGUF uses a newer
architecture than the installed engine. Fix it by either:
- running `npm run local-models` again to get the latest engine, or
- using a GGUF with a widely-supported architecture.

## Models folder

Put your models in `models/`:

- `.gguf` files (any size, no limit) for local models
- `.json` descriptor files (the **json file name = the model display name**)

### Example: OpenRouter model (`models/GPT-4o-mini.json`)

```json
{
  "Model type": "openrouter",
  "api": "sk-or-v1-REPLACE_WITH_YOUR_OPENROUTER_KEY",
  "Model": "openai/gpt-4o-mini"
}
```

> **`Model` must be a real OpenRouter model id.** `openrouter/free` is NOT valid.
> Use one of these:
>
> | Use | id |
> |---|---|
> | Auto-router (picks a model) | `openrouter/auto` |
> | Cheap + good tool use | `openai/gpt-4o-mini` |
> | Strong tool use | `anthropic/claude-3.5-sonnet` |
> | Free, tool-capable | `meta-llama/llama-3.3-70b-instruct:free` |
> | Free, tool-capable | `qwen/qwen-2.5-72b-instruct:free` |
>
> **Agent mode needs a model that supports tool/function calling.** Not all free
> models do; if the agent never calls tools, switch to one of the tool-capable
> ids above. Browse all ids at https://openrouter.ai/models (filter by "Tools").

### Example: Local model (`models/My Local Model.json`)

```json
{
  "Model type": "local",
  "api": "none",
  "Model": "my-model.gguf"
}
```

For local models, `Model` is the **.gguf filename** inside `models/`.
For OpenRouter, `Model` is the **model id** and `api` is your OpenRouter API key.

## File structure

```
nebula-ai/
├── package.json
├── main.js              # Electron main process + IPC
├── preload.js           # secure bridge (contextIsolation)
├── src/
│   ├── db.js            # SQLite (users, chats, messages)
│   ├── auth.js          # register / login / profile
│   ├── models.js        # reads models/ folder
│   ├── openrouter.js    # OpenRouter streaming
│   └── localModel.js    # local GGUF streaming (node-llama-cpp)
├── renderer/
│   ├── login.html
│   ├── register.html
│   ├── chat.html
│   ├── css/styles.css
│   └── js/
│       ├── auth.js
│       ├── markdown.js  # markdown + code canvas
│       └── chat.js      # chat logic, streaming, switchers
└── models/
    ├── example-model.json
    └── example-local.json
```

## Agent mode

Switch to **Agent** in the input toolbar to let the AI work autonomously, multi-step,
Cursor-style. The agent can:

- `read_file`, `write_file`, `create_file`, `delete_file`
- `list_dir`
- `run_command` (any shell command)

at **any location on your machine**. Each turn the model plans one tool call, sees the
result, and continues until the task is done, keeping the full step history as memory.

### Approvals (safety)

The **Approve** toggle in the toolbar is **on by default**: every tool call asks for your
permission (Allow / Deny) before running. Turn it off for fully autonomous operation.

> ⚠ With approvals off, the agent can read, modify, delete files and run commands
> anywhere without prompting. Only disable it if you trust the model and the task.

Tool steps appear as live cards in the chat (with a spinner, the arguments, and the
output), so you can see exactly what the agent is doing.

### Stop

While the AI is responding, the send button becomes a red **stop** button to halt
generation.
