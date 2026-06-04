#!/usr/bin/env node
/**
 * Build script to inject ELEVENLABS_API_KEY into index.html
 * Run: node config.js
 */

const fs = require('fs');
const path = require('path');

const apiKey = process.env.ELEVENLABS_API_KEY;

if (!apiKey) {
  console.error('Error: ELEVENLABS_API_KEY environment variable not set');
  console.error('Set it with: export ELEVENLABS_API_KEY=sk_your_key_here');
  process.exit(1);
}

const indexPath = path.join(__dirname, 'index.html');
let content = fs.readFileSync(indexPath, 'utf-8');

// Replace placeholder with actual API key
content = content.replace(
  "window.ELEVENLABS_API_KEY = '__ELEVENLABS_API_KEY__'",
  `window.ELEVENLABS_API_KEY = '${apiKey}'`
);

fs.writeFileSync(indexPath, content);
console.log('✓ API key injected into index.html');

