#!/usr/bin/env node
// Chain tsc -> vite build sequentially without depending on shell `&&`
// and without letting Windows cmd.exe interpret `&` in the project path.
//
// We resolve each bin's .js entry point and run it in-process via node,
// so no shell ever sees the project path.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cwd = path.resolve(here, '..');

/** Find a node-executable entry for a package installed under node_modules. */
function resolveBinJs(pkg) {
  const pkgJsonPath = path.join(cwd, 'node_modules', pkg, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    throw new Error(`Missing dep: ${pkg} (run "npm install")`);
  }
  const manifest = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const bin = manifest.bin;
  let relPath;
  if (typeof bin === 'string') relPath = bin;
  else if (bin && typeof bin === 'object') relPath = bin[pkg] ?? Object.values(bin)[0];
  if (!relPath) throw new Error(`No bin entry in ${pkg}/package.json`);
  return path.join(cwd, 'node_modules', pkg, relPath);
}

function run(binJs, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binJs, ...args], {
      cwd,
      stdio: 'inherit',
      // No shell: pass argv directly so cmd.exe never sees `&` in paths.
    });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${path.basename(binJs)} ${args.join(' ')} failed (${code})`)),
    );
  });
}

try {
  await run(resolveBinJs('typescript'), ['-b']);
  await run(resolveBinJs('vite'), ['build']);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
