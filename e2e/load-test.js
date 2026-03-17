#!/usr/bin/env node
/**
 * Load test — simulates N concurrent users chatting with AI companions.
 * Exercises the full pipeline: OpenRouter streaming, fal.ai media generation, media polling.
 *
 * Usage:
 *   node e2e/load-test.js --url http://localhost:3900
 *   node e2e/load-test.js --url http://localhost:3900 --users 50
 *   node e2e/load-test.js --url http://localhost:3900 --skip-media
 *   node e2e/load-test.js --url http://localhost:3900 --rounds 3
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1] || fallback;
}
const hasFlag = (name) => args.includes(`--${name}`);

const NUM_USERS = parseInt(getArg('users', '30'), 10);
const ROUNDS = parseInt(getArg('rounds', '1'), 10);
const SKIP_MEDIA = hasFlag('skip-media');
const REQUEST_TIMEOUT = 90_000; // 90s per SSE request
const MEDIA_POLL_INTERVAL = 3_000; // 3s
const MEDIA_POLL_TIMEOUT = 300_000; // 5 min

function resolveBaseUrl() {
  const explicit = getArg('url', null);
  if (explicit) return explicit.replace(/\/$/, '');
  // Try dev:agent port file
  for (const f of ['scripts/.dev-agent-port', 'e2e/.test-port']) {
    try {
      const port = fs.readFileSync(path.join(__dirname, '..', f), 'utf8').trim();
      if (port) return `http://localhost:${port}`;
    } catch {}
  }
  return 'http://localhost:3900';
}

const BASE = resolveBaseUrl();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const log = (msg) => process.stdout.write(`${msg}\n`);
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
}

function fmtMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function statsLine(label, values) {
  if (!values.length) return `  ${label}: ${dim('no data')}`;
  const sorted = [...values].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return `  ${label}:  min ${fmtMs(sorted[0])}  avg ${fmtMs(avg)}  p50 ${fmtMs(percentile(sorted, 50))}  p95 ${fmtMs(percentile(sorted, 95))}  max ${fmtMs(sorted[sorted.length - 1])}`;
}

async function jsonPost(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data)}`);
  return data;
}

// ---------------------------------------------------------------------------
// SSE stream reader
// ---------------------------------------------------------------------------
async function readSSE(url, body, headers, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const result = {
    startTime: Date.now(),
    firstChunkTime: null,
    doneTime: null,
    events: [],
    error: null,
    messageId: null,
    mediaPending: false,
    mediaBlocked: false,
    regenerateCount: 0,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      result.error = `HTTP ${res.status}`;
      return result;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }
        result.events.push(event);

        if (event.type === 'chunk' && !result.firstChunkTime) {
          result.firstChunkTime = Date.now();
        } else if (event.type === 'regenerate') {
          result.regenerateCount++;
        } else if (event.type === 'done') {
          result.doneTime = Date.now();
          result.messageId = event.messageId;
          result.mediaPending = event.mediaPending || false;
          result.mediaBlocked = event.mediaBlocked || false;
        } else if (event.type === 'error') {
          result.error = event.message || event.code;
        }
      }
    }
  } catch (err) {
    result.error = err.name === 'AbortError' ? 'timeout' : err.message;
  } finally {
    clearTimeout(timer);
  }

  if (!result.doneTime && !result.error) {
    result.error = 'stream ended without done event';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Media polling
// ---------------------------------------------------------------------------
async function pollMedia(messageId, headers) {
  const start = Date.now();
  let polls = 0;

  while (Date.now() - start < MEDIA_POLL_TIMEOUT) {
    polls++;
    try {
      const res = await fetch(`${BASE}/api/chat/message/${messageId}/media`, {
        headers,
      });
      if (!res.ok) return { success: false, polls, elapsed: Date.now() - start, error: `HTTP ${res.status}` };
      const data = await res.json();
      if (!data.pending) {
        return {
          success: !!data.mediaUrl,
          noMedia: !data.mediaUrl, // generation finished but no URL (fal.ai failure or no avatar)
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          polls,
          elapsed: Date.now() - start,
        };
      }
    } catch (err) {
      return { success: false, polls, elapsed: Date.now() - start, error: err.message };
    }
    await new Promise(r => setTimeout(r, MEDIA_POLL_INTERVAL));
  }

  return { success: false, polls, elapsed: Date.now() - start, error: 'timeout' };
}

// ---------------------------------------------------------------------------
// Setup: create users + companions
// ---------------------------------------------------------------------------
async function setupUsers(count) {
  log(`\n${bold('Setting up')} ${count} test users...`);
  const users = [];

  // Create users one at a time to avoid auth rate limiter (express-rate-limit)
  for (let idx = 0; idx < count; idx++) {
    const email = `loadtest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.com`;

    // Sign up (with retry on 429 — auth rate limit is 20/15min per IP)
    let signup;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        signup = await jsonPost(`${BASE}/api/auth/signup`, {
          email,
          password: 'LoadTest1234!',
          birthMonth: 6,
          birthYear: 1995,
          termsAccepted: true,
          privacyAccepted: true,
          aiConsentAccepted: true,
        });
        break;
      } catch (err) {
        if (err.message.includes('429') && attempt < 9) {
          const wait = 60; // seconds — auth limiter is 20/15min, need ~45s per slot to slide
          process.stdout.write(`\n  ${yellow(`Rate limited at user ${idx + 1}, waiting ${wait}s (attempt ${attempt + 1})...`)}`);
          await new Promise(r => setTimeout(r, wait * 1000));
          continue;
        }
        throw err;
      }
    }

    const authHeaders = {
      'Authorization': `Bearer ${signup.accessToken}`,
      'Content-Type': 'application/json',
    };

    // Create companion
    const companion = await jsonPost(`${BASE}/api/companions`, {
      name: `TestGirl${idx}`,
      personality: 'Flirty, playful, and adventurous. Loves teasing and sending selfies.',
      backstory: 'A fun-loving college student who enjoys photography and spontaneous adventures.',
      traits: ['flirty', 'playful', 'adventurous'],
      communicationStyle: 'playful',
      age: 22,
    }, authHeaders);

    users.push({
      idx,
      email,
      userId: signup.user?.id,
      accessToken: signup.accessToken,
      companionId: companion.companion?.id || companion.id,
      authHeaders,
    });

    process.stdout.write(`  ${dim(`${users.length}/${count} users created`)}\r`);
  }

  log(`  ${green('Done:')} ${users.length} users with companions created`);
  return users;
}

// ---------------------------------------------------------------------------
// Phase 1: Chat messages
// ---------------------------------------------------------------------------
async function runChatPhase(users, round) {
  log(`\n${bold(`═══ Phase 1: Chat Messages (${users.length} users, round ${round}) ═══`)}`);

  const promises = users.map((u) =>
    readSSE(
      `${BASE}/api/chat/${u.companionId}/message`,
      { content: 'Hey! Tell me something fun about yourself' },
      u.authHeaders,
    )
  );

  const results = await Promise.all(promises);

  // Metrics
  const successes = results.filter(r => !r.error);
  const ttfbs = successes.filter(r => r.firstChunkTime).map(r => r.firstChunkTime - r.startTime);
  const totals = successes.filter(r => r.doneTime).map(r => r.doneTime - r.startTime);
  const mediaTriggered = successes.filter(r => r.mediaPending).length;
  const regenerates = results.reduce((s, r) => s + r.regenerateCount, 0);
  const errors = results.filter(r => r.error);

  log(`  Successes: ${green(`${successes.length}`)} / ${results.length}`);
  log(statsLine('TTFB (first chunk)', ttfbs));
  log(statsLine('Total response    ', totals));
  log(`  Media triggered: ${mediaTriggered} / ${results.length}`);
  if (regenerates) log(`  Age guard regenerations: ${yellow(String(regenerates))}`);
  if (errors.length) {
    log(`  ${red('Errors:')} ${errors.length}`);
    const grouped = {};
    errors.forEach(e => { grouped[e.error] = (grouped[e.error] || 0) + 1; });
    Object.entries(grouped).forEach(([msg, cnt]) => log(`    ${cnt}x ${msg}`));
  }

  return results;
}

// ---------------------------------------------------------------------------
// Phase 2: Media requests
// ---------------------------------------------------------------------------
async function runMediaRequestPhase(users, round) {
  log(`\n${bold(`═══ Phase 2: Media Requests (${users.length} users, round ${round}) ═══`)}`);

  const promises = users.map((u) =>
    readSSE(
      `${BASE}/api/chat/${u.companionId}/request-media`,
      {},
      u.authHeaders,
    )
  );

  const results = await Promise.all(promises);

  const successes = results.filter(r => !r.error);
  const ttfbs = successes.filter(r => r.firstChunkTime).map(r => r.firstChunkTime - r.startTime);
  const totals = successes.filter(r => r.doneTime).map(r => r.doneTime - r.startTime);
  const mediaPending = successes.filter(r => r.mediaPending).length;
  const mediaBlocked = successes.filter(r => r.mediaBlocked).length;
  const errors = results.filter(r => r.error);

  log(`  Successes: ${green(`${successes.length}`)} / ${results.length}`);
  log(statsLine('TTFB (first chunk)', ttfbs));
  log(statsLine('Total response    ', totals));
  log(`  Media pending: ${cyan(String(mediaPending))} / ${results.length}`);
  if (mediaBlocked) log(`  Media blocked: ${yellow(String(mediaBlocked))}`);
  if (errors.length) {
    log(`  ${red('Errors:')} ${errors.length}`);
    const grouped = {};
    errors.forEach(e => { grouped[e.error] = (grouped[e.error] || 0) + 1; });
    Object.entries(grouped).forEach(([msg, cnt]) => log(`    ${cnt}x ${msg}`));
  }

  return results;
}

// ---------------------------------------------------------------------------
// Phase 3: Media polling
// ---------------------------------------------------------------------------
async function runMediaPollingPhase(users, pendingMessages) {
  if (!pendingMessages.length) {
    log(`\n${bold('═══ Phase 3: Media Polling ═══')}`);
    log(`  ${dim('No pending media to poll')}`);
    return;
  }

  log(`\n${bold(`═══ Phase 3: Media Polling (${pendingMessages.length} pending) ═══`)}`);

  const promises = pendingMessages.map(({ messageId, authHeaders }) =>
    pollMedia(messageId, authHeaders)
  );

  const results = await Promise.all(promises);

  const withMedia = results.filter(r => r.success);
  const noMedia = results.filter(r => r.noMedia); // generation ran but no URL
  const errored = results.filter(r => !r.success && !r.noMedia);
  const allResolved = [...withMedia, ...noMedia];
  const times = allResolved.map(r => r.elapsed);
  const pollCounts = results.map(r => r.polls);

  log(`  With media URL: ${green(`${withMedia.length}`)} / ${results.length}`);
  log(`  No media URL:   ${yellow(`${noMedia.length}`)} / ${results.length} ${dim('(generation completed but no image — likely missing avatar)')}`);
  log(statsLine('Resolution time', times));
  if (errored.length) {
    log(`  ${red('Errors/timeout:')} ${errored.length}`);
    const grouped = {};
    errored.forEach(r => { grouped[r.error || 'unknown'] = (grouped[r.error || 'unknown'] || 0) + 1; });
    Object.entries(grouped).forEach(([msg, cnt]) => log(`    ${cnt}x ${msg}`));
  }
  const avgPolls = pollCounts.reduce((a, b) => a + b, 0) / pollCounts.length;
  log(`  Avg polls per item: ${avgPolls.toFixed(1)}`);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
async function cleanup(users) {
  log(`\n${dim('Cleaning up test users...')}`);
  // Delete users via admin API (if available), otherwise just log
  for (const u of users) {
    try {
      await fetch(`${BASE}/api/auth/delete-account`, {
        method: 'DELETE',
        headers: u.authHeaders,
      });
    } catch {}
  }
  log(dim('  Cleanup done'));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  log(bold('\n🔥 Lovetta Load Test'));
  log(`  Server:     ${BASE}`);
  log(`  Users:      ${NUM_USERS}`);
  log(`  Rounds:     ${ROUNDS}`);
  log(`  Media test: ${SKIP_MEDIA ? red('skipped') : green('enabled')}`);
  log(`  Timeout:    ${fmtMs(REQUEST_TIMEOUT)} per request`);

  // Health check
  try {
    const res = await fetch(`${BASE}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    log(`  Health:     ${green('OK')}`);
  } catch (err) {
    log(`\n${red('ERROR:')} Server not reachable at ${BASE}`);
    log(`  Start the server first: npm run dev:agent`);
    process.exit(1);
  }

  const startTime = Date.now();
  const users = await setupUsers(NUM_USERS);

  for (let round = 1; round <= ROUNDS; round++) {
    if (ROUNDS > 1) log(`\n${bold(`━━━ Round ${round}/${ROUNDS} ━━━`)}`);

    // Phase 1: Chat
    const chatResults = await runChatPhase(users, round);

    if (!SKIP_MEDIA) {
      // Phase 2: Media requests
      const mediaResults = await runMediaRequestPhase(users, round);

      // Collect all pending media from both phases
      const pendingMessages = [];

      for (let i = 0; i < chatResults.length; i++) {
        if (chatResults[i].mediaPending && chatResults[i].messageId) {
          pendingMessages.push({
            messageId: chatResults[i].messageId,
            authHeaders: users[i].authHeaders,
          });
        }
      }
      for (let i = 0; i < mediaResults.length; i++) {
        if (mediaResults[i].mediaPending && mediaResults[i].messageId) {
          pendingMessages.push({
            messageId: mediaResults[i].messageId,
            authHeaders: users[i].authHeaders,
          });
        }
      }

      // Phase 3: Poll media
      await runMediaPollingPhase(users, pendingMessages);
    }
  }

  const totalTime = Date.now() - startTime;
  log(`\n${bold('Total time:')} ${fmtMs(totalTime)}`);

  await cleanup(users);
  log('');
}

main().catch((err) => {
  console.error(red(`\nFatal error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
