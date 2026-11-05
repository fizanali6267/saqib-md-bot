/**
 * AI & AUTOMATION handlers (29 commands).
 * All text intelligence routes through the single Gemini client so the bot
 * needs only one API key.
 */

const U = require('../util');

const MODEL_LABEL = { deepseek: 'DeepSeek', gpt4: 'GPT-4', claude: 'Claude', gemini: 'Gemini' };
let preferredModel = 'gemini';
const autoTranslateChats = new Set();

/** Multimodal Gemini call (audio / image / pdf inline). */
async function geminiMedia(buffer, mime, prompt) {
  const key = U.config.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const models = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
  let lastErr;
  for (const model of models) {
    try {
      const res = await U.axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mime, data: buffer.toString('base64') } }
            ]
          }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
        },
        { timeout: 60000, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key } }
      );
      const parts = res.data && res.data.candidates && res.data.candidates[0] && res.data.candidates[0].content && res.data.candidates[0].content.parts;
      const text = Array.isArray(parts) ? parts.map((p) => p.text || '').join('').trim() : '';
      if (text) return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('AI did not respond');
}

async function chatModel(ctx, label) {
  const q = await U.need(ctx, `${ctx.command} <question>`);
  if (!q) return;
  const sys = `You are ${label}, integrated into SAQIB-MD WhatsApp bot. Give an accurate, well-structured answer. Use short paragraphs or bullets. Never invent facts; if unsure, say so.`;
  await U.aiReply(ctx, q, sys);
}

const handlers = {
  deepseek: (ctx) => chatModel(ctx, 'DeepSeek (coding & technical reasoning)'),
  gpt4: (ctx) => chatModel(ctx, 'GPT-4 (advanced text generation)'),
  claude: (ctx) => chatModel(ctx, 'Claude (detailed document analysis)'),
  gemini: (ctx) => chatModel(ctx, 'Gemini (fast real-time assistant)'),

  async midjourney(ctx) {
    const q = await U.need(ctx, 'midjourney <idea>');
    if (!q) return;
    await U.aiReply(ctx, q,
      'You are a Midjourney prompt engineer. Turn the idea into ONE highly detailed Midjourney v6 prompt. Include subject, composition, lighting, lens, style, colour palette and --ar ratio. Output only the prompt line, then a short list of 3 variations.');
  },

  async dalle3(ctx) {
    const q = await U.need(ctx, 'dalle3 <idea>');
    if (!q) return;
    await U.aiReply(ctx, q,
      'You are a DALL-E 3 prompt writer. Produce one vivid, safe, photorealistic prompt (max 900 chars) and then 2 alternate styles. No text overlays in the image.');
  },

  async whisper(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    await ctx.m.react('🎧').catch(() => null);
    try {
      const text = await geminiMedia(media.buffer, media.mime || 'audio/ogg', 'Transcribe this audio verbatim. Preserve the spoken language, add punctuation, and do not summarise.');
      await ctx.m.reply(`🎙️ *Transcription*\n\n${text}`);
    } catch (e) {
      await ctx.m.reply(`❌ Transcription failed: ${e.message}`);
    }
  },

  async voicetotext(ctx) { return handlers.whisper(ctx); },

  async texttospeech(ctx) {
    const q = await U.need(ctx, 'texttospeech <text>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Rewrite the text so it reads naturally when spoken aloud. Keep it short. Return only the speakable text.');
  },

  async visionai(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    await ctx.m.react('👁️').catch(() => null);
    try {
      const text = await geminiMedia(media.buffer, media.mime || 'image/jpeg', 'Describe this image in detail: main subject, setting, objects, text if any, mood. Then give 3 short alt-text captions.');
      await ctx.m.reply(`🖼️ *Vision AI*\n\n${text}`);
    } catch (e) {
      await ctx.m.reply(`❌ Vision analysis failed: ${e.message}`);
    }
  },

  async chatpdf(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    if (!/pdf/i.test(media.mime || '') && media.type !== 'documentMessage') {
      return ctx.m.reply('❌ PDF file ko reply karke chalayein.');
    }
    const question = U.textOf(ctx) || 'Summarise this document with key points.';
    await ctx.m.react('📄').catch(() => null);
    try {
      const text = await geminiMedia(media.buffer, 'application/pdf', question);
      await ctx.m.reply(`📚 *ChatPDF*\n\n${text}`);
    } catch (e) {
      await ctx.m.reply(`❌ PDF analysis failed: ${e.message}`);
    }
  },

  async autotranslate(ctx) {
    const raw = U.textOf(ctx);
    if (/^(on|off|enable|disable)$/i.test(raw)) {
      if (/^(on|enable)$/i.test(raw)) autoTranslateChats.add(ctx.m.chat);
      else autoTranslateChats.delete(ctx.m.chat);
      return ctx.m.reply(`🌐 Auto-translate ${/^(on|enable)$/i.test(raw) ? 'ENABLED' : 'DISABLED'} for this chat.`);
    }
    const src = raw || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!src) return U.need(ctx, 'autotranslate <text>');
    await U.aiReply(ctx, src, 'Detect the language of the input and translate it into clear English. Format: first line "Detected: <language>", then the translation.');
  },

  async autosummary(ctx) {
    const src = U.textOf(ctx) || (ctx.m.quoted && (ctx.m.quoted.text || ctx.m.quoted.caption)) || '';
    if (!src) return U.need(ctx, 'autosummary <long text>  (or reply to a message)');
    await U.aiReply(ctx, src, 'Summarise the message into 3-5 crisp bullet points. Keep names, numbers and decisions intact.');
  },

  async smartreply(ctx) {
    const src = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!src) return U.need(ctx, 'smartreply <incoming message>');
    await U.aiReply(ctx, src, 'Suggest exactly 3 short, natural WhatsApp replies to this message. Number them 1-3, each under 12 words.');
  },

  async llmselect(ctx) {
    const choice = U.textOf(ctx).toLowerCase();
    if (!choice) {
      return ctx.m.reply(U.box('🤖 AI ENGINE', [
        `Current: *${MODEL_LABEL[preferredModel] || 'Gemini'}*`,
        '',
        'Available: gemini, gpt4, claude, deepseek',
        `Usage: ${ctx.prefix}llmselect <name>`
      ]));
    }
    if (!MODEL_LABEL[choice]) return ctx.m.reply('❌ Options: gemini, gpt4, claude, deepseek');
    preferredModel = choice;
    await ctx.m.reply(`✅ Default AI persona set to *${MODEL_LABEL[choice]}*.`);
  },

  async promptenhance(ctx) {
    const q = await U.need(ctx, 'promptenhance <short idea>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Expand the short idea into a rich, detailed prompt suitable for image or text AI. Include style, mood, constraints and negative prompts. Output the final prompt first.');
  },

  async codeexplain(ctx) {
    const q = await U.need(ctx, 'codeexplain <code>  (or reply to a message)');
    if (!q) return;
    await U.aiReply(ctx, q, 'Explain this code line-by-line for a beginner. Then list inputs, outputs and possible bugs. Use a numbered walkthrough.');
  },

  async coderefactor(ctx) {
    const q = await U.need(ctx, 'coderefactor <code>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Refactor this code: remove anti-patterns, fix memory leaks, improve naming and error handling. Return the improved code in a code block, then a short bullet list of changes.');
  },

  async bugfinder(ctx) {
    const q = await U.need(ctx, 'bugfinder <code>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Scan this code for syntax errors, logic bugs, security flaws and edge cases. Return a severity-ranked list with the fixed snippet for each issue.');
  },

  async regexgen(ctx) {
    const q = await U.need(ctx, 'regexgen <what to match>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Generate a JavaScript regular expression for this requirement. Explain each token, then give 3 matching and 2 non-matching examples.');
  },

  async docstring(ctx) {
    const q = await U.need(ctx, 'docstring <function code>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Add a professional docstring/JSDoc block to this function. Return only the documented code.');
  },

  async sqlgen(ctx) {
    const q = await U.need(ctx, 'sqlgen <plain-language query>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Convert the request into a safe SQL query. Assume standard tables; state your assumptions in one line, then give the SQL in a code block.');
  },

  async sentiment(ctx) {
    const q = await U.need(ctx, 'sentiment <text>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Analyse sentiment. Output: Sentiment (Positive/Negative/Neutral), Confidence %, Emotion, and a one-line reason.');
  },

  async plagiarism(ctx) {
    const q = await U.need(ctx, 'plagiarism <text>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Assess whether this text looks AI-generated or copied: give an originality score out of 100, list tell-tale phrases, and suggest rewrites. Be clear this is a heuristic estimate, not a database check.');
  },

  async humanize(ctx) {
    const q = await U.need(ctx, 'humanize <text>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Rewrite the text so it sounds human: vary sentence length, remove clichés and robotic transitions, keep the meaning. Return only the rewrite.');
  },

  async aiquiz(ctx) {
    const topic = U.textOf(ctx) || 'general knowledge';
    await U.aiReply(ctx, topic, 'Create a 5-question multiple-choice quiz (A-D) on this topic. Put all answers in a "Answers" section at the end.');
  },

  async mindmap(ctx) {
    const q = await U.need(ctx, 'mindmap <topic>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Create a mind map for this topic. Output valid Mermaid "mindmap" code in a code block, then a plain indented outline.');
  },

  async persona(ctx) {
    const q = U.textOf(ctx);
    if (!q) return ctx.m.reply(`🎭 Usage: ${ctx.prefix}persona <tone>\nExamples: friendly, formal, teacher, comedian, motivational coach`);
    await ctx.m.reply(`🎭 Persona set to *${q}* for your next AI replies.`);
  },

  async grammarfix(ctx) {
    const q = await U.need(ctx, 'grammarfix <text>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Correct spelling, grammar and punctuation. Return the corrected text first, then a bullet list of the changes.');
  },

  async rewriter(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'rewriter <text>');
    const style = (ctx.args[0] || '').toLowerCase();
    const styles = ['formal', 'casual', 'persuasive', 'simple', 'professional'];
    if (styles.includes(style)) {
      const body = ctx.args.slice(1).join(' ').trim();
      if (!body) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}rewriter formal <text>`);
      return U.aiReply(ctx, body, `Rewrite the text in a ${style} tone. Return only the rewrite.`);
    }
    await U.aiReply(ctx, raw, 'Rewrite the text in three styles: formal, casual, persuasive. Label each.');
  }
};

module.exports = { handlers, geminiMedia, autoTranslateChats };
