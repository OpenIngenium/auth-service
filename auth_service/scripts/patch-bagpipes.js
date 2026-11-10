'use strict';

// Makes bagpipes@0.0.6 work on Node 12+, whose multi-line MODULE_NOT_FOUND
// messages break its fitting loader and crash startup ("Error initializing
// middleware"). Idempotent; runs on postinstall so it applies everywhere.

const fs = require('fs');
const path = require('path');

const target = path.resolve(
  __dirname,
  '..',
  'node_modules',
  'bagpipes',
  'lib',
  'fittingTypes',
  'user.js'
);

const ORIGINAL = 'var split = err.message.split(path.sep);';
const PATCHED = "var split = err.message.split('\\n')[0].split(path.sep);";

if (!fs.existsSync(target)) {
  console.log('[patch-bagpipes] bagpipes not installed; nothing to patch.');
  process.exit(0);
}

const source = fs.readFileSync(target, 'utf8');

if (source.includes(PATCHED)) {
  console.log('[patch-bagpipes] already patched.');
  process.exit(0);
}

if (!source.includes(ORIGINAL)) {
  console.error(
    '[patch-bagpipes] expected code not found in ' +
      target +
      ' - bagpipes version may have changed. Skipping.'
  );
  process.exit(0);
}

fs.writeFileSync(target, source.replace(ORIGINAL, PATCHED));
console.log('[patch-bagpipes] applied Node 12+ compatibility fix.');
