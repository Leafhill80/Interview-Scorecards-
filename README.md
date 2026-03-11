# Interview Scorecard

A technical interview scoring tool for hiring managers. Scores candidates across 14 weighted competencies grouped into three sections, and pushes results directly to a Notion candidate database.

---

## Stack

- React 18 + Vite
- Notion API (called directly from the browser)
- localStorage for credential storage (never committed to code)

---

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

---

## Notion Setup

### 1. Create a Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click **New integration**
3. Name it (e.g. "Interview Scorecard"), select your workspace
4. Copy the **Internal Integration Secret**

### 2. Set up your Candidate Database

Create a Notion database with these exact property names and types:

| Property Name   | Type   |
|----------------|--------|
| Candidate Name  | Title  |
| Role            | Text   |
| Interviewer     | Text   |
| Interview Date  | Date   |
| Overall Score   | Number |
| Verdict         | Select |
| Submitted At    | Date   |

For **Verdict**, add these select options (match exactly):
- Strong Yes
- Soft Yes
- Maybe
- Soft No
- Strong No
- Incomplete

### 3. Connect the Integration to your Database

1. Open your Notion database
2. Click **···** (top right) → **Connections** → find your integration → **Confirm**

### 4. Get your Database ID

From your database URL:
```
https://notion.so/your-workspace/THIS-IS-YOUR-DATABASE-ID?v=...
```
Copy the 32-character string before the `?v=`.

### 5. Add credentials to the app

Click **⚙ Notion Setup** in the app header and paste your Integration Secret and Database ID. These are saved to localStorage in your browser only — they are never in the code.

---

## Deploying (optional — for shared team access)

The simplest approach is GitHub Pages or any static host. Since the Notion API call is made from the browser, no backend is needed.

```bash
npm run build
# deploy the dist/ folder to your host of choice
```

> **Note:** If you deploy this for shared team use, each user enters their own Notion credentials in the Settings panel, or you can pre-configure a shared read-only integration.

---

## Verdict Thresholds

| Score | Verdict     |
|-------|------------|
| 85%+  | Strong Yes |
| 70–84%| Soft Yes   |
| 55–69%| Maybe      |
| 40–54%| Soft No    |
| 0–39% | Strong No  |

---

## Data & Privacy

- Candidate data is sensitive. Only share summaries with authorised members of the hiring panel.
- Notion credentials are stored in `localStorage` — they do not leave the browser except in direct API calls to Notion.
- Do not commit credentials to this repository. The `.gitignore` excludes `.env` files.
- Retain candidate records only as long as required by your data retention policy.
