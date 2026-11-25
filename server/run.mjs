// Plain JS so an old Node can still say what's wrong instead of failing on TypeScript syntax.
import { spawn } from 'node:child_process';

const MIN = [22, 13];
const [major, minor] = process.versions.node.split('.').map(Number);
const args = process.argv.slice(2);

if (major < MIN[0] || (major === MIN[0] && minor < MIN[1])) {
  const msg = `Scintle needs Node.js ${MIN.join('.')} or newer; this is ${process.version}. Scintle is paused until Node is updated.`;
  // SessionStart shows a hook's systemMessage to the person; other callers print plain text.
  console.log(args[0] === 'hook' && args[1] === '--start' ? JSON.stringify({ systemMessage: msg }) : msg);
  process.exit(0);
}

const cli = new URL('./cli.ts', import.meta.url);
if (process.features.typescript) {
  await import(cli.href);
} else {
  const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', cli.pathname, ...args], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
}
