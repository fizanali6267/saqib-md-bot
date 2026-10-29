const axios = require('axios');
const config = require('../config');

/**
 * SAQIB-MD — Central Gemini AI Client
 * -----------------------------------
 * Ye poore bot ka EK hi AI entry point hai. OpenAI ki zaroorat nahi:
 * har jagah (gpt / ai / gemini / chatbot / summarize / code ...) sirf
 * GEMINI_API_KEY use hoti hai.
 *
 * Features:
 *  - Model fallback chain: agar ek model quota/404 de de to agla try hota hai.
 *  - Retry with backoff on 429 / 5xx / network errors.
 *  - 25s timeout so a slow request never hangs the message loop.
 *  - Optional systemInstruction (Gemini ka native system prompt field).
 */

// Verified against the live key (ListModels + generateContent probe).
// NOTE: gemini-1.5-flash / 2.0-flash / 2.5-flash are RETIRED for new keys
// (Google returns 404). Keep only models that actually answer.
// Order matters: fastest + most available first, then newest, then aliases.
const MODEL_CHAIN = [
  'gemini-3.5-flash',        // verified working, low latency
  'gemini-3.8-flash',        // newest; may return 503 during demand spikes
  'gemini-flash-latest',     // auto-updating alias
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite'    // lite fallback when the big ones are saturated
];

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getApiKey() {
  // GEMINI_API_KEY primary. Agar kisi purane deployment par key
  // OPENAI_API_KEY naam se padi ho to usay bhi accept kar lete hain,
  // taake migration ke waqt bot na toote.
  return config.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '';
}

function isKeyConfigured() {
  return Boolean(getApiKey());
}

/**
 * Ek single model par request bhejta hai.
 * @returns {Promise<string|null>} text ya null
 */
async function callModel(model, prompt, systemPrompt, timeoutMs) {
  const key = getApiKey();
  if (!key) return null;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: 2048
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await axios.post(
    `${API_ROOT}/${model}:generateContent`,
    body,
    {
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      }
    }
  );

  const parts = res.data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;

  const text = parts.map((p) => p?.text || '').join('').trim();
  return text || null;
}

/**
 * Main entry point. Har AI command isi ko call kare.
 *
 * @param {string} prompt        User ka sawal / input
 * @param {object} [opts]
 * @param {string} [opts.systemPrompt]  Persona / instructions
 * @param {number} [opts.timeoutMs=25000]
 * @param {number} [opts.retries=1]     Per-model retry on 429/5xx
 * @returns {Promise<string|null>}
 */
async function askGemini(prompt, opts = {}) {
  const { systemPrompt = '', timeoutMs = 25000, retries = 2 } = opts;

  if (!prompt || !String(prompt).trim()) return null;
  if (!isKeyConfigured()) return null;

  const cleanPrompt = String(prompt).trim();
  let lastError = null;

  for (const model of MODEL_CHAIN) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const text = await callModel(model, cleanPrompt, systemPrompt, timeoutMs);
        if (text) return text;
        break; // model ne jawab diya lekin khaali — agla model try karo
      } catch (err) {
        lastError = err;
        const status = err?.response?.status;

        // 404 / 400 = model is key ke liye available nahi -> agla model
        if (status === 404 || status === 400) break;

        // 429 (quota) ya 5xx -> thora ruk kar retry
        if ((status === 429 || (status >= 500 && status < 600)) && attempt < retries) {
          await sleep(700 * (attempt + 1));
          continue;
        }

        // 401 / 403 = key invalid -> poora chain chhorna bekaar hai
        if (status === 401 || status === 403) {
          throw new Error('GEMINI_KEY_INVALID');
        }

        break; // koi aur error -> agla model
      }
    }
  }

  if (lastError && process.env.DEBUG_AI === 'true') {
    console.error('[gemini] all models failed:', lastError?.message || lastError);
  }
  return null;
}

// Image models (Nano Banana family). Free-tier quota is often 0, so this is
// best-effort: callers must always have a non-Gemini fallback.
const IMAGE_MODEL_CHAIN = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image'
];

/**
 * Generates an image and returns a Buffer, or null if unavailable.
 * @param {string} prompt
 * @returns {Promise<Buffer|null>}
 */
async function askGeminiImage(prompt, opts = {}) {
  const { timeoutMs = 45000 } = opts;
  const key = getApiKey();
  if (!key || !prompt || !String(prompt).trim()) return null;

  for (const model of IMAGE_MODEL_CHAIN) {
    try {
      const res = await axios.post(
        `${API_ROOT}/${model}:generateContent`,
        { contents: [{ role: 'user', parts: [{ text: String(prompt).trim() }] }] },
        {
          timeout: timeoutMs,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }
        }
      );

      const parts = res.data?.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts)) continue;

      for (const p of parts) {
        const data = p?.inlineData?.data || p?.inline_data?.data;
        if (data) return Buffer.from(data, 'base64');
      }
    } catch (err) {
      const status = err?.response?.status;
      // 429 = quota exhausted -> stop trying image models entirely
      if (status === 429 || status === 401 || status === 403) return null;
      // 404/400/503 -> try next image model
    }
  }
  return null;
}

module.exports = {
  askGemini,
  askGeminiImage,
  isKeyConfigured,
  MODEL_CHAIN,
  IMAGE_MODEL_CHAIN
};
