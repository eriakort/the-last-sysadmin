#!/usr/bin/env node
// Tiny concat build step.
// Usage: node build.js
// Reads index.html, injects src/*.js into a marked region, writes the result.
// Keeps the final artifact as a single file. No visual changes.

const fs = require('fs');
const path = require('path');

const INDEX = path.join(__dirname, 'index.html');
const SRC = path.join(__dirname, 'src');

const START = '/* === EXTRACTED HELPERS START === */';
const END = '/* === EXTRACTED HELPERS END === */';

function collect() {
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js')).sort();
  return files.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
}

function main() {
  let html = fs.readFileSync(INDEX, 'utf8');
  const helpers = collect();
  const block = `${START}\n${helpers}\n${END}`;

  if (html.includes(START) && html.includes(END)) {
    html = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
  } else {
    // First run: insert after the KEY line as a comment for now
    // (manual placement preferred until you want full automation)
    console.log('No markers found. Add the markers manually or run with --force later.');
    console.log('Helpers ready in src/.');
    return;
  }

  fs.writeFileSync(INDEX, html);
  console.log('index.html updated with extracted helpers.');
}

if (require.main === module) main();
