#!/usr/bin/env node

const { spawn } = require('child_process')
const { resolve } = require('path')

const children = new Map()
let shuttingDown = false
let exitCode = 0

function spawnChild(label, command, args, options = {}) {
  const env = { ...process.env, ...options.env }
  const child = spawn(command, args, {
    stdio: 'inherit',
    cwd: options.cwd ?? resolve(__dirname, '..'),
    env,
  })
  children.set(label, child)

  child.on('error', () => {
    if (!shuttingDown) shutdown(1)
  })

  child.on('exit', (code, signal) => {
    children.delete(label)

    if (shuttingDown) {
      if (children.size === 0) process.exit(exitCode)
      return
    }

    if (code !== 0) {
      console.error(`[dev] "${label}" exited with code ${code ?? 'null'}${signal ? ` (signal: ${signal})` : ''}`)
    } else {
      console.error(`[dev] "${label}" exited unexpectedly.`)
    }
    shutdown(code && code > 0 ? code : 1)
  })

  return child
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  exitCode = code

  for (const child of children.values()) {
    if (!child.pid) continue
    try {
      process.kill(child.pid, 'SIGTERM')
    } catch {}
  }

  if (children.size === 0) {
    process.exit(exitCode)
    return
  }

  const timer = setTimeout(() => process.exit(exitCode), 2000)
  timer.unref()
}

async function runSync(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

async function main() {
  console.log('[dev] Cleaning up existing processes...')
  await runSync('node', [resolve(__dirname, 'kill-lovetta-runtime.js')])
  await runSync('node', [resolve(__dirname, 'kill-ports.js'), '3900'])

  spawnChild('server', 'node', ['server/index.js'], {
    cwd: resolve(__dirname, '..'),
  })

  console.log('\n[dev] Local:   http://localhost:3900')
  console.log('[dev] Admin:   http://localhost:3900/admin.html\n')
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  shutdown(1)
})
