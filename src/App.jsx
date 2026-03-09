import { useState } from "react";

const MODEL = "claude-sonnet-4-20250514";

const DEFAULT_TEMPLATE_SUBJECT = `【スカウト】{{候補者名}}さんのご経歴に興味を持ち、ご連絡いたしました`;

const DEFAULT_TEMPLATE_BODY = `{{候補者名}}さん

はじめまして。〇〇株式会社の採用担当・△△と申します。

{{候補者名}}さんのご経歴を拝見し、ぜひ一度お話しできればと思いご連絡いたしました。

【{{候補者名}}さんの経歴に惹かれた理由】
※候補者の実績・スキルをもとに、なぜスカウトしたいかを具体的に200字程度で書いてください※

弊社では現在、〇〇のポジションを募集しており、{{候補者名}}さんのような方にぜひジョインいただきたいと考えております。

もしご興味をお持ちいただけましたら、まずはカジュアルにお話しできればと思います。
30分程度のオンライン面談からでも構いません。

ご検討のほど、よろしくお願いいたします。

〇〇株式会社　採用担当
△△`;

async function generate(profileText, templateSubject, templateBody) {
  const system = `あなたは優秀な採用スカウト担当者です。
候補者のプロフィールテキストとテンプレート文面をもとに、スカウトメッセージを仕上げてください。

## ルール
- プロフィールテキストから候補者名・経歴・スキル・実績を読み取る
- テンプレートの {{候補者名}} は読み取った名前に置き換える
- 「※〜※」の指示箇所は候補者情報をもとに自然な文章に差し替える（指示コメント自体は削除）
- テンプレートにない箇所は変更しない
- 候補者の具体的な実績・スキルを必ず反映させる

## 出力形式（必ずこの形式のみ出力）
件名：ここに件名
本文：
ここに本文`;

  const userMsg = `以下のプロフィールテキストとテンプレートをもとに文面を完成させてください。

【プロフィールテキスト】
${profileText}

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
      system,
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

export default function ScoutPasteGenerator() {
  const [profileText, setProfileText] = useState("");
  const [templateSubject, setTemplateSubject] = useState(DEFAULT_TEMPLATE_SUBJECT);
  const [templateBody, setTemplateBody] = useState(DEFAULT_TEMPLATE_BODY);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateTab, setTemplateTab] = useState("edit");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState({});

  const handleGenerate = async () => {
    if (!profileText.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const out = await generate(profileText, templateSubject, templateBody);
      setResult(out);
    } catch {
      setResult({ subject: "", body: "エラーが発生しました。もう一度お試しください。" });
    }
    setLoading(false);
  };

  const copy = (key, text) => {
    navigator.clipboard.writeText(text);
    setCopied(c => ({ ...c, [key]: true }));
    setTimeout(() => setCopied(c => ({ ...c, [key]: false })), 2000);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f7f5f0", fontFamily: "'Helvetica Neue', Helvetica, sans-serif", color: "#1a1a1a" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity:0; transform:translateY(6px);} to { opacity:1; transform:translateY(0);} }
        textarea:focus, input:focus { outline: none; border-color: #f5a623 !important; box-shadow: 0 0 0 2px rgba(245,166,35,0.12); }
        textarea { resize: vertical; }
      `}</style>

      {/* Top bar */}
      <div style={{ background: "#1a1a1a", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 14, color: "#fff", letterSpacing: 1 }}>SCOUT ×</span>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, color: "#666" }}>プロフィール貼り付け版</span>
        </div>
        <button onClick={() => setTemplateOpen(o => !o)} style={{
          padding: "6px 14px", background: templateOpen ? "#f5a623" : "rgba(255,255,255,0.07)",
          color: templateOpen ? "#000" : "#bbb", border: "none", borderRadius: 4,
          fontSize: 12, cursor: "pointer", fontWeight: 600, transition: "all 0.2s",
        }}>
          ✏️ テンプレート {templateOpen ? "▲" : "▼"}
        </button>
      </div>

      {/* Template panel */}
      {templateOpen && (
        <div style={{ background: "#fff", borderBottom: "2px solid #f5a623", animation: "slideIn 0.2s ease" }}>
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
              <span><span style={{ background: "rgba(245,166,35,0.25)", color: "#b87000", borderRadius: 2, padding: "1px 5px", fontWeight: 700 }}>{"{{候補者名}}"}</span> 自動で置き換え</span>
              <span><span style={{ background: "rgba(99,179,255,0.18)", color: "#1d6fa4", borderRadius: 2, padding: "1px 5px", fontStyle: "italic" }}>※指示※</span> AIが自動生成</span>
            </div>
          </div>

          {templateTab === "edit" && (
            <div style={{ padding: "20px 28px", display: "grid", gridTemplateColumns: "320px 1fr", gap: 20 }}>
              <div>
                <label style={{ fontSize: 10, letterSpacing: 3, color: "#999", textTransform: "uppercase", display: "block", marginBottom: 8 }}>件名</label>
                <input value={templateSubject} onChange={e => setTemplateSubject(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #e0dbd0", borderRadius: 6, fontSize: 13, background: "#faf9f6" }} />
              </div>
              <div>
                <label style={{ fontSize: 10, letterSpacing: 3, color: "#999", textTransform: "uppercase", display: "block", marginBottom: 8 }}>本文</label>
                <textarea value={templateBody} onChange={e => setTemplateBody(e.target.value)} rows={10}
                  style={{ width: "100%", padding: "12px", border: "1px solid #e0dbd0", borderRadius: 6, fontSize: 12, background: "#faf9f6", lineHeight: 1.85, fontFamily: "'Helvetica Neue', sans-serif" }} />
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

      {/* Main */}
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>

        {/* Left: Input */}
        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#999", textTransform: "uppercase", marginBottom: 12 }}>
            プロフィールテキストを貼り付け
          </div>
          <div style={{ marginBottom: 10, fontSize: 12, color: "#aaa", lineHeight: 1.6 }}>
            WantedlyやLinkedInのプロフィールページをまるごとコピーして貼り付けてください。AIが自動で情報を読み取ります。
          </div>
          <textarea
            value={profileText}
            onChange={e => setProfileText(e.target.value)}
            placeholder={"田中 太郎\nプロダクトマネージャー\n株式会社ABC\n\n経歴：\n2018年〜現在　株式会社ABC　PM\nMAU10万→50万のプロダクト成長を主導...\n\nスキル：React, TypeScript, AWS..."}
            rows={18}
            style={{
              width: "100%", padding: "16px", border: "1px solid #e0dbd0", borderRadius: 8,
              fontSize: 13, background: "#fff", lineHeight: 1.8,
              fontFamily: "'Helvetica Neue', sans-serif", color: "#1a1a1a",
            }}
          />
          <button
            onClick={handleGenerate}
            disabled={!profileText.trim() || loading}
            style={{
              width: "100%", marginTop: 12, padding: "14px",
              background: profileText.trim() && !loading ? "#1a1a1a" : "#e0dbd0",
              color: profileText.trim() && !loading ? "#fff" : "#aaa",
              border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700,
              cursor: profileText.trim() && !loading ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}
          >
            {loading ? "生成中..." : "✦ スカウト文面を生成"}
          </button>

          {/* Sample button */}
          <button
            onClick={() => setProfileText(`田中 太郎
プロダクトマネージャー | 株式会社ABC

【経歴】
2018年〜現在　株式会社ABC　シニアプロダクトマネージャー
・MAU10万→50万のプロダクト成長を主導
・エンジニア・デザイナー10名のチームをリード
・新機能開発のロードマップ策定・実行

2015年〜2018年　株式会社XYZ　Webエンジニア
・Webサービスのフロントエンド開発

【スキル】
React / TypeScript / AWS / プロダクト戦略 / アジャイル開発

【学歴】
東京大学 工学部 卒業（2015年）`)}
            style={{
              width: "100%", marginTop: 8, padding: "10px",
              background: "transparent", border: "1px solid #e0dbd0",
              borderRadius: 6, fontSize: 12, color: "#aaa", cursor: "pointer",
            }}
          >
            サンプルを入れて試す
          </button>
        </div>

        {/* Right: Result */}
        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#999", textTransform: "uppercase", marginBottom: 12 }}>
            生成結果
          </div>

          {loading && (
            <div style={{ padding: "60px", textAlign: "center", background: "#fff", borderRadius: 8, border: "1px solid #ece8e0" }}>
              <div style={{ width: 32, height: 32, border: "2px solid #f0ece4", borderTop: "2px solid #f5a623", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
              <div style={{ fontSize: 13, color: "#aaa" }}>プロフィールを読み取って文面を生成中...</div>
            </div>
          )}

          {!loading && !result && (
            <div style={{ padding: "60px 40px", textAlign: "center", background: "#fff", borderRadius: 8, border: "1px dashed #e0dbd0", color: "#ccc", fontSize: 13, lineHeight: 1.8 }}>
              左にプロフィールを貼り付けて<br />「生成」ボタンを押してください
            </div>
          )}

          {!loading && result && (
            <div style={{ animation: "slideIn 0.4s ease" }}>
              {/* Subject */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, letterSpacing: 3, color: "#bbb", textTransform: "uppercase" }}>件名</span>
                  <button onClick={() => copy("subject", result.subject)} style={copyBtnStyle(copied.subject)}>
                    {copied.subject ? "✓ コピー済" : "コピー"}
                  </button>
                </div>
                <div style={{ padding: "14px 18px", background: "#fff", border: "1px solid #ece8e0", borderRadius: 8, fontSize: 13, lineHeight: 1.6, color: "#2a2a2a" }}>
                  {result.subject}
                </div>
              </div>

              {/* Body */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, letterSpacing: 3, color: "#bbb", textTransform: "uppercase" }}>本文</span>
                  <button onClick={() => copy("body", result.body)} style={copyBtnStyle(copied.body)}>
                    {copied.body ? "✓ コピー済" : "コピー"}
                  </button>
                </div>
                <div style={{ padding: "20px", background: "#fff", border: "1px solid #ece8e0", borderRadius: 8, fontSize: 13, lineHeight: 2, color: "#2a2a2a", whiteSpace: "pre-wrap" }}>
                  {result.body}
                </div>
              </div>

              {/* Copy all */}
              <button
                onClick={() => copy("all", `件名：${result.subject}\n\n${result.body}`)}
                style={{ width: "100%", padding: "12px", background: "#f5a623", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                {copied.all ? "✓ コピー済み" : "件名＋本文をまとめてコピー"}
              </button>

              {/* Regenerate */}
              <button
                onClick={handleGenerate}
                style={{ width: "100%", marginTop: 8, padding: "10px", background: "transparent", border: "1px solid #e0dbd0", borderRadius: 6, fontSize: 12, color: "#888", cursor: "pointer" }}
              >
                ↺ 再生成
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const copyBtnStyle = (copied) => ({
  padding: "4px 12px",
  background: copied ? "#f0fdf4" : "#f7f5f0",
  border: `1px solid ${copied ? "#86efac" : "#e0dbd0"}`,
  borderRadius: 4, fontSize: 11,
  color: copied ? "#16a34a" : "#888",
  cursor: "pointer",
});