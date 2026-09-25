#!/usr/bin/env node
/**
 * Launcher that scrubs the environment before starting Electron.
 *
 * VS Code's extension host exports ELECTRON_RUN_AS_NODE=1, and every terminal
 * and task spawned from the editor inherits it. Electron then boots as a plain
 * Node process, `require('electron')` comes back without `app`, and the app
 * dies with a confusing "Cannot read properties of undefined (reading
 * 'isPackaged')". Stripping the variable here means `npm run dev` behaves the
 * same inside the editor as it does in a normal shell.
 *
 * Wire it up in package.json:
 *   "dev": "node scripts/launch.js electron-vite dev"
 *
 * This file is yours once copied - the plugin will not touch it again.
 */

const { spawn } = require('node:child_process')

const STRIP = ['ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ATTACH_CONSOLE']

const env = { ...process.env }
for (const name of STRIP) delete env[name]

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('usage: node scripts/launch.js <command> [args...]')
  process.exit(1)
}

const [command, ...rest] = args
// Windows needs a shell: node_modules/.bin/*.cmd shims cannot be spawned directly
// (Node refuses .cmd/.bat without one since CVE-2024-27980). Passing an args array
// together with shell:true is deprecated (DEP0190, warns on every run since Node 24),
// so build the single command line here with explicit quoting. Elsewhere spawn the
// binary directly.
const quote = (s) => (/\s/.test(s) ? `"${s}"` : s)
const child = process.platform === 'win32'
  ? spawn([command, ...rest].map(quote).join(' '), { env, stdio: 'inherit', shell: true })
  : spawn(command, rest, { env, stdio: 'inherit' })

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
