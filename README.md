# CV Markdown Studio

Three-column markdown CV editor with OpenAI-powered chat generation/editing, streamed rationale output, git-style diff review, master-data context, and PDF export.

## Run

1. Install dependencies:

```bash
npm install
```

2. Start server:

```bash
npm start
```

3. Open:

[http://localhost:3002](http://localhost:3002)

## API Key Behavior

- Enter your OpenAI API key in the app and click **Save Key**.
- The key is stored only in browser localStorage.
- On each chat request, the key is sent to the backend route `/api/chat/stream` and used for that call.
- The backend does not persist your key.

## Master Data Context

- Paste your reusable candidate data into **Master Data Context**.
- Click **Save Context** to store it in localStorage.
- This context is sent with each AI request and used as persistent background for CV generation and edits.

## Streamed Rationale

- The assistant now streams tokens in chat while analyzing your request.
- For job-description tailoring, it explains the reasoning and which master-data points were prioritized.
- After streaming completes, markdown changes are proposed for review.

## Diff Review

- AI-proposed markdown updates are shown as a git-style diff.
- Use **Accept** to apply or **Reject** to keep the current markdown unchanged.

## Notes

- Frontend libraries (`marked`, `html2pdf.js`) are loaded via CDN.
- Default model in backend is `gpt-4.1-mini`.
