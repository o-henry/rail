#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';

const workerPath = path.resolve('scripts/web_worker/index.mjs');
const child = spawn(process.execPath, [workerPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    ...process.env,
    RAIL_WEB_PROFILE_ROOT: path.resolve('.tmp/web-profile'),
    RAIL_WEB_LOG_PATH: path.resolve('.tmp/web-worker.log'),
  },
});

child.stdout.setEncoding('utf8');
let gotHealth = false;
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  const lines = chunk
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const msg = JSON.parse(line);
    if (msg.id === 1 && msg.result) {
      gotHealth = true;
      child.stdin.end();
    }
  }
});

child.on('exit', (code) => {
  if (!gotHealth || code !== 0) {
    process.exit(1);
  }
  process.exit(0);
});

child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'health', params: {} })}\n`);
