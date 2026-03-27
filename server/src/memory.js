/**
 * Multi-level companion memory system.
 *
 * Level 1: Recent messages (last 10) — handled in chat-api.js
 * Level 2: Conversation summaries — generated every ~20 messages
 * Level 3: Long-term facts — extracted every ~3 messages (AI + regex)
 *
 * Memory processing runs fire-and-forget after each assistant message.
 */

const { getPool } = require('./db');
const { trackConsumption } = require('./consumption');

const EXTRACTION_THRESHOLD = 3;
const SUMMARY_THRESHOLD = 20;
const MAX_MEMORY_CHARS = 3000;
const EXTRACTION_CHUNK_SIZE = 10;
const MAX_FACTS = 30;

// -- Build memory context for system prompt ----------------------

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
  const summaries = summariesResult.rows.reverse();

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
      memoryPrompt += `[${timeAgo(s.created_at)}] ${s.summary}\n`;
    }
  }

  if (memoryPrompt.length > MAX_MEMORY_CHARS) {
    if (summaries.length > 1) {
      memoryPrompt = '';
      if (facts.length > 0) {
        memoryPrompt += '\nWHAT YOU REMEMBER ABOUT THE USER:\n';
        memoryPrompt += facts.map(f => `- ${f.fact}`).join('\n');
        memoryPrompt += '\n';
      }
      const last = summaries[summaries.length - 1];
      memoryPrompt += `\nRECENT CONVERSATION HISTORY:\n[${timeAgo(last.created_at)}] ${last.summary}\n`;
    }
    if (memoryPrompt.length > MAX_MEMORY_CHARS) {
      memoryPrompt = memoryPrompt.slice(0, MAX_MEMORY_CHARS);
    }
  }

  return memoryPrompt;
}

// -- Post-message memory processing (fire-and-forget) -----------

async function processMemory(pool, conversationId, companionId, userId) {
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

// -- Fact extraction (AI + regex hybrid) --------------------------

async function extractFacts(pool, conversationId, companionId, userId) {
  const { rows: compRows } = await pool.query(
    'SELECT name FROM user_companions WHERE id = $1', [companionId]
  );
  const companionName = compRows[0]?.name || 'the companion';

  const { rows: convRows } = await pool.query(
    'SELECT last_extracted_message_id FROM conversations WHERE id = $1',
    [conversationId]
  );
  const lastExtractedId = convRows[0]?.last_extracted_message_id;

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

  // Mark extraction point
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

  const lastMessageId = messages[messages.length - 1]?.id;

  // 1. AI extraction first (catches nuance, context, implicit facts)
  const chunks = [];
  for (let i = 0; i < messages.length; i += EXTRACTION_CHUNK_SIZE) {
    chunks.push(messages.slice(i, i + EXTRACTION_CHUNK_SIZE));
  }
  let totalExtracted = 0;
  for (const chunk of chunks.slice(0, 3)) {
    try {
      totalExtracted += await extractFactsFromChunkAI(pool, conversationId, companionId, userId, chunk, companionName);
    } catch (err) {
      console.warn('[memory] chunk extraction error:', err.message);
    }
  }

  // 2. Regex extraction LAST (deterministic, overwrites AI garbage with correct facts)
  const regexFacts = extractFactsWithRegex(messages, companionName);
  if (regexFacts.length > 0) {
    totalExtracted += await saveExtractedFacts(pool, conversationId, regexFacts, lastMessageId);
  }

  if (totalExtracted > 0) {
    console.log(`[memory] extracted ${totalExtracted} facts (regex + ${Math.min(chunks.length, 3)} AI chunks) for conversation ${conversationId}`);
  }
}

// -- Rule-based extraction (deterministic) ------------------------

function extractFactsWithRegex(messages, companionName) {
  const facts = [];
  const companionLower = (companionName || '').toLowerCase();

  for (const m of messages) {
    const text = m.content;

    // Name: "my name is X", "I'm X, nice to meet"
    const nameMatch = text.match(/(?:my name is|call me) ([A-Z][a-z]{1,15})\b/i)
      || text.match(/(?:I'?m |I am )([A-Z][a-z]{1,15}),?\s*(?:nice|pleased|good)/i);
    if (nameMatch && nameMatch[1].toLowerCase() !== companionLower) {
      facts.push({ category: 'identity', fact: `User's name is ${nameMatch[1]}` });
    }

    // Age
    const ageMatch = text.match(/(?:i'?m|i am) (\d{2}) (?:years old|yrs|yo)/i);
    if (ageMatch && parseInt(ageMatch[1]) >= 18 && parseInt(ageMatch[1]) <= 99) {
      facts.push({ category: 'identity', fact: `User is ${ageMatch[1]} years old` });
    }

    // Birthday
    const bdayMatch = text.match(/(?:birthday is|born on|birthday'?s?) ((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2})/i);
    if (bdayMatch) facts.push({ category: 'identity', fact: `User's birthday is ${bdayMatch[1]}` });

    // Location: "I live in X"
    const liveMatch = text.match(/i (?:live|moved) (?:in|to) ([A-Z][a-zA-Z ]{2,20}?)(?:\s+now)?[.,!? ]*$/im);
    if (liveMatch) facts.push({ category: 'identity', fact: `User lives in ${liveMatch[1].trim()}` });

    // From: "I'm from X"
    const fromMatch = text.match(/(?:i'?m|i am) (?:originally )?from ([A-Z][a-zA-Z ]{2,20}?)(?:[.,!? ]|$)/i);
    if (fromMatch) facts.push({ category: 'identity', fact: `User is from ${fromMatch[1].trim()}` });

    // Job: "I'm a software engineer"
    const jobMatch1 = text.match(/i'?m a(?:n)? ([a-z][a-z ]{3,30}?)(?:from|at|in|[.,!?]|$)/i);
    if (jobMatch1 && !/bit|fan|person|lover|capricorn|night owl|dog person/i.test(jobMatch1[1])) {
      facts.push({ category: 'life', fact: `User is a ${jobMatch1[1].trim()}` });
    }
    const workAtMatch = text.match(/i work (?:at|for) (?:a )?([a-z][a-z ]{2,25})/i);
    if (workAtMatch) facts.push({ category: 'life', fact: `User works at ${workAtMatch[1].trim()}` });

    // Pets: "I have a X named Y"
    const petMatch = text.match(/(?:i have|my|got) (?:a )?(\w+(?:\s\w+)?) (?:named|called) (\w+)/i);
    if (petMatch && petMatch[2].toLowerCase() !== companionLower) {
      facts.push({ category: 'life', fact: `User has a ${petMatch[1]} named ${petMatch[2]}` });
    }

    // Family: "my sister/brother/mom lives in X"
    const familyMatch = text.match(/my (sister|brother|mom|dad|mother|father) (?:.*?)(?:lives |still lives )(?:in )?([A-Z][a-zA-Z ]{2,20})/i);
    if (familyMatch) facts.push({ category: 'life', fact: `User's ${familyMatch[1]} lives in ${familyMatch[2].trim()}` });

    // Favorite: "my favorite X is Y"
    const favMatch = text.match(/my (?:fav(?:ou?rite)?) (\w+(?:\s\w+)?) is ([^.,!?]{2,40})/i);
    if (favMatch) facts.push({ category: 'preferences', fact: `User's favorite ${favMatch[1]} is ${favMatch[2].trim()}` });

    // Food: "I love sushi and Mexican food"
    const foodMatch = text.match(/i (?:love|really like) ([\w]+(?:\s+and\s+[\w]+)?) food/i);
    if (foodMatch) facts.push({ category: 'preferences', fact: `User loves ${foodMatch[1]} food` });
    // Also: "love sushi", "love Mexican"
    const foodMatch2 = text.match(/(?:love|like) (sushi|pizza|ramen|tacos|pasta|burgers?|steak|seafood)/i);
    if (foodMatch2) facts.push({ category: 'preferences', fact: `User loves ${foodMatch2[1]}` });

    // Music: "into jazz and indie rock"
    const musicMatch = text.match(/(?:into|like|love|enjoy) ((?:jazz|rock|pop|hip[- ]?hop|indie(?: rock)?|classical|country|metal|punk|r&b|electronic)(?:\s+and\s+(?:jazz|rock|pop|hip[- ]?hop|indie(?: rock)?|classical|country|metal|punk|r&b|electronic))?)/i);
    if (musicMatch) facts.push({ category: 'preferences', fact: `User likes ${musicMatch[1]}` });

    // Hobby: "playing guitar", "I play basketball"
    const playMatch = text.match(/(?:i (?:play|used to play)|been playing) (\w+(?:\s\w+)?)/i);
    if (playMatch && !/you|it|that/i.test(playMatch[1])) {
      facts.push({ category: 'preferences', fact: `User plays ${playMatch[1]}` });
    }

    // Allergic
    const allergyMatch = text.match(/allergic to (\w+)/i);
    if (allergyMatch) facts.push({ category: 'life', fact: `User is allergic to ${allergyMatch[1]}` });

    // Coffee/drinks: "X cups of coffee", "X cups a day"
    const drinkMatch = text.match(/(\d+) cups? (?:of )?(coffee|tea|cocoa)/i);
    if (drinkMatch) {
      facts.push({ category: 'preferences', fact: `User drinks ${drinkMatch[1]} cups of ${drinkMatch[2]} daily` });
    } else if (/cups?.*(?:coffee|tea)/i.test(text) || /(?:coffee|tea).*cups?/i.test(text)) {
      const numMatch = text.match(/(\d+)\s*cups?/i);
      const bevMatch = text.match(/(coffee|tea)/i);
      if (numMatch && bevMatch) facts.push({ category: 'preferences', fact: `User drinks ${numMatch[1]} cups of ${bevMatch[1]} daily` });
    }

    // Learning
    const learnMatch = text.match(/(?:started |been )?learning (\w+(?:\s\w+)?)/i);
    if (learnMatch) facts.push({ category: 'life', fact: `User is learning ${learnMatch[1]}` });

    // Friend: "friend Tom", "best friend X"
    const friendMatch = text.match(/(?:best )?friend (\b[A-Z][a-z]+)/);
    if (friendMatch) facts.push({ category: 'life', fact: `User's friend is named ${friendMatch[1]}` });

    // Night owl
    if (/night owl/i.test(text)) facts.push({ category: 'identity', fact: 'User is a night owl' });

    // Zodiac: "I'm a Capricorn", "I'm a Leo"
    const zodiacMatch = text.match(/i'?m (?:a |an )?(capricorn|aquarius|pisces|aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius)\b/i);
    if (zodiacMatch) facts.push({ category: 'identity', fact: `User is a ${zodiacMatch[1]}` });

    // Books: "finished reading X", "reading X"
    const bookMatch = text.match(/(?:reading|finished reading|just read) ([A-Z][\w\s]{1,30}?)(?:[.,!]|$)/);
    if (bookMatch) facts.push({ category: 'preferences', fact: `User read ${bookMatch[1].trim()}` });

    // Cooking: "my specialty is X", "I cook"
    const cookMatch = text.match(/(?:specialty|speciality) is (?:homemade )?(\w+(?:\s\w+)?)/i);
    if (cookMatch) facts.push({ category: 'preferences', fact: `User's cooking specialty is ${cookMatch[1]}` });

    // Dog breed: "getting a X", "maybe a X"
    const breedMatch = text.match(/getting (?:a )?(?:second )?(?:dog,? )?(?:maybe )?(?:a )?(golden retriever|labrador|poodle|bulldog|beagle|husky)/i);
    if (breedMatch) facts.push({ category: 'life', fact: `User wants to get a ${breedMatch[1]}` });
  }

  // Deduplicate
  const seen = new Set();
  return facts.filter(f => {
    const key = f.fact.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// -- AI-based chunk extraction ------------------------------------

async function extractFactsFromChunkAI(pool, conversationId, companionId, userId, messages, companionName) {
  const { rows: existingFacts } = await pool.query(
    'SELECT category, fact FROM companion_memories WHERE conversation_id = $1',
    [conversationId]
  );

  const existingText = existingFacts.length > 0
    ? `\nAlready known (do NOT repeat):\n${existingFacts.map(f => `- ${f.fact}`).join('\n')}`
    : '';

  const cleanMsg = (text) => text.replace(/\*[^*]+\*/g, '').replace(/^["']|["']$/g, '').trim();
  const messagesText = messages.map(m => `- ${cleanMsg(m.content)}`).join('\n');

  const systemPrompt = `Extract ONLY persistent personal facts about the USER (human) from messages below. "${companionName}" is the AI companion, NOT the user.
Return JSON array with "category" and "fact" keys.
Categories: identity, preferences, life

EXTRACT these types of facts:
- Name, age, birthday, location, nationality, zodiac sign
- Job, profession, education, skills, languages
- Pets (name + type), family members (name + relation + location)
- Hobbies, interests, favorite things (movies, music, food, sports, books, etc.)
- Allergies, dietary preferences, daily habits
- Dreams, goals, aspirations

DO NOT EXTRACT:
- What the user said, asked, agreed to, or requested in conversation
- Temporary emotions or moods ("user feels happy", "user is waiting")
- Anything about the relationship with ${companionName} ("user calls her love", "user wants intimacy")
- Sexual acts, preferences, or desires
- Conversation flow events ("user responded", "user expressed interest")

Example: [{"category":"identity","fact":"User's name is Alex"},{"category":"life","fact":"User has a cat named Whiskers"},{"category":"preferences","fact":"User's favorite movie is Inception"}]
Only extract facts explicitly stated. Do NOT infer or guess.
${existingText}`;

  const { plainChatCompletion, getAISettings } = require('./ai');
  const settings = await getAISettings();
  const extractionModel = settings.memory_extraction_model || 'qwen/qwen3-235b-a22b-2507';
  const result = await plainChatCompletion(systemPrompt, [
    { role: 'user', content: `Chat messages:\n${messagesText}` },
  ], { model: extractionModel });

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
    // Fallback: extract fact strings from malformed output
    const factStrings = result.content.match(/["']([^"']{5,200})["']/g);
    if (factStrings && factStrings.length > 0) {
      factsJson = factStrings.map(s => {
        const fact = s.replace(/^["']|["']$/g, '').trim();
        let category = 'life';
        if (/\b(name|age|birthday|born|zodiac|years old|nationality|from )\b/i.test(fact)) category = 'identity';
        else if (/\b(favorite|loves|likes|prefers|enjoys|hobby|food|music|movie|season|book)\b/i.test(fact)) category = 'preferences';
        else if (/\b(feel|mood|dream|hope|wish|worry|miss)\b/i.test(fact)) category = 'emotional';
        return { category, fact };
      });
    } else {
      console.warn('[memory] failed to parse facts JSON:', result.content.slice(0, 200));
      return 0;
    }
  }

  if (!Array.isArray(factsJson) || factsJson.length === 0) return 0;

  await trackConsumption({
    userId, companionId,
    provider: 'openrouter', model: 'memory', callType: 'memory',
    inputTokens: result.inputTokens || 0, outputTokens: result.outputTokens || 0,
    costUsd: result.costUsd || 0,
    metadata: { type: 'fact_extraction', factsCount: factsJson.length },
  });

  return saveExtractedFacts(pool, conversationId, factsJson.slice(0, 15), messages[messages.length - 1]?.id);
}

// -- Save facts to DB (shared by regex + AI) ----------------------

const VALID_CATEGORIES = new Set(['identity', 'preferences', 'life']);

// Reject junk facts that are conversation events, not persistent user attributes
function isJunkFact(fact) {
  if (fact.length < 10) return true;
  const lower = fact.toLowerCase();
  const junkPrefixes = [
    'user agrees', 'user expresses', 'user is waiting', 'user says',
    'user asked', 'user responded', 'user wants to', 'user is patient',
    'user refers to', 'user calls', 'user addresses', 'user expects',
    'user is engaged in', 'user is trying', 'user states that',
    'user is comfortable', 'user is defensive', 'user feels conflicted',
    'user believes', 'user questions', 'user no longer',
  ];
  if (junkPrefixes.some(p => lower.startsWith(p))) return true;
  // Reject facts about relationship dynamics with the AI
  if (/\b(intimate|intimacy|sexual|orgasm|arousal|lust|submission|worship|dominant)\b/i.test(fact)) return true;
  // Reject facts that are just "User's name is not mentioned"
  if (/not mentioned|not specified|not provided|not stated/i.test(fact)) return true;
  return false;
}

// Extract a dedup key from a fact: use the subject + topic words (not just "User")
// "User's name is Vasily" → "user's name"
// "User is a software engineer" → "user software engineer"
// "User's favorite movie is Interstellar" → "user's favorite movie"
function factKey(fact) {
  const lower = fact.toLowerCase();
  // Try "User's X is Y" pattern — key = "user's x"
  const possessiveMatch = lower.match(/^user'?s?\s+(\w+(?:\s+\w+)?)\s+(?:is|are)\b/);
  if (possessiveMatch) return `user's ${possessiveMatch[1]}`;
  // Try "User is a/an X" — key = first noun after article
  const isAMatch = lower.match(/^user\s+(?:is|are)\s+(?:a|an)\s+(.{3,30}?)(?:\s+(?:from|in|at|who|,|$))/);
  if (isAMatch) return `user is ${isAMatch[1].trim()}`;
  // Try "User verb X" — key = verb + first word
  const verbMatch = lower.match(/^user\s+(\w+(?:\s+\w+)?(?:\s+\w+)?)/);
  if (verbMatch) return verbMatch[1].trim();
  // Fallback: first 5 words
  return lower.split(/\s+/).slice(0, 5).join(' ');
}

async function saveExtractedFacts(pool, conversationId, factsJson, lastMessageId) {
  let saved = 0;

  for (const item of factsJson) {
    if (!item.category || !item.fact) continue;
    const category = String(item.category).toLowerCase().trim();
    const fact = String(item.fact).trim();
    if (!VALID_CATEGORIES.has(category)) continue;
    if (!fact || fact.length > 500) continue;
    if (isJunkFact(fact)) continue;

    const { rows: existing } = await pool.query(
      `SELECT id, fact FROM companion_memories WHERE conversation_id = $1 AND category = $2`,
      [conversationId, category]
    );

    const key = factKey(fact);
    const match = existing.find(e => factKey(e.fact) === key);

    if (match) {
      await pool.query(
        `UPDATE companion_memories SET fact = $1, updated_at = NOW(), source_message_id = $2 WHERE id = $3`,
        [fact, lastMessageId, match.id]
      );
    } else {
      const { rows: totalCount } = await pool.query(
        `SELECT COUNT(*) as cnt FROM companion_memories WHERE conversation_id = $1`,
        [conversationId]
      );
      if (parseInt(totalCount[0].cnt) >= MAX_FACTS) {
        await pool.query(
          `DELETE FROM companion_memories WHERE id = (
            SELECT id FROM companion_memories WHERE conversation_id = $1 ORDER BY updated_at ASC LIMIT 1
          )`, [conversationId]
        );
      }
      await pool.query(
        `INSERT INTO companion_memories (conversation_id, category, fact, source_message_id) VALUES ($1, $2, $3, $4)`,
        [conversationId, category, fact, lastMessageId]
      );
      saved++;
    }
  }
  return saved;
}

// -- Summary generation ------------------------------------------

async function generateSummary(pool, conversationId, companionId, userId) {
  const { rows: lastSummary } = await pool.query(
    `SELECT message_range_end FROM conversation_summaries
     WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [conversationId]
  );

  let messagesQuery, params;
  if (lastSummary.length > 0) {
    messagesQuery = `SELECT id, role, content FROM messages
      WHERE conversation_id = $1 AND created_at > (SELECT created_at FROM messages WHERE id = $2)
      ORDER BY created_at ASC LIMIT 30`;
    params = [conversationId, lastSummary[0].message_range_end];
  } else {
    messagesQuery = `SELECT id, role, content FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC LIMIT 30 OFFSET 1`;
    params = [conversationId];
  }

  const { rows: messages } = await pool.query(messagesQuery, params);
  if (messages.length < 5) return;

  const cleanMsg = (text) => text.replace(/\*[^*]+\*/g, '').replace(/^["']|["']$/g, '').trim();
  const messagesText = messages.map(m => `${m.role}: ${cleanMsg(m.content)}`).join('\n');

  const systemPrompt = `TASK: Write a 2-3 sentence summary of the conversation below. Focus on what the USER shared about themselves and key topics discussed.
RULES: Use third person ("The user", "the companion"). No roleplay. No quotes. No asterisks. Just plain factual sentences.
FORMAT: Return ONLY the summary text, nothing else.`;

  const { plainChatCompletion, getAISettings } = require('./ai');
  const settings = await getAISettings();
  const extractionModel = settings.memory_extraction_model || 'qwen/qwen3-235b-a22b-2507';
  const result = await plainChatCompletion(systemPrompt, [
    { role: 'user', content: `CONVERSATION LOG:\n${messagesText}\n\nSUMMARY:` },
  ], { model: extractionModel });

  if (!result || !result.content) return;

  let summary = result.content
    .replace(/\*[^*]+\*/g, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  const sentences = summary.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 3) {
    summary = sentences.slice(0, 3).join('').trim();
  }
  if (summary.length < 10 || summary.length > 1500) return;

  await trackConsumption({
    userId, companionId,
    provider: 'openrouter', model: 'memory', callType: 'memory',
    inputTokens: result.inputTokens || 0, outputTokens: result.outputTokens || 0,
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
