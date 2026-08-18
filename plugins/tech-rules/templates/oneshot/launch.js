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
const child = spawn(command, rest, {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32'
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
