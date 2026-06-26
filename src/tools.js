// Agent tools: full filesystem + shell access at any location.
// Each tool returns a short string result that is fed back to the model.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

function resolvePath(p) {
  if (!p) return process.cwd();
  if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1));
  return path.resolve(p);
}

function clip(s, max = 12000) {
  s = String(s);
  return s.length > max ? s.slice(0, max) + `\n... [truncated ${s.length - max} chars]` : s;
}

const tools = {
  async read_file({ path: p }) {
    const fp = resolvePath(p);
    const data = fs.readFileSync(fp, 'utf8');
    return clip(data);
  },

  async write_file({ path: p, content }) {
    const fp = resolvePath(p);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content ?? '', 'utf8');
    return `Wrote ${Buffer.byteLength(content ?? '')} bytes to ${fp}`;
  },

  async create_file({ path: p, content }) {
    const fp = resolvePath(p);
    if (fs.existsSync(fp)) throw new Error('File already exists: ' + fp);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content ?? '', 'utf8');
    return `Created ${fp}`;
  },

  async delete_file({ path: p }) {
    const fp = resolvePath(p);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) fs.rmSync(fp, { recursive: true, force: true });
    else fs.unlinkSync(fp);
    return `Deleted ${fp}`;
  },

  async list_dir({ path: p }) {
    const fp = resolvePath(p || '.');
    const entries = fs.readdirSync(fp, { withFileTypes: true });
    const lines = entries.map(e => (e.isDirectory() ? '[dir]  ' : '[file] ') + e.name);
    return `Contents of ${fp}:\n` + (lines.join('\n') || '(empty)');
  },

  run_command({ command, cwd }) {
    return new Promise((resolve) => {
      exec(command, { cwd: resolvePath(cwd || '.'), windowsHide: true, timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          let out = '';
          if (stdout) out += stdout;
          if (stderr) out += (out ? '\n' : '') + '[stderr] ' + stderr;
          if (err && !stdout && !stderr) out += '[error] ' + err.message;
          resolve(clip(out || '(no output)'));
        });
    });
  }
};

async function runTool(name, args) {
  if (!tools[name]) throw new Error('Unknown tool: ' + name);
  return await tools[name](args || {});
}

// Plain-text tool descriptions (used as a fallback prompt for models without
// native function-calling, e.g. local GGUF).
const TOOL_SPEC = `Available tools:
- read_file{"path":"..."}
- write_file{"path":"...","content":"..."}
- create_file{"path":"...","content":"..."}
- delete_file{"path":"..."}
- list_dir{"path":"..."}
- run_command{"command":"...","cwd":"..."}`;

// OpenAI/OpenRouter-style JSON schema for native function-calling.
const TOOL_SCHEMA = [
  { type:'function', function:{ name:'read_file', description:'Read a file and return its contents.',
    parameters:{ type:'object', properties:{ path:{ type:'string', description:'File path (absolute, relative, or ~).' } }, required:['path'] } } },
  { type:'function', function:{ name:'write_file', description:'Create or overwrite a file with content.',
    parameters:{ type:'object', properties:{ path:{ type:'string' }, content:{ type:'string' } }, required:['path','content'] } } },
  { type:'function', function:{ name:'create_file', description:'Create a new file (errors if it already exists).',
    parameters:{ type:'object', properties:{ path:{ type:'string' }, content:{ type:'string' } }, required:['path'] } } },
  { type:'function', function:{ name:'delete_file', description:'Delete a file or folder.',
    parameters:{ type:'object', properties:{ path:{ type:'string' } }, required:['path'] } } },
  { type:'function', function:{ name:'list_dir', description:'List files and folders in a directory.',
    parameters:{ type:'object', properties:{ path:{ type:'string', description:'Directory path. Defaults to current dir.' } } } } },
  { type:'function', function:{ name:'run_command', description:'Run a shell command and return its output.',
    parameters:{ type:'object', properties:{ command:{ type:'string' }, cwd:{ type:'string', description:'Working directory.' } }, required:['command'] } } }
];

module.exports = { runTool, TOOL_SPEC, TOOL_SCHEMA, resolvePath };
