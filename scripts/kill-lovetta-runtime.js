#!/usr/bin/env node

const { execSync } = require('child_process')

function findLovettaPids() {
  try {
    const out = execSync("ps aux | grep 'node.*lovetta' | grep -v grep", {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!out) return []
    return out
      .split('\n')
      .map(line => {
        const parts = line.trim().split(/\s+/)
        return Number.parseInt(parts[1], 10)
      })
      .filter(pid => Number.isFinite(pid) && pid > 0 && pid !== process.pid)
  } catch {
    return []
  }
}

function main() {
  const pids = findLovettaPids()
  if (pids.length === 0) {
    console.log('[kill-runtime] No lovetta processes found')
    return
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM')
      console.log(`[kill-runtime] Sent SIGTERM to ${pid}`)
    } catch {}
  }

  // Give processes time to exit, then force kill
  setTimeout(() => {
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL')
        console.log(`[kill-runtime] Sent SIGKILL to ${pid}`)
      } catch {}
    }
  }, 1000)
}

main()
