import express from 'express';
import OpenAI from 'openai';

const app = express();
const port = process.env.PORT || 3002;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(process.cwd()));

const REASONING_SYSTEM_PROMPT = `You are an expert CV tailoring assistant.

Your job here is ONLY to provide user-facing reasoning, not the final CV markdown.

Rules:
- Explain your tailoring approach in clear, concise language.
- If a job description is present, map job requirements to relevant items from master data.
- Explicitly mention which master-data points you prioritized and why.
- Mention any notable gaps or assumptions.
- Keep it practical, around 6-12 short lines.
- Do not output markdown CV content in this step.`;

const MARKDOWN_SYSTEM_PROMPT = `You are an expert CV and resume writing agent.

Scope:
- Generate, edit, tailor, and improve markdown resumes/CVs.
- Prioritize ATS-friendly language, measurable impact, and relevance.
- Keep markdown clean and structured.

Rules:
- Use master data context as authoritative background facts unless user overrides them.
- If user asks for edits, apply those edits directly.
- Keep valid existing content unless user requests replacement.
- Return ONLY JSON with keys:
  - markdown: string (full updated markdown)
  - css: string (updated stylesheet, unchanged if not editing styles)
- If no changes are needed, return the input markdown and css unchanged.`;

const PATCH_SYSTEM_PROMPT = `You are an expert CV editor. Produce one small patch at a time.

Rules:
- Propose only a single, small, focused patch per response.
- Patch must be scoped to the specific section the user asked about (e.g., Projects section only).
- Never delete or replace the entire CV when a targeted edit is requested.
- Use 2-5 lines of surrounding context in the patch so it can be applied precisely.
- Provide a short explanation of why this patch helps.
- Output JSON with:
  explanation: string
  markdown_patch: string
  css_patch: string
  done: boolean

Patch format:
- Always return a minimal unified diff with @@ hunks for markdown changes.
- If no markdown change for this patch, return an empty string.
- If patching CSS, return a minimal unified diff, else empty string.
- When no more changes are needed, set done=true and patches empty.

Use the user's request and master data to decide the next patch.`;

function buildSharedContext({ message, markdown, css, html, history, masterData }) {
  return [
    'Master data context:',
    masterData && masterData.trim() ? masterData : '(none provided)',
    '',
    'Current markdown document:',
    markdown && markdown.trim() ? markdown : '(empty)',
    '',
    'Current HTML output:',
    html && html.trim() ? html : '(empty)',
    '',
    'Current CSS stylesheet:',
    css && css.trim() ? css : '(empty)',
    '',
    'Recent chat history (oldest to newest):',
    history && history.length ? JSON.stringify(history, null, 2) : '(none)',
    '',
    'Latest user request:',
    message,
  ].join('\n');
}

function sendSseEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

app.post('/api/chat/stream', async (req, res) => {
  const { apiKey, message, markdown, css, html, history, masterData, model } = req.body || {};

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'Missing API key.' });
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing user message.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  try {
    const client = new OpenAI({ apiKey });
    const safeModel = model || 'gpt-4.1-mini';
    const context = buildSharedContext({
      message,
      markdown: typeof markdown === 'string' ? markdown : '',
      css: typeof css === 'string' ? css : '',
      html: typeof html === 'string' ? html : '',
      history: Array.isArray(history) ? history.slice(-12) : [],
      masterData: typeof masterData === 'string' ? masterData : '',
    });

    let assistantMessage = '';

    const reasoningStream = await client.chat.completions.create({
      model: safeModel,
      stream: true,
      temperature: 0.4,
      messages: [
        { role: 'system', content: REASONING_SYSTEM_PROMPT },
        { role: 'user', content: context },
      ],
    });

    for await (const chunk of reasoningStream) {
      const delta = chunk?.choices?.[0]?.delta?.content || '';
      if (delta) {
        assistantMessage += delta;
        sendSseEvent(res, 'token', { token: delta });
      }
    }

    const markdownResponse = await client.responses.create({
      model: safeModel,
      instructions: MARKDOWN_SYSTEM_PROMPT,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: context }],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'cv_markdown_and_css',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              markdown: { type: 'string' },
              css: { type: 'string' },
            },
            required: ['markdown', 'css'],
          },
        },
      },
    });

    const raw = markdownResponse.output_text || '{}';
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      sendSseEvent(res, 'error', { error: 'Model returned invalid markdown JSON.' });
      return res.end();
    }

    if (typeof parsed.markdown !== 'string' || typeof parsed.css !== 'string') {
      sendSseEvent(res, 'error', { error: 'Model response missing markdown or css.' });
      return res.end();
    }

    sendSseEvent(res, 'done', {
      assistantMessage: assistantMessage.trim() || 'I prepared an update for your CV.',
      markdown: parsed.markdown,
      css: parsed.css,
    });

    return res.end();
  } catch (error) {
    sendSseEvent(res, 'error', {
      error: error?.error?.message || error?.message || 'Unknown server error',
    });
    return res.end();
  }
});

app.post('/api/chat/patch', async (req, res) => {
  const { apiKey, message, markdown, css, html, history, masterData, model } = req.body || {};

  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'Missing API key.' });
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing user message.' });
  }

  try {
    const client = new OpenAI({ apiKey });
    const safeModel = model || 'gpt-4.1-mini';
    const context = buildSharedContext({
      message,
      markdown: typeof markdown === 'string' ? markdown : '',
      css: typeof css === 'string' ? css : '',
      html: typeof html === 'string' ? html : '',
      history: Array.isArray(history) ? history.slice(-12) : [],
      masterData: typeof masterData === 'string' ? masterData : '',
    });

    const patchResponse = await client.responses.create({
      model: safeModel,
      instructions: PATCH_SYSTEM_PROMPT,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: context }],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'cv_patch_step',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              explanation: { type: 'string' },
              markdown_patch: { type: 'string' },
              css_patch: { type: 'string' },
              done: { type: 'boolean' },
            },
            required: ['explanation', 'markdown_patch', 'css_patch', 'done'],
          },
        },
      },
    });

    const raw = patchResponse.output_text || '{}';
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'Model returned invalid patch JSON.' });
    }

    return res.json(parsed);
  } catch (error) {
    const status = error?.status || 500;
    const message = error?.error?.message || error?.message || 'Unknown server error';
    return res.status(status).json({ error: message });
  }
});

app.listen(port, () => {
  console.log(`CV Markdown Studio running on http://localhost:${port}`);
});

