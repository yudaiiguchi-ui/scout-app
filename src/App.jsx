import { useState, useRef, useCallback } from "react";

const MODEL = "claude-sonnet-4-20250514";

const DEFAULT_TEMPLATE_SUBJECT = `【スカウト】{{名前}}さんのご経歴に興味を持ち、ご連絡いたしました`;

const DEFAULT_TEMPLATE_BODY = `{{名前}}さん

はじめまして。〇〇株式会社の採用担当・△△と申します。

{{名前}}さんの{{役職}}としてのご経歴を拝見し、ぜひ一度お話しできればと思いご連絡いたしました。

【{{名前}}さんの経歴に惹かれた理由】
※候補者の実績・スキルをもとに、なぜスカウトしたいかを具体的に200字程度で書いてください※

弊社では現在、〇〇のポジションを募集しており、{{名前}}さんのような方にぜひジョインいただきたいと考えております。

もしご興味をお持ちいただけましたら、まずはカジュアルにお話しできればと思います。
30分程度のオンライン面談からでも構いません。

ご検討のほど、よろしくお願いいたします。

〇〇株式会社　採用担当
△△`;

function buildSystemPrompt() {
  return `あなたは優秀な採用スカウト担当者です。
候補者情報とテンプレート文面をもとに、スカウトメッセージを仕上げてください。

## ルール
- テンプレートの {{列名}} プレースホルダーは候補者の実際の値に置き換える
- 「※〜※」のような指示コメントがある箇所は、候補者情報を読んで自然な文章に差し替える（指示コメント自体は削除する）
- テンプレートにない箇所は一切変更しない（文体・構成・改行をそのまま保つ）
- 候補者の具体的な実績・スキルを必ず反映させる

## 出力形式（必ずこの形式のみ出力すること）
件名：ここに件名
本文：
ここに本文`;
}

async function generateOne(candidate, templateSubject, templateBody) {
  const fields = Object.entries(candidate)
    .map(([k, v]) => `・${k}: ${v || "記載なし"}`)
    .join("\n");

  const userMsg = `以下の候補者情報とテンプレートをもとに文面を完成させてください。

【候補者情報】
${fields}

【件名テンプレート】
${templateSubject}

【本文テンプレート】
${templateBody}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  const data = await res.json();
  const text = data.content?.map((b) => b.text || "").join("") || "";
  const subjectMatch = text.match(/件名[：:]\s*(.+)/);
  const bodyMatch = text.match(/本文[：:]\s*([\s\S]+)/);
  return {
    subject: subjectMatch?.[1]?.trim() || "",
    body: bodyMatch?.[1]?.trim() || text.trim(),
  };
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] || "").trim().replace(/^"|"$/g, "");
    });
    return row;
  }).filter((r) => Object.values(r).some((v) => v));
}

const SAMPLE_CSV = `名前,年齢,性別,現職会社,役職,スキル,実績
田中 太郎,32,男性,株式会社ABC,プロダクトマネージャー,React/TypeScript/AWS,MAU10万→50万のプロダクト成長を主導
佐藤 花子,28,女性,〇〇テック,Webエンジニア,Python/Django/GCP,決済システムのリプレイスを単独で完遂
山田 健一,35,男性,XYZ株式会社,エンジニアリングマネージャー,チームマネジメント/アジャイル,20名のエンジニア組織を立ち上げ`;

function HighlightedTemplate({ text }) {
  const parts = text.split(/({{[^}]+}}|※[^※]+※)/g);
  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {parts.map((p, i) => {
        if (/^{{.+}}$/.test(p)) return <mark key={i} style={{ background: "rgba(245,166,35,0.25)", color: "#b87000", borderRadius: 3, padding: "0 3px", fontWeight: 700 }}>{p}</mark>;
        if (/^※.+※$/.test(p)) return <mark key={i} style={{ background: "rgba(99,179,255,0.18)", color: "#1d6fa4", borderRadius: 3, padding: "0 3px", fontStyle: "italic" }}>{p}</mark>;
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

export default function BulkScoutGenerator() {
  const [candidates, setCandidates] = useState([]);
  const [results, setResults] = useState({});
  const [statuses, setStatuses] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [activeTab, setActiveTab] = useState(null);
  const [copiedMap, setCopiedMap] = useState({});
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [templateSubject, setTemplateSubject] = useState(DEFAULT_TEMPLATE_SUBJECT);
  const [templateBody, setTemplateBody] = useState(DEFAULT_TEMPLATE_BODY);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateTab, setTemplateTab] = useState("edit");
  const fileRef = useRef();

  const loadCSV = (text, name) => {
    const parsed = parseCSV(text);
    setCandidates(parsed);
    setResults({});
    setStatuses({});
    setFileName(name);
    setActiveTab(null);
  };

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => loadCSV(e.target.result, file.name);
    reader.readAsText(file, "UTF-8");
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, []);

  const loadSample = () => loadCSV(SAMPLE_CSV, "サンプルデータ");

  const runBulk = async () => {
    if (!candidates.length) return;
    setGenerating(true);
    setProgress({ done: 0, total: candidates.length });
    setResults({});
    setStatuses({});
    for (let i = 0; i < candidates.length; i++) {
      setStatuses((s) => ({ ...s, [i]: "generating" }));
      try {
        const out = await generateOne(candidates[i], templateSubject, templateBody);
        setResults((r) => ({ ...r, [i]: out }));
        setStatuses((s) => ({ ...s, [i]: "done" }));
      } catch {
        setStatuses((s) => ({ ...s, [i]: "error" }));
      }
      setProgress({ done: i + 1, total: candidates.length });
      if (i === 0) setActiveTab(0);
    }
    setGenerating(false);
    setActiveTab(0);
  };

  const copy = (key, text) => {
    navigator.clipboard.writeText(text);
    setCopiedMap((m) => ({ ...m, [key]: true }));
    setTimeout(() => setCopiedMap((m) => ({ ...m, [key]: false })), 2000);
  };

  const nameKey = candidates[0]
    ? Object.keys(candidates[0]).find(k => k.includes("名")) || Object.keys(candidates[0])[0]
    : "名前";
  const doneCount = Object.values(statuses).filter(s => s === "done").length;
  const allDone = candidates.length > 0 && doneCount === candidates.length;

  const placeholders = [...new Set(
    [...(templateSubject + templateBody).matchAll(/{{([^}]+)}}/g)].map(m => m[0])
  )];
  const aiSections = [...new Set(
    [...(templateSubject + templateBody).matchAll(/※([^※]+)※/g)].map(m => m[0])
  )];

  return (
    <div style={{ minHeight: "100vh", background: "#f7f5f0", fontFamily: "'Helvetica Neue', Helvetica, sans-serif", color: "#1a1a1a" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity:0; transform:translateY(6px);} to { opacity:1; transform:translateY(0);} }
        textarea { resize: vertical; }
        textarea:focus, input:focus { outline: none; border-color: #f5a623 !important; box-shadow: 0 0 0 2px rgba(245,166,35,0.12); }
      `}</style>

      {/* Top bar */}
      <div style={{ background: "#1a1a1a", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 14, color: "#fff", letterSpacing: 1 }}>SCOUT ×</span>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "#666" }}>一括文面生成</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {allDone && <div style={{ fontSize: 11, color: "#4ade80", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 20, padding: "3px 12px" }}>✓ {doneCount}件 完了</div>}
          <button onClick={() => setTemplateOpen(o => !o)} style={{
            padding: "6px 14px", background: templateOpen ? "#f5a623" : "rgba(255,255,255,0.07)",
            color: templateOpen ? "#000" : "#bbb", border: "none", borderRadius: 4,
            fontSize: 12, cursor: "pointer", fontWeight: 600, transition: "all 0.2s",
          }}>
            ✏️ テンプレート {templateOpen ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Template panel */}
      {templateOpen && (
        <div style={{ background: "#fff", borderBottom: "2px solid #f5a623", animation: "slideIn 0.2s ease" }}>
          {/* Tab bar */}
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #f0ece4", padding: "0 28px" }}>
            {[["edit", "✏️ 編集"], ["preview", "👁 プレビュー"]].map(([key, label]) => (
              <button key={key} onClick={() => setTemplateTab(key)} style={{
                padding: "10px 18px", background: "transparent", border: "none",
                borderBottom: `2px solid ${templateTab === key ? "#f5a623" : "transparent"}`,
                marginBottom: -1, fontSize: 12, color: templateTab === key ? "#1a1a1a" : "#aaa",
                cursor: "pointer", fontWeight: templateTab === key ? 700 : 400,
              }}>{label}</button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center", fontSize: 11, color: "#ccc" }}>
              <span><span style={{ background: "rgba(245,166,35,0.25)", color: "#b87000", borderRadius: 2, padding: "1px 5px", fontWeight: 700 }}>{"{{列名}}"}</span> CSVの値を差し込み</span>
              <span><span style={{ background: "rgba(99,179,255,0.18)", color: "#1d6fa4", borderRadius: 2, padding: "1px 5px", fontStyle: "italic" }}>※指示※</span> AIが自動生成</span>
            </div>
          </div>

          {templateTab === "edit" && (
            <div style={{ padding: "20px 28px", display: "grid", gridTemplateColumns: "320px 1fr", gap: 20 }}>
              <div>
                <label style={{ fontSize: 10, letterSpacing: 3, color: "#999", textTransform: "uppercase", display: "block", marginBottom: 8 }}>件名</label>
                <input value={templateSubject} onChange={e => setTemplateSubject(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #e0dbd0", borderRadius: 6, fontSize: 13, background: "#faf9f6", transition: "border 0.2s" }} />
                {/* Placeholder hints */}
                {placeholders.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, color: "#bbb", letterSpacing: 1, marginBottom: 5 }}>差し込み中のプレースホルダー</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {placeholders.map(p => <span key={p} style={{ fontSize: 11, background: "rgba(245,166,35,0.15)", color: "#b87000", borderRadius: 3, padding: "2px 7px", fontWeight: 600 }}>{p}</span>)}
                    </div>
                  </div>
                )}
                {aiSections.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: "#bbb", letterSpacing: 1, marginBottom: 5 }}>AIが生成する箇所</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {aiSections.map(s => <span key={s} style={{ fontSize: 11, background: "rgba(99,179,255,0.12)", color: "#1d6fa4", borderRadius: 3, padding: "3px 7px", fontStyle: "italic", lineHeight: 1.5 }}>{s}</span>)}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontSize: 10, letterSpacing: 3, color: "#999", textTransform: "uppercase", display: "block", marginBottom: 8 }}>本文</label>
                <textarea value={templateBody} onChange={e => setTemplateBody(e.target.value)} rows={11}
                  style={{ width: "100%", padding: "12px", border: "1px solid #e0dbd0", borderRadius: 6, fontSize: 12, background: "#faf9f6", lineHeight: 1.85, fontFamily: "'Helvetica Neue', sans-serif", transition: "border 0.2s" }} />
              </div>
            </div>
          )}

          {templateTab === "preview" && (
            <div style={{ padding: "20px 28px", display: "grid", gridTemplateColumns: "320px 1fr", gap: 20 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 3, color: "#999", textTransform: "uppercase", marginBottom: 8 }}>件名</div>
                <div style={{ padding: "10px 14px", background: "#faf9f6", border: "1px solid #e8e4dc", borderRadius: 6, fontSize: 13 }}>
                  <HighlightedTemplate text={templateSubject} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 3, color: "#999", textTransform: "uppercase", marginBottom: 8 }}>本文</div>
                <div style={{ padding: "16px", background: "#faf9f6", border: "1px solid #e8e4dc", borderRadius: 6, fontSize: 12, lineHeight: 1.85 }}>
                  <HighlightedTemplate text={templateBody} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main layout */}
      <div style={{ display: "flex", height: `calc(100vh - ${templateOpen ? (templateTab === "edit" ? 280 : 240) : 0}px - 52px)` }}>

        {/* Left panel */}
        <div style={{ width: 290, background: "#fff", borderRight: "1px solid #e8e4dc", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "18px 16px", borderBottom: "1px solid #f0ece4" }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: "#aaa", textTransform: "uppercase", marginBottom: 10 }}>CSV アップロード</div>
            <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop} onClick={() => fileRef.current.click()}
              style={{ border: `2px dashed ${isDragging ? "#f5a623" : "#e0dbd0"}`, borderRadius: 8, padding: "18px 12px", textAlign: "center", cursor: "pointer", background: isDragging ? "rgba(245,166,35,0.04)" : "#faf9f6", transition: "all 0.2s" }}>
              <div style={{ fontSize: 20, marginBottom: 5 }}>📄</div>
              <div style={{ fontSize: 11, color: "#aaa", lineHeight: 1.5 }}>ドロップ or クリックして選択</div>
              {fileName && <div style={{ marginTop: 7, fontSize: 11, color: "#f5a623", background: "rgba(245,166,35,0.08)", borderRadius: 4, padding: "3px 8px" }}>{fileName}</div>}
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
            <div style={{ textAlign: "center", margin: "7px 0", color: "#ddd", fontSize: 11 }}>または</div>
            <button onClick={loadSample} style={{ width: "100%", padding: "7px", background: "transparent", border: "1px solid #e0dbd0", borderRadius: 5, fontSize: 11, color: "#999", cursor: "pointer" }}>
              サンプルで試す
            </button>
          </div>

          {candidates.length > 0 && (
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #f0ece4", background: "#faf9f6" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {Object.keys(candidates[0]).map(k => <span key={k} style={{ fontSize: 10, background: "#f0ece4", color: "#888", borderRadius: 3, padding: "1px 6px" }}>{k}</span>)}
              </div>
              <div style={{ marginTop: 5, fontSize: 11, color: "#bbb" }}>{candidates.length}件読み込み済み</div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto" }}>
            {candidates.map((c, i) => {
              const name = c[nameKey] || `候補者 ${i + 1}`;
              const status = statuses[i];
              const isActive = activeTab === i;
              return (
                <div key={i} onClick={() => setActiveTab(i)} style={{
                  padding: "11px 16px", borderBottom: "1px solid #f4f1eb", cursor: "pointer",
                  background: isActive ? "#fff8ee" : "transparent",
                  borderLeft: isActive ? "3px solid #f5a623" : "3px solid transparent",
                  display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.15s",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 1 }}>{c["役職"] || c["現職"] || c["会社"] || ""}</div>
                  </div>
                  <StatusBadge status={status} />
                </div>
              );
            })}
          </div>

          {candidates.length > 0 && (
            <div style={{ padding: 14, borderTop: "1px solid #f0ece4" }}>
              {generating ? (
                <div>
                  <div style={{ height: 4, background: "#f0ece4", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ height: "100%", width: `${(progress.done / progress.total) * 100}%`, background: "#f5a623", borderRadius: 2, transition: "width 0.4s ease" }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#aaa", textAlign: "center" }}>{progress.done} / {progress.total} 件生成中...</div>
                </div>
              ) : (
                <button onClick={runBulk} style={{ width: "100%", padding: "12px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  ✦ {candidates.length}件まとめて生成
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px 36px" }}>
          {activeTab === null && !generating && <EmptyState hasCandidates={candidates.length > 0} />}

          {activeTab !== null && candidates[activeTab] && (
            <div style={{ animation: "slideIn 0.3s ease", maxWidth:"95%"}}>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, letterSpacing: 3, color: "#bbb", textTransform: "uppercase", marginBottom: 10 }}>候補者情報</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "14px 18px", background: "#fff", border: "1px solid #ece8e0", borderRadius: 8 }}>
                  {Object.entries(candidates[activeTab]).map(([k, v]) => v ? (
                    <div key={k} style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
                      <span style={{ fontSize: 10, color: "#bbb" }}>{k}</span>
                      <span style={{ fontSize: 12, color: "#444", fontWeight: 500 }}>{v}</span>
                      <span style={{ color: "#e0dbd0" }}>·</span>
                    </div>
                  ) : null)}
                </div>
              </div>

              {statuses[activeTab] === "generating" && (
                <div style={{ padding: "48px", textAlign: "center", background: "#fff", borderRadius: 8, border: "1px solid #ece8e0" }}>
                  <div style={{ width: 32, height: 32, border: "2px solid #f0ece4", borderTop: "2px solid #f5a623", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
                  <div style={{ fontSize: 13, color: "#aaa" }}>テンプレートに候補者情報を反映中...</div>
                </div>
              )}

              {statuses[activeTab] === "done" && results[activeTab] && (
                <div style={{ animation: "slideIn 0.4s ease" }}>
                  <ResultBlock label="件名" content={results[activeTab].subject} onCopy={() => copy(`subject-${activeTab}`, results[activeTab].subject)} copied={copiedMap[`subject-${activeTab}`]} mono />
                  <ResultBlock label="本文" content={results[activeTab].body} onCopy={() => copy(`body-${activeTab}`, results[activeTab].body)} copied={copiedMap[`body-${activeTab}`]} />
                  <button onClick={() => copy(`all-${activeTab}`, `件名：${results[activeTab].subject}\n\n${results[activeTab].body}`)}
                    style={{ marginTop: 4, padding: "10px 20px", background: "#f5a623", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                    {copiedMap[`all-${activeTab}`] ? "✓ コピー済み" : "件名＋本文をまとめてコピー"}
                  </button>
                </div>
              )}

              {statuses[activeTab] === "error" && (
                <div style={{ padding: 24, background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: 13 }}>
                  生成中にエラーが発生しました。再度「まとめて生成」を実行してください。
                </div>
              )}

              {!statuses[activeTab] && (
                <div style={{ padding: "40px", textAlign: "center", background: "#fff", borderRadius: 8, border: "1px dashed #e0dbd0", color: "#ccc", fontSize: 13 }}>
                  左下の「まとめて生成」ボタンを押すと生成されます
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
                <button onClick={() => setActiveTab(Math.max(0, activeTab - 1))} disabled={activeTab === 0} style={navBtnStyle(activeTab === 0)}>← 前の候補者</button>
                <span style={{ fontSize: 12, color: "#bbb", alignSelf: "center" }}>{activeTab + 1} / {candidates.length}</span>
                <button onClick={() => setActiveTab(Math.min(candidates.length - 1, activeTab + 1))} disabled={activeTab === candidates.length - 1} style={navBtnStyle(activeTab === candidates.length - 1)}>次の候補者 →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  if (!status) return <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#e0dbd0" }} />;
  if (status === "generating") return <div style={{ width: 14, height: 14, border: "2px solid #f0ece4", borderTop: "2px solid #f5a623", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />;
  if (status === "done") return <div style={{ fontSize: 12, color: "#4ade80" }}>✓</div>;
  if (status === "error") return <div style={{ fontSize: 12, color: "#f87171" }}>!</div>;
}

function ResultBlock({ label, content, onCopy, copied, mono }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 10, letterSpacing: 3, color: "#bbb", textTransform: "uppercase" }}>{label}</span>
        <button onClick={onCopy} style={{ padding: "4px 12px", background: copied ? "#f0fdf4" : "#f7f5f0", border: `1px solid ${copied ? "#86efac" : "#e0dbd0"}`, borderRadius: 4, fontSize: 11, color: copied ? "#16a34a" : "#888", cursor: "pointer" }}>
          {copied ? "✓ コピー済" : "コピー"}
        </button>
      </div>
      <div style={{ padding: "16px 20px", background: "#fff", border: "1px solid #ece8e0", borderRadius: 8, fontSize: 13, lineHeight: mono ? 1.5 : 1.95, color: "#2a2a2a", whiteSpace: "pre-wrap", letterSpacing: 0.2 }}>
        {content}
      </div>
    </div>
  );
}

function EmptyState({ hasCandidates }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
      <div style={{ fontSize: 44, marginBottom: 16, opacity: 0.35 }}>{hasCandidates ? "👈" : "📋"}</div>
      <div style={{ fontSize: 14, color: "#bbb", marginBottom: 8 }}>{hasCandidates ? "候補者を選択してください" : "CSVをアップロードして開始"}</div>
      <div style={{ fontSize: 12, color: "#d0ccc4", maxWidth: "95%", lineHeight: 1.8 }}>
        {hasCandidates
          ? "左リストから候補者を選ぶと生成結果が表示されます"
          : "上の「テンプレート編集」でベース文面を設定し、CSVをアップロードして一括生成できます"}
      </div>
    </div>
  );
}

const navBtnStyle = (disabled) => ({
  padding: "8px 16px", background: "transparent", border: "1px solid #e0dbd0",
  borderRadius: 6, fontSize: 12, color: disabled ? "#ccc" : "#666", cursor: disabled ? "not-allowed" : "pointer",
});