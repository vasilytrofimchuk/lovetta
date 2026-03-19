/**
 * Multi-level companion memory system.
 *
 * Level 1: Recent messages (last 10) — handled in chat-api.js
 * Level 2: Conversation summaries — generated every ~20 messages
 * Level 3: Long-term facts — extracted every ~5 messages
 *
 * Memory processing runs fire-and-forget after each assistant message.
 */

const { getPool } = require('./db');
const { trackConsumption } = require('./consumption');

const EXTRACTION_THRESHOLD = 3;
const SUMMARY_THRESHOLD = 20;
const MAX_MEMORY_CHARS = 3000; // ~750 tokens hard cap
const EXTRACTION_CHUNK_SIZE = 5; // process user messages in small batches

// -- Build memory context for system prompt ----------------------

/**
 * Build the memory section to inject into the companion's system prompt.
 * Returns formatted text with facts + summaries, capped at ~750 tokens.
 */
async function buildMemoryContext(conversationId) {
  const pool = getPool();
  if (!pool) return '';

  const [factsResult, summariesResult] = await Promise.all([
    pool.query(
      `SELECT category, fact FROM companion_memories
       WHERE conversation_id = $1 ORDER BY category, updated_at DESC`,
      [conversationId]
    ),
    pool.query(
      `SELECT summary, created_at FROM conversation_summaries
       WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 3`,
      [conversationId]
    ),
  ]);

  const facts = factsResult.rows;
  const summaries = summariesResult.rows.reverse(); // chronological

  if (facts.length === 0 && summaries.length === 0) return '';

  let memoryPrompt = '';

  if (facts.length > 0) {
    memoryPrompt += '\nWHAT YOU REMEMBER ABOUT THE USER:\n';
    memoryPrompt += facts.map(f => `- ${f.fact}`).join('\n');
    memoryPrompt += '\n';
  }

  if (summaries.length > 0) {
    memoryPrompt += '\nRECENT CONVERSATION HISTORY:\n';
    for (const s of summaries) {
      const ago = timeAgo(s.created_at);
      memoryPrompt += `[${ago}] ${s.summary}\n`;
    }
  }

  // Hard cap to prevent token overflow
  if (memoryPrompt.length > MAX_MEMORY_CHARS) {
    // Drop oldest summaries first, then trim facts
    if (summaries.length > 1) {
      // Rebuild with fewer summaries
      memoryPrompt = '';
      if (facts.length > 0) {
        memoryPrompt += '\nWHAT YOU REMEMBER ABOUT THE USER:\n';
        memoryPrompt += facts.map(f => `- ${f.fact}`).join('\n');
        memoryPrompt += '\n';
      }
      // Keep only last summary
      const last = summaries[summaries.length - 1];
      memoryPrompt += `\nRECENT CONVERSATION HISTORY:\n[${timeAgo(last.created_at)}] ${last.summary}\n`;
    }
    // Final hard truncation if still over
    if (memoryPrompt.length > MAX_MEMORY_CHARS) {
      memoryPrompt = memoryPrompt.slice(0, MAX_MEMORY_CHARS);
    }
  }

  return memoryPrompt;
}

// -- Post-message memory processing (fire-and-forget) -----------

/**
 * Process memory after an assistant message. Increments counters
 * and triggers extraction/summarization when thresholds are hit.
 */
async function processMemory(pool, conversationId, companionId, userId) {
  // Increment counters
  const { rows } = await pool.query(
    `UPDATE conversations
     SET messages_since_summary = COALESCE(messages_since_summary, 0) + 1,
         messages_since_extraction = COALESCE(messages_since_extraction, 0) + 1
     WHERE id = $1
     RETURNING messages_since_summary, messages_since_extraction`,
    [conversationId]
  );

  if (!rows[0]) return;
  const { messages_since_summary, messages_since_extraction } = rows[0];

  // Fact extraction (every 5 messages)
  if (messages_since_extraction >= EXTRACTION_THRESHOLD) {
    try {
      await extractFacts(pool, conversationId, companionId, userId);
      await pool.query(
        'UPDATE conversations SET messages_since_extraction = 0 WHERE id = $1',
        [conversationId]
      );
    } catch (err) {
      console.warn('[memory] fact extraction failed:', err.message);
    }
  }

  // Summary generation (every 20 messages)
  if (messages_since_summary >= SUMMARY_THRESHOLD) {
    try {
      await generateSummary(pool, conversationId, companionId, userId);
      await pool.query(
        'UPDATE conversations SET messages_since_summary = 0 WHERE id = $1',
        [conversationId]
      );
    } catch (err) {
      console.warn('[memory] summary generation failed:', err.message);
    }
  }
}

// -- Fact extraction ---------------------------------------------

async function extractFacts(pool, conversationId, companionId, userId) {
  // Get last_extracted_message_id to only process NEW messages
  const { rows: convRows } = await pool.query(
    'SELECT last_extracted_message_id FROM conversations WHERE id = $1',
    [conversationId]
  );
  const lastExtractedId = convRows[0]?.last_extracted_message_id;

  // Load user messages since last extraction (skip assistant fluff)
  let messages;
  if (lastExtractedId) {
    const { rows } = await pool.query(
      `SELECT id, content FROM messages
       WHERE conversation_id = $1 AND role = 'user'
       AND created_at > (SELECT created_at FROM messages WHERE id = $2)
       ORDER BY created_at ASC LIMIT 50`,
      [conversationId, lastExtractedId]
    );
    messages = rows;
  } else {
    const { rows } = await pool.query(
      `SELECT id, content FROM messages
       WHERE conversation_id = $1 AND role = 'user'
       ORDER BY created_at ASC LIMIT 50`,
      [conversationId]
    );
    messages = rows;
  }

  if (messages.length === 0) return;

  // Update last_extracted_message_id to the latest message in conversation
  const { rows: latestMsg } = await pool.query(
    `SELECT id FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [conversationId]
  );
  if (latestMsg[0]) {
    await pool.query(
      'UPDATE conversations SET last_extracted_message_id = $1 WHERE id = $2',
      [latestMsg[0].id, conversationId]
    );
  }

  // Process in small chunks so the model focuses on each batch and misses nothing
  // Cap at 3 chunks max to avoid timeouts (15 user messages per extraction cycle)
  const chunks = [];
  for (let i = 0; i < messages.length; i += EXTRACTION_CHUNK_SIZE) {
    chunks.push(messages.slice(i, i + EXTRACTION_CHUNK_SIZE));
  }
  const chunksToProcess = chunks.slice(0, 3);

  // Run chunks in parallel for speed
  const results = await Promise.allSettled(
    chunksToProcess.map(chunk => extractFactsFromChunk(pool, conversationId, companionId, userId, chunk))
  );
  let totalExtracted = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') totalExtracted += r.value;
  }

  if (totalExtracted > 0) {
    console.log(`[memory] extracted ${totalExtracted} facts (${chunks.length} chunks) for conversation ${conversationId}`);
  }
}

async function extractFactsFromChunk(pool, conversationId, companionId, userId, messages) {
  // Load existing facts (refresh each chunk so dedup stays current)
  const { rows: existingFacts } = await pool.query(
    'SELECT category, fact FROM companion_memories WHERE conversation_id = $1',
    [conversationId]
  );

  const existingText = existingFacts.length > 0
    ? `\nAlready known facts (do NOT repeat these — only extract NEW facts not in this list):\n${existingFacts.map(f => `- [${f.category}] ${f.fact}`).join('\n')}`
    : '';

  const cleanMsg = (text) => text.replace(/\*[^*]+\*/g, '').replace(/^["']|["']$/g, '').trim();
  const messagesText = messages.map(m => `- ${cleanMsg(m.content)}`).join('\n');

  const systemPrompt = `You are a data extraction assistant. Extract ALL personal facts about the user from the messages below. Be thorough — every detail matters.

OUTPUT: Raw JSON array only. No explanation.

CATEGORIES: identity (name, age, birthday, zodiac, nationality, location, gender), preferences (food, music, movies, hobbies, colors, seasons, books, shows), life (job, education, pets, family, friends, living situation, habits, health, sports, skills), relationship, emotional (mood, dreams, goals, worries)

RULES:
- One fact per detail. If a message contains 3 details, output 3 facts.
- Each fact = short sentence starting with "User"
- Extract: names, numbers, places, dates, habits, allergies, routines, plans, relationships
- Do NOT skip minor details — "drinks 4 cups of coffee" is a fact, "runs 5 miles" is a fact
- If no NEW facts, return: []
${existingText}`;

  const { plainChatCompletion } = require('./ai');
  const result = await plainChatCompletion(systemPrompt, [
    { role: 'user', content: `USER MESSAGES:\n${messagesText}` },
  ]);

  if (!result || !result.content) return 0;

  let factsJson;
  try {
    let text = result.content.trim();
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) text = fenceMatch[1].trim();
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) text = arrayMatch[0];
    factsJson = JSON.parse(text);
  } catch {
    console.warn('[memory] failed to parse facts JSON:', result.content.slice(0, 200));
    return 0;
  }

  if (!Array.isArray(factsJson) || factsJson.length === 0) return 0;

  await trackConsumption({
    userId,
    companionId,
    provider: 'openrouter',
    model: 'memory',
    callType: 'memory',
    inputTokens: result.inputTokens || 0,
    outputTokens: result.outputTokens || 0,
    costUsd: result.costUsd || 0,
    metadata: { type: 'fact_extraction', factsCount: factsJson.length },
  });

  const lastMessageId = messages[messages.length - 1]?.id;
  const VALID_CATEGORIES = new Set(['identity', 'preferences', 'life', 'relationship', 'emotional']);
  let saved = 0;

  for (const item of factsJson.slice(0, 15)) {
    if (!item.category || !item.fact) continue;
    const category = String(item.category).toLowerCase().trim();
    const fact = String(item.fact).trim();
    if (!VALID_CATEGORIES.has(category)) continue;
    if (!fact || fact.length > 500) continue;

    const { rows: existing } = await pool.query(
      `SELECT id, fact FROM companion_memories
       WHERE conversation_id = $1 AND category = $2`,
      [conversationId, category]
    );

    const keyPhrase = fact.split(/\s+(is|are|has|likes|works|prefers|lives|named|plays|loves|drinks|studies|wants|moved|used|born|enjoys|runs|wakes|reads|cooks|watches)\s+/i)[0]?.toLowerCase();
    const match = existing.find(e => {
      const eKey = e.fact.split(/\s+(is|are|has|likes|works|prefers|lives|named|plays|loves|drinks|studies|wants|moved|used|born|enjoys|runs|wakes|reads|cooks|watches)\s+/i)[0]?.toLowerCase();
      return eKey && keyPhrase && eKey === keyPhrase;
    });

    if (match) {
      await pool.query(
        `UPDATE companion_memories SET fact = $1, updated_at = NOW(), source_message_id = $2 WHERE id = $3`,
        [fact, lastMessageId, match.id]
      );
    } else {
      if (existing.length >= 8) {
        await pool.query(
          `DELETE FROM companion_memories WHERE id = (
            SELECT id FROM companion_memories
            WHERE conversation_id = $1 AND category = $2
            ORDER BY updated_at ASC LIMIT 1
          )`,
          [conversationId, category]
        );
      }
      await pool.query(
        `INSERT INTO companion_memories (conversation_id, category, fact, source_message_id)
         VALUES ($1, $2, $3, $4)`,
        [conversationId, category, fact, lastMessageId]
      );
      saved++;
    }
  }

  return saved;
}

// -- Summary generation ------------------------------------------

async function generateSummary(pool, conversationId, companionId, userId) {
  // Find where last summary ended
  const { rows: lastSummary } = await pool.query(
    `SELECT message_range_end FROM conversation_summaries
     WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [conversationId]
  );

  let messagesQuery;
  let params;

  if (lastSummary.length > 0) {
    // Get messages after last summary
    messagesQuery = `SELECT id, role, content FROM messages
      WHERE conversation_id = $1 AND created_at > (SELECT created_at FROM messages WHERE id = $2)
      ORDER BY created_at ASC LIMIT 30`;
    params = [conversationId, lastSummary[0].message_range_end];
  } else {
    // First summary — skip the very first assistant message (template greeting noise)
    messagesQuery = `SELECT id, role, content FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC LIMIT 30 OFFSET 1`;
    params = [conversationId];
  }

  const { rows: messages } = await pool.query(messagesQuery, params);
  if (messages.length < 5) return; // not enough to summarize

  // Strip roleplay formatting (*actions*, quotes) to reduce model's urge to roleplay
  const cleanMsg = (text) => text.replace(/\*[^*]+\*/g, '').replace(/^["']|["']$/g, '').trim();
  const messagesText = messages.map(m => `${m.role}: ${cleanMsg(m.content)}`).join('\n');

  const systemPrompt = `TASK: Write a 2-3 sentence summary of the conversation below. Focus on what the USER shared about themselves and key topics discussed.
RULES: Use third person ("The user", "the companion"). No roleplay. No quotes. No asterisks. Just plain factual sentences. Focus on USER's personal details and topics, not the companion's reactions.
FORMAT: Return ONLY the summary text, nothing else.`;

  const { plainChatCompletion } = require('./ai');
  const result = await plainChatCompletion(systemPrompt, [
    { role: 'user', content: `CONVERSATION LOG:\n${messagesText}\n\nSUMMARY:` },
  ]);

  if (!result || !result.content) return;

  // Clean up the summary — strip any roleplay that leaked through, take first 2-3 sentences
  let summary = result.content
    .replace(/\*[^*]+\*/g, '')   // remove *actions*
    .replace(/^["']|["']$/g, '') // remove wrapping quotes
    .trim();
  // Take only first 3 sentences to keep it concise
  const sentences = summary.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 3) {
    summary = sentences.slice(0, 3).join('').trim();
  }
  if (summary.length < 10 || summary.length > 1500) return;

  // Track consumption
  await trackConsumption({
    userId,
    companionId,
    provider: 'openrouter',
    model: 'memory',
    callType: 'memory',
    inputTokens: result.inputTokens || 0,
    outputTokens: result.outputTokens || 0,
    costUsd: result.costUsd || 0,
    metadata: { type: 'summary', messageCount: messages.length },
  });

  await pool.query(
    `INSERT INTO conversation_summaries (conversation_id, summary, message_range_start, message_range_end, message_count)
     VALUES ($1, $2, $3, $4, $5)`,
    [conversationId, summary, messages[0].id, messages[messages.length - 1].id, messages.length]
  );

  console.log(`[memory] generated summary (${messages.length} msgs) for conversation ${conversationId}`);
}

// -- Helpers -----------------------------------------------------

function timeAgo(date) {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return 'just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

module.exports = {
  buildMemoryContext,
  processMemory,
};
