import { useState, useEffect } from "react";

// ─── Data ────────────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: "fit_for_role",
    label: "Fit for Role",
    color: "#2563EB",
    competencies: [
      { id: "tech_mastery",  label: "Technical Mastery (Tech Stack)",        weight: 5 },
      { id: "code_quality",  label: "Code Quality & Maintainability",         weight: 5 },
      { id: "system_design", label: "System Design & Scalability",            weight: 2 },
      { id: "problem_solving", label: "Problem Solving",                      weight: 4 },
      { id: "testing",       label: "Testing Strategy & Observability",       weight: 3 },
    ],
  },
  {
    id: "fit_for_company",
    label: "Fit for Company",
    color: "#7C3AED",
    competencies: [
      { id: "collaboration", label: "Collaboration & Cross-Functional Working",               weight: 3 },
      { id: "agility",       label: "Operational Agility (Speed, Adaptability, Experimentation)", weight: 5 },
      { id: "communication", label: "Communication Clarity",                                  weight: 3 },
      { id: "ownership",     label: "Ownership & Accountability",                             weight: 4 },
      { id: "commercial",    label: "Commercial Awareness",                                   weight: 2 },
    ],
  },
  {
    id: "fit_for_growth",
    label: "Fit for Growth",
    color: "#059669",
    competencies: [
      { id: "curiosity",  label: "Technological Curiosity", weight: 3 },
      { id: "ambiguity",  label: "Ambiguity Tolerance",     weight: 3 },
      { id: "strategic",  label: "Strategic Thinking",      weight: 1 },
      { id: "feedback",   label: "Feedback Tolerance",      weight: 3 },
    ],
  },
];

const SCORE_LABELS = {
  1: "Little/No Experience",
  2: "Limited Experience",
  3: "Moderate Experience",
  4: "Significant Experience",
  5: "Extensive Experience",
};

const WEIGHT_LABELS = {
  1: "Nice to have",
  2: "Useful",
  3: "Important",
  4: "Very Important",
  5: "Non-negotiable",
};

const ALL_COMPETENCIES = SECTIONS.flatMap((s) =>
  s.competencies.map((c) => ({ ...c, sectionLabel: s.label }))
);

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function calcScore(scores) {
  const filled  = ALL_COMPETENCIES.filter((c) => scores[c.id] != null);
  const totalMax = ALL_COMPETENCIES.reduce((a, c) => a + c.weight * 5, 0);
  const actual   = filled.reduce((a, c) => a + c.weight * scores[c.id], 0);
  const pct      = totalMax > 0 ? Math.round((actual / totalMax) * 100) : 0;
  return { filled: filled.length, total: ALL_COMPETENCIES.length, pct };
}

function getVerdict(pct, isComplete) {
  if (!isComplete) return null;
  if (pct >= 85) return { label: "Strong Yes ✦", color: "#059669", advice: "Consistently strong across high-weight competencies. Move to offer stage with confidence." };
  if (pct >= 70) return { label: "Soft Yes",      color: "#2563EB", advice: "Solid candidate with minor gaps. Confirm with the panel before progressing." };
  if (pct >= 55) return { label: "Maybe",         color: "#D97706", advice: "Requires a debrief — identify which weighted gaps are dealbreakers." };
  if (pct >= 40) return { label: "Soft No",       color: "#EA580C", advice: "Below bar in key areas. Document reasoning carefully before any exception." };
  return            { label: "Strong No",          color: "#DC2626", advice: "Significant gaps across weighted competencies. Do not progress." };
}

// ─── Notion API ───────────────────────────────────────────────────────────────

async function pushToNotion({ token, databaseId, candidate, role, interviewer, date, scores, notes }) {
  const { pct, filled, total } = calcScore(scores);
  const verdict = getVerdict(pct, filled === total);

  // Build competency details for the page body
  const competencyBlocks = SECTIONS.flatMap((section) => [
    {
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: section.label } }],
      },
    },
    ...section.competencies.map((c) => {
      const score = scores[c.id];
      const note  = notes[c.id];
      const scoreText = score ? `${score}/5 — ${SCORE_LABELS[score]}` : "Not scored";
      const lines = [`${c.label}  |  Weight: ${c.weight} (${WEIGHT_LABELS[c.weight]})  |  Score: ${scoreText}`];
      if (note && note.trim()) lines.push(`Notes: ${note.trim()}`);
      return {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: lines.join("\n") } }],
        },
      };
    }),
  ]);

  const body = {
    parent: { database_id: databaseId },
    properties: {
      // "Candidate Name" must be the Title property in your Notion DB
      "Candidate Name": {
        title: [{ text: { content: candidate || "Unnamed Candidate" } }],
      },
      "Role": {
        rich_text: [{ text: { content: role || "" } }],
      },
      "Interviewer": {
        rich_text: [{ text: { content: interviewer || "" } }],
      },
      "Interview Date": date
        ? { date: { start: date } }
        : { date: null },
      "Overall Score": {
        number: pct,
      },
      "Verdict": {
        select: { name: verdict ? verdict.label.replace(" ✦", "") : "Incomplete" },
      },
      "Submitted At": {
        date: { start: new Date().toISOString() },
      },
    },
    children: [
      {
        object: "block",
        type: "callout",
        callout: {
          rich_text: [{ type: "text", text: { content: "⚠ CONFIDENTIAL — For internal hiring use only. Handle in accordance with your data retention policy." } }],
          icon: { emoji: "🔒" },
          color: "yellow_background",
        },
      },
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: "Competency Breakdown" } }],
        },
      },
      ...competencyBlocks,
    ],
  };

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Notion API error ${res.status}`);
  }

  return await res.json(); // returns the created page, inc. page.url
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreButton({ value, selected, color, onClick }) {
  return (
    <button
      onClick={() => onClick(value)}
      title={SCORE_LABELS[value]}
      style={{
        width: 36, height: 36, borderRadius: "50%",
        border: selected ? `2px solid ${color}` : "2px solid #E5E7EB",
        background: selected ? color : "white",
        color: selected ? "white" : "#6B7280",
        fontWeight: 700, fontSize: 14, cursor: "pointer",
        transition: "all 0.15s ease", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {value}
    </button>
  );
}

function CompetencyRow({ competency, sectionColor, scores, notes, onScore, onNote }) {
  const score = scores[competency.id];
  const note  = notes[competency.id] || "";
  const [showNote, setShowNote] = useState(!!note);

  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid #F3F4F6" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{competency.label}</div>
          <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
            Weight: {competency.weight} — {WEIGHT_LABELS[competency.weight]}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {[1, 2, 3, 4, 5].map((v) => (
            <ScoreButton key={v} value={v} selected={score === v} color={sectionColor}
              onClick={(val) => onScore(competency.id, val)} />
          ))}
          {score && (
            <span style={{ fontSize: 12, color: sectionColor, fontWeight: 600, marginLeft: 4, minWidth: 80 }}>
              {SCORE_LABELS[score]}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowNote(!showNote)}
          style={{
            fontSize: 12, color: note ? sectionColor : "#9CA3AF",
            background: "none", border: "none", cursor: "pointer",
            padding: "4px 8px", borderRadius: 4, fontWeight: note ? 600 : 400,
          }}
        >
          {showNote ? "▲ Hide note" : note ? "📝 Note added" : "+ Add note"}
        </button>
      </div>
      {showNote && (
        <textarea
          value={note}
          onChange={(e) => onNote(competency.id, e.target.value)}
          placeholder="Add interview notes here..."
          style={{
            marginTop: 10, width: "100%", minHeight: 72,
            border: `1px solid ${sectionColor}40`, borderRadius: 8,
            padding: "8px 12px", fontSize: 13, color: "#374151",
            resize: "vertical", outline: "none", fontFamily: "inherit",
            background: "#FAFAFA", boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );
}

function SectionCard({ section, scores, notes, onScore, onNote }) {
  const filled     = section.competencies.filter((c) => scores[c.id] != null);
  const maxW       = section.competencies.reduce((a, c) => a + c.weight * 5, 0);
  const actualW    = filled.reduce((a, c) => a + c.weight * scores[c.id], 0);
  const pct        = maxW > 0 ? Math.round((actualW / maxW) * 100) : 0;

  return (
    <div style={{
      background: "white", borderRadius: 16,
      boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)",
      overflow: "hidden", marginBottom: 24,
    }}>
      <div style={{
        background: section.color, padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ color: "white" }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.3px" }}>{section.label}</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>
            {filled.length}/{section.competencies.length} competencies scored
          </div>
        </div>
        {filled.length > 0 && (
          <div style={{ textAlign: "right", color: "white" }}>
            <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>weighted score</div>
          </div>
        )}
      </div>
      <div style={{ padding: "0 24px 8px" }}>
        {section.competencies.map((c) => (
          <CompetencyRow key={c.id} competency={c} sectionColor={section.color}
            scores={scores} notes={notes} onScore={onScore} onNote={onNote} />
        ))}
      </div>
    </div>
  );
}

function OverallScoreCard({ scores }) {
  const { filled, total, pct } = calcScore(scores);
  const isComplete = filled === total;
  const verdict    = getVerdict(pct, isComplete);

  return (
    <div style={{
      background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
      borderRadius: 16, padding: 28, color: "white", marginBottom: 24,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -30, right: -30,
        width: 160, height: 160, borderRadius: "50%",
        background: "rgba(255,255,255,0.03)",
      }} />
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", color: "#94A3B8", marginBottom: 16 }}>
          OVERALL SCORECARD
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, letterSpacing: "-2px" }}>
              {isComplete ? `${pct}%` : "–"}
            </div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
              {filled} of {total} scored
            </div>
          </div>
          {verdict && (
            <div style={{
              background: verdict.color, color: "white",
              padding: "10px 20px", borderRadius: 100,
              fontWeight: 800, fontSize: 16, letterSpacing: "-0.3px",
            }}>
              {verdict.label}
            </div>
          )}
        </div>
        {verdict && (
          <div style={{
            marginTop: 16, padding: "12px 16px",
            background: "rgba(255,255,255,0.06)",
            borderLeft: `3px solid ${verdict.color}`,
            borderRadius: "0 8px 8px 0",
            fontSize: 13, color: "#CBD5E1", lineHeight: 1.6, fontFamily: "system-ui",
          }}>
            {verdict.advice}
          </div>
        )}
        {!isComplete && (
          <div style={{ marginTop: 16, background: "rgba(255,255,255,0.05)", borderRadius: 8, overflow: "hidden" }}>
            <div style={{
              height: 4,
              width: `${(filled / total) * 100}%`,
              background: "#3B82F6",
              transition: "width 0.4s ease",
            }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

function SettingsModal({ onClose, notionToken, notionDbId, onSave }) {
  const [token, setToken] = useState(notionToken);
  const [dbId,  setDbId]  = useState(notionDbId);

  const handleSave = () => {
    onSave(token.trim(), dbId.trim());
    onClose();
  };

  const inp = {
    width: "100%", border: "1px solid #E5E7EB", borderRadius: 8,
    padding: "9px 12px", fontSize: 13, fontFamily: "monospace",
    outline: "none", background: "#F8FAFC", boxSizing: "border-box", color: "#111827",
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 16, width: "100%", maxWidth: 520,
        boxShadow: "0 25px 60px rgba(0,0,0,0.25)",
      }}>
        <div style={{
          padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", fontFamily: "system-ui" }}>
              Notion Integration
            </div>
            <div style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "system-ui", marginTop: 2 }}>
              Credentials are stored locally in your browser only
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9CA3AF" }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px", fontFamily: "system-ui", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Security note */}
          <div style={{
            padding: "10px 14px", background: "#F0FDF4",
            borderRadius: 8, fontSize: 12, color: "#166534",
            display: "flex", gap: 8, alignItems: "flex-start",
          }}>
            <span>🔒</span>
            <span>These credentials are saved to <strong>localStorage</strong> in your browser only — they are never sent anywhere except directly to the Notion API.</span>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#6B7280", marginBottom: 6 }}>
              NOTION INTEGRATION SECRET
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="secret_xxxxxxxxxxxxxxxxxxxx"
              style={inp}
            />
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
              From notion.so/my-integrations → your integration → Internal Integration Secret
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#6B7280", marginBottom: 6 }}>
              DATABASE ID
            </label>
            <input
              type="text"
              value={dbId}
              onChange={(e) => setDbId(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              style={inp}
            />
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
              From your Notion database URL: notion.so/your-workspace/<strong>THIS-PART</strong>?v=...
            </div>
          </div>

          <div style={{ padding: "10px 14px", background: "#FEF3C7", borderRadius: 8, fontSize: 12, color: "#92400E" }}>
            <strong>Required Notion DB properties:</strong> Candidate Name (Title), Role (Text), Interviewer (Text), Interview Date (Date), Overall Score (Number), Verdict (Select), Submitted At (Date).
            <br /><br />
            Make sure your integration has been <strong>invited to the database</strong> (open database → ··· → Connections → add your integration).
          </div>
        </div>

        <div style={{
          padding: "16px 24px", borderTop: "1px solid #F3F4F6",
          display: "flex", justifyContent: "flex-end", gap: 8, fontFamily: "system-ui",
        }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 8, border: "1px solid #E5E7EB",
            background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#374151",
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            padding: "8px 20px", borderRadius: 8, border: "none",
            background: "#0F172A", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>Save Credentials</button>
        </div>
      </div>
    </div>
  );
}

// ─── Summary Modal ────────────────────────────────────────────────────────────

function SummaryModal({ onClose, candidateName, role, interviewer, interviewDate, scores, notes, notionToken, notionDbId }) {
  const [copyStatus,   setCopyStatus]   = useState("");
  const [notionStatus, setNotionStatus] = useState("");
  const [notionUrl,    setNotionUrl]    = useState("");
  const [pushing,      setPushing]      = useState(false);

  const { pct, filled, total } = calcScore(scores);
  const isComplete = filled === total;
  const verdict    = getVerdict(pct, isComplete);

  const generateText = () => {
    const div = "─".repeat(48);
    const lines = [
      "INTERVIEW SCORECARD SUMMARY", div,
      `Candidate:      ${candidateName || "—"}`,
      `Role:           ${role || "—"}`,
      `Interviewer:    ${interviewer || "—"}`,
      `Date:           ${interviewDate || "—"}`,
      `Overall Score:  ${pct}%  |  Verdict: ${verdict ? verdict.label : "Incomplete"}`,
      div,
    ];
    SECTIONS.forEach((s) => {
      lines.push("", s.label.toUpperCase());
      s.competencies.forEach((c) => {
        const sc   = scores[c.id];
        const note = notes[c.id];
        lines.push(`  • ${c.label}`);
        lines.push(`    Weight: ${c.weight}  |  Score: ${sc ? `${sc}/5 — ${SCORE_LABELS[sc]}` : "Not scored"}`);
        if (note && note.trim()) lines.push(`    Notes: ${note.trim()}`);
      });
    });
    lines.push("", div);
    if (verdict) { lines.push(`VERDICT: ${verdict.label}`, verdict.advice); }
    lines.push(div, "⚠  CONFIDENTIAL — For internal hiring use only.");
    return lines.join("\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generateText());
      setCopyStatus("✓ Copied!");
    } catch {
      setCopyStatus("✗ Copy failed — select manually.");
    }
    setTimeout(() => setCopyStatus(""), 3000);
  };

  const handlePushNotion = async () => {
    if (!notionToken || !notionDbId) {
      setNotionStatus("⚠ Add your Notion credentials in Settings first.");
      setTimeout(() => setNotionStatus(""), 4000);
      return;
    }
    setPushing(true);
    setNotionStatus("Pushing to Notion…");
    try {
      const page = await pushToNotion({
        token: notionToken, databaseId: notionDbId,
        candidate: candidateName, role, interviewer,
        date: interviewDate, scores, notes,
      });
      setNotionUrl(page.url);
      setNotionStatus("✓ Pushed to Notion!");
    } catch (err) {
      setNotionStatus(`✗ ${err.message}`);
    }
    setPushing(false);
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "white", borderRadius: 16, width: "100%", maxWidth: 640,
        maxHeight: "85vh", display: "flex", flexDirection: "column",
        boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", fontFamily: "system-ui" }}>Interview Summary</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "system-ui", marginTop: 2 }}>
              Copy to clipboard or push directly to your Notion candidate database
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9CA3AF" }}>✕</button>
        </div>

        {/* Confidentiality notice */}
        <div style={{
          margin: "12px 24px 0", padding: "10px 14px",
          background: "#FEF3C7", borderRadius: 8,
          fontSize: 12, color: "#92400E", fontFamily: "system-ui",
          display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <span>⚠</span>
          <span><strong>Confidential candidate data.</strong> Share only with authorised members of the hiring panel. Retain only as long as required by your data retention policy.</span>
        </div>

        {/* Notion status */}
        {notionStatus && (
          <div style={{
            margin: "8px 24px 0", padding: "10px 14px",
            background: notionStatus.startsWith("✓") ? "#F0FDF4" : notionStatus.startsWith("⚠") ? "#FEF3C7" : "#FEF2F2",
            borderRadius: 8, fontSize: 12, fontFamily: "system-ui",
            color: notionStatus.startsWith("✓") ? "#166534" : notionStatus.startsWith("⚠") ? "#92400E" : "#991B1B",
          }}>
            {notionStatus}
            {notionUrl && (
              <a href={notionUrl} target="_blank" rel="noreferrer"
                style={{ marginLeft: 8, color: "#2563EB", fontWeight: 600 }}>
                Open in Notion →
              </a>
            )}
          </div>
        )}

        {/* Summary text */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          <pre style={{
            fontFamily: "'Courier New', monospace", fontSize: 12, color: "#374151",
            background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 8,
            padding: 16, whiteSpace: "pre-wrap", wordBreak: "break-word",
            margin: 0, lineHeight: 1.7,
          }}>
            {generateText()}
          </pre>
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid #F3F4F6",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "system-ui", flexWrap: "wrap", gap: 8,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600,
            color: copyStatus.startsWith("✓") ? "#059669" : "#DC2626" }}>
            {copyStatus}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid #E5E7EB",
              background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#374151",
            }}>Close</button>
            <button onClick={handleCopy} style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid #E5E7EB",
              background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#374151",
            }}>Copy to Clipboard</button>
            <button onClick={handlePushNotion} disabled={pushing} style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: pushing ? "#6B7280" : "#0F172A",
              color: "white", fontSize: 13, fontWeight: 700,
              cursor: pushing ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {pushing ? "Pushing…" : "Push to Notion"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [candidateName,  setCandidateName]  = useState("");
  const [interviewer,    setInterviewer]    = useState("");
  const [role,           setRole]           = useState("Mid Level Software Engineer");
  const [interviewDate,  setInterviewDate]  = useState("");
  const [scores,         setScores]         = useState({});
  const [notes,          setNotes]          = useState({});

  const [showSummary,    setShowSummary]    = useState(false);
  const [showSettings,   setShowSettings]   = useState(false);
  const [confirmReset,   setConfirmReset]   = useState(false);

  // Notion credentials — stored in localStorage, never in code
  const [notionToken,    setNotionToken]    = useState(() => localStorage.getItem("notion_token")  || "");
  const [notionDbId,     setNotionDbId]     = useState(() => localStorage.getItem("notion_db_id") || "");

  const handleSaveCredentials = (token, dbId) => {
    setNotionToken(token);
    setNotionDbId(dbId);
    localStorage.setItem("notion_token",  token);
    localStorage.setItem("notion_db_id", dbId);
  };

  const handleScore = (id, val) =>
    setScores((prev) => ({ ...prev, [id]: prev[id] === val ? undefined : val }));

  const handleNote = (id, val) =>
    setNotes((prev) => ({ ...prev, [id]: val }));

  const inp = {
    border: "1px solid #E5E7EB", borderRadius: 8, padding: "9px 12px",
    fontSize: 14, color: "#111827", outline: "none", fontFamily: "inherit",
    background: "white", width: "100%", boxSizing: "border-box",
  };

  const notionConfigured = notionToken && notionDbId;

  return (
    <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", background: "#F8FAFC", minHeight: "100vh", padding: "32px 16px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#94A3B8", marginBottom: 6, fontFamily: "system-ui" }}>
                TECHNICAL INTERVIEW
              </div>
              <h1 style={{ fontSize: 32, fontWeight: 900, color: "#0F172A", margin: 0, letterSpacing: "-1px", lineHeight: 1 }}>
                Scorecard
              </h1>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {/* Settings / Notion status */}
              <button
                onClick={() => setShowSettings(true)}
                title={notionConfigured ? "Notion connected — click to edit" : "Connect Notion"}
                style={{
                  padding: "8px 14px", borderRadius: 8,
                  border: `1px solid ${notionConfigured ? "#BBF7D0" : "#E5E7EB"}`,
                  background: notionConfigured ? "#F0FDF4" : "white",
                  fontSize: 13, fontFamily: "system-ui", fontWeight: 600,
                  cursor: "pointer", color: notionConfigured ? "#166534" : "#374151",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {notionConfigured ? "✓ Notion" : "⚙ Notion Setup"}
              </button>
              <button
                onClick={() => setShowSummary(true)}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "1px solid #E5E7EB",
                  background: "white", fontSize: 13, fontFamily: "system-ui",
                  fontWeight: 600, cursor: "pointer", color: "#374151",
                }}
              >
                Generate Summary
              </button>
            </div>
          </div>
        </div>

        {/* ── Meta fields ── */}
        <div style={{
          background: "white", borderRadius: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)", padding: 24, marginBottom: 24,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontFamily: "system-ui" }}>
            {[
              { label: "Candidate Name", value: candidateName, setter: setCandidateName, placeholder: "e.g. Jane Smith" },
              { label: "Interviewer",    value: interviewer,   setter: setInterviewer,   placeholder: "Your name" },
              { label: "Role",           value: role,          setter: setRole,          placeholder: "e.g. Senior Engineer" },
              { label: "Interview Date", value: interviewDate, setter: setInterviewDate, placeholder: "", type: "date" },
            ].map(({ label, value, setter, placeholder, type }) => (
              <div key={label}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#6B7280", marginBottom: 6 }}>
                  {label.toUpperCase()}
                </label>
                <input type={type || "text"} value={value} placeholder={placeholder}
                  onChange={(e) => setter(e.target.value)} style={inp} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Overall score ── */}
        <OverallScoreCard scores={scores} />

        {/* ── Section cards ── */}
        {SECTIONS.map((section) => (
          <SectionCard key={section.id} section={section}
            scores={scores} notes={notes}
            onScore={handleScore} onNote={handleNote} />
        ))}

        {/* ── Footer ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0 32px", fontFamily: "system-ui" }}>
          {confirmReset ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>Clear all scores & notes?</span>
              <button onClick={() => { setScores({}); setNotes({}); setConfirmReset(false); }}
                style={{ background: "#DC2626", border: "none", color: "white", padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Yes, clear
              </button>
              <button onClick={() => setConfirmReset(false)}
                style={{ background: "none", border: "1px solid #E5E7EB", color: "#6B7280", padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmReset(true)}
              style={{ background: "none", border: "1px solid #FCA5A5", color: "#DC2626", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              Reset Scores
            </button>
          )}
          <button onClick={() => setShowSummary(true)} style={{
            padding: "10px 28px", borderRadius: 8, border: "none",
            background: "#0F172A", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>
            Generate Summary
          </button>
        </div>

        {/* ── Score legend ── */}
        <div style={{
          background: "white", borderRadius: 12, border: "1px solid #E5E7EB",
          padding: "16px 20px", marginBottom: 32, fontFamily: "system-ui",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#9CA3AF", marginBottom: 12 }}>SCORE GUIDE</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {Object.entries(SCORE_LABELS).map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", background: "#0F172A",
                  color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>{k}</div>
                <span style={{ fontSize: 12, color: "#6B7280" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          notionToken={notionToken}
          notionDbId={notionDbId}
          onSave={handleSaveCredentials}
        />
      )}
      {showSummary && (
        <SummaryModal
          onClose={() => setShowSummary(false)}
          candidateName={candidateName} role={role}
          interviewer={interviewer} interviewDate={interviewDate}
          scores={scores} notes={notes}
          notionToken={notionToken} notionDbId={notionDbId}
        />
      )}
    </div>
  );
}
