#!/usr/bin/env node

/**
 * Agent-safe dev server — picks a random free port, never kills existing processes.
 * Use this instead of run-dev.js when running alongside the user's dev server.
 */

const { spawn } = require('child_process')
const { resolve } = require('path')
const net = require('net')
const fs = require('fs')

const ROOT = resolve(__dirname, '..')
const PORT_FILE = resolve(__dirname, '.dev-agent-port')

let server = null
let shuttingDown = false

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

function runSync(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd: ROOT })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true

  try { fs.unlinkSync(PORT_FILE) } catch {}

  if (server && server.pid) {
    try { process.kill(server.pid, 'SIGTERM') } catch {}
  }

  setTimeout(() => process.exit(code), 2000).unref()
}

async function main() {
  const port = await getFreePort()
  fs.writeFileSync(PORT_FILE, String(port))

  console.log('[dev:agent] Building React app...')
  await runSync('npm', ['-w', 'web', 'run', 'build'])

  console.log(`[dev:agent] Starting server on port ${port}...`)
  server = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) },
  })

  server.on('error', () => shutdown(1))
  server.on('exit', (code) => {
    if (!shuttingDown) shutdown(code || 1)
  })

  console.log(`\n[dev:agent] Server:  http://localhost:${port}`)
  console.log(`[dev:agent] App:     http://localhost:${port}/my/`)
  console.log(`[dev:agent] Admin:   http://localhost:${port}/admin.html\n`)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  shutdown(1)
})
