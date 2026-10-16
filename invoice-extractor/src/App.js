import { useCallback, useEffect, useRef, useState } from "react";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    company_name: { type: ["string", "null"] },
    date: { type: ["string", "null"] },
    invoice_number: { type: ["string", "null"] },
    currency: { type: ["string", "null"] },
    subtotal: { type: ["number", "null"] },
    tax_amount: { type: ["number", "null"] },
    tax_rate: { type: ["string", "null"] },
    discount: { type: ["number", "null"] },
    total_amount: { type: ["number", "null"] },
    payment_method: { type: ["string", "null"] },
    vendor_address: { type: ["string", "null"] },
    vendor_phone: { type: ["string", "null"] },
    vendor_email: { type: ["string", "null"] },
    customer_name: { type: ["string", "null"] },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: ["number", "null"] },
          unit_price: { type: ["number", "null"] },
          total: { type: ["number", "null"] },
        },
        required: ["description", "quantity", "unit_price", "total"],
      },
    },
    notes: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: [
    "company_name",
    "date",
    "invoice_number",
    "currency",
    "subtotal",
    "tax_amount",
    "tax_rate",
    "discount",
    "total_amount",
    "payment_method",
    "vendor_address",
    "vendor_phone",
    "vendor_email",
    "customer_name",
    "line_items",
    "notes",
    "confidence",
  ],
};

const CHAT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    updated_result: {
      ...RESULT_SCHEMA,
      type: ["object", "null"],
    },
    suggested_tab: {
      type: "string",
      enum: ["json", "table", "export"],
    },
  },
  required: ["reply", "updated_result", "suggested_tab"],
};

const SYSTEM_PROMPT = `You are an expert invoice and receipt data extraction AI.

When given an invoice or receipt image, extract all structured data and return only valid JSON that matches the required schema.

Rules:
- Use null for fields that are not visible or not applicable.
- Extract as many line items as possible.
- Keep numeric values as numbers, not strings.
- Be precise and conservative.
- Confidence must be one of: high, medium, low.`;

const CHAT_SYSTEM_PROMPT = `You are an AI invoice workspace assistant.

You help the user edit, correct, enrich, and explain extracted invoice data.

Rules:
- If the user asks to modify the extracted data, return the full updated result in "updated_result".
- If the user only asks a question, answer in "reply" and set "updated_result" to null.
- Use the invoice image and current JSON as context.
- Do not invent unsupported details. If uncertain, say so briefly in "reply".
- Always return JSON only.`;

const THEMES = {
  dark: {
    colorScheme: "dark",
    background: "#07111f",
    backgroundAccent:
      "radial-gradient(circle at top left, rgba(29, 205, 159, 0.22), transparent 34%), radial-gradient(circle at top right, rgba(67, 97, 238, 0.16), transparent 28%), linear-gradient(180deg, #0a1428 0%, #09111d 100%)",
    panel: "rgba(9, 17, 31, 0.78)",
    panelStrong: "rgba(12, 23, 40, 0.92)",
    panelMuted: "rgba(255, 255, 255, 0.04)",
    border: "rgba(255, 255, 255, 0.12)",
    borderStrong: "rgba(29, 205, 159, 0.26)",
    text: "#f3f6fb",
    textMuted: "#9ca9bc",
    textDim: "#6f8096",
    accent: "#1dcd9f",
    accentSoft: "rgba(29, 205, 159, 0.14)",
    accentAlt: "#7cc8ff",
    shadow: "0 24px 80px rgba(2, 8, 18, 0.42)",
    inputBg: "rgba(255, 255, 255, 0.04)",
    danger: "#ff7b72",
    dangerSoft: "rgba(255, 123, 114, 0.14)",
    warning: "#ffd166",
    warningSoft: "rgba(255, 209, 102, 0.12)",
    emptyGlow: "rgba(29, 205, 159, 0.12)",
  },
  light: {
    colorScheme: "light",
    background: "#eef4ff",
    backgroundAccent:
      "radial-gradient(circle at top left, rgba(29, 205, 159, 0.22), transparent 34%), radial-gradient(circle at top right, rgba(0, 119, 182, 0.18), transparent 28%), linear-gradient(180deg, #f8fbff 0%, #ebf2ff 100%)",
    panel: "rgba(255, 255, 255, 0.9)",
    panelStrong: "rgba(255, 255, 255, 0.98)",
    panelMuted: "rgba(8, 15, 28, 0.04)",
    border: "rgba(8, 15, 28, 0.1)",
    borderStrong: "rgba(29, 205, 159, 0.28)",
    text: "#0d1b2a",
    textMuted: "#55657a",
    textDim: "#72839b",
    accent: "#0f9d7b",
    accentSoft: "rgba(15, 157, 123, 0.12)",
    accentAlt: "#0077b6",
    shadow: "0 24px 60px rgba(39, 76, 119, 0.12)",
    inputBg: "rgba(8, 15, 28, 0.04)",
    danger: "#d64545",
    dangerSoft: "rgba(214, 69, 69, 0.1)",
    warning: "#b7791f",
    warningSoft: "rgba(183, 121, 31, 0.1)",
    emptyGlow: "rgba(0, 119, 182, 0.1)",
  },
};

const RESULT_FIELDS = [
  ["Şirkət", "company_name"],
  ["Tarix", "date"],
  ["Faktura №", "invoice_number"],
  ["Cəmi", "total_amount"],
  ["Ara cəm", "subtotal"],
  ["Vergi", "tax_amount"],
  ["Vergi faizi", "tax_rate"],
  ["Endirim", "discount"],
  ["Ödəniş", "payment_method"],
  ["Müştəri", "customer_name"],
  ["Telefon", "vendor_phone"],
  ["Email", "vendor_email"],
  ["Ünvan", "vendor_address"],
  ["Qeyd", "notes"],
];

const CHAT_STARTER_MESSAGE = {
  role: "assistant",
  text: "Mən bu qəbz üçün AI chatbot kimi işləyə bilərəm. Məsələn yaz: `ƏDV hissəsini cədvələ əlavə et`, `line item-ları düzəlt`, `vendor ünvanını tap`.",
};

const CHAT_SUGGESTIONS = [
  "ƏDV hissəsini cədvələ əlavə et",
  "Line item-ları daha dəqiq düzəlt",
  "Vendor ünvanını və telefonu tap",
];

function buildImagePart(imageBase64, imageMime) {
  return {
    inline_data: {
      mime_type: imageMime,
      data: imageBase64,
    },
  };
}

function extractGeminiText(data) {
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || ""
  );
}

async function callGemini({ systemPrompt, promptText, imageBase64, imageMime, responseJsonSchema, maxOutputTokens }) {
  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [
          { text: promptText },
          ...(imageBase64 ? [buildImagePart(imageBase64, imageMime)] : []),
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema,
      maxOutputTokens,
      temperature: 0.2,
    },
  };

  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || `HTTP ${response.status}`);
  }

  const text = extractGeminiText(data).trim();
  if (!text) {
    throw new Error("Gemini boş cavab qaytardı.");
  }

  return JSON.parse(text);
}

export default function App() {
  const [mode, setMode] = useState(() => {
    const savedMode = window.localStorage.getItem("invoice-extractor-theme");
    return savedMode === "light" ? "light" : "dark";
  });
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMime, setImageMime] = useState("image/jpeg");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState("json");
  const [copied, setCopied] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([CHAT_STARTER_MESSAGE]);
  const fileInputRef = useRef(null);

  const theme = THEMES[mode];

  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.background = theme.background;
    document.body.style.color = theme.text;
    document.documentElement.style.colorScheme = theme.colorScheme;
    window.localStorage.setItem("invoice-extractor-theme", mode);
  }, [mode, theme]);

  const processFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Zəhmət olmasa şəkil faylı seçin: JPG, PNG və ya WEBP.");
      return;
    }

    setError(null);
    setResult(null);
    setChatInput("");
    setChatMessages([CHAT_STARTER_MESSAGE]);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (typeof dataUrl !== "string") {
        setError("Şəkil oxunarkən problem yarandı.");
        return;
      }

      setImage(dataUrl);
      setImageBase64(dataUrl.split(",")[1]);
      setImageMime(file.type);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      setDragOver(false);
      processFile(event.dataTransfer.files[0]);
    },
    [processFile]
  );

  const extractData = async () => {
    if (!imageBase64) return;

    if (!API_KEY) {
      setError("`.env` faylında `REACT_APP_GEMINI_API_KEY` təyin edilməyib.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const parsed = await callGemini({
        systemPrompt: SYSTEM_PROMPT,
        promptText:
          "Extract all invoice or receipt data from this image and return JSON only according to the schema.",
        imageBase64,
        imageMime,
        responseJsonSchema: RESULT_SCHEMA,
        maxOutputTokens: 4096,
      });

      setResult(parsed);
      setActiveTab("json");
      setChatMessages([
        CHAT_STARTER_MESSAGE,
        {
          role: "assistant",
          text: "Nəticə hazırdır. İndi mənə bu qəbzdə nəyi əlavə etmək, dəyişmək və ya izah etmək istədiyini yaza bilərsən.",
        },
      ]);
    } catch (err) {
      setError(`Xəta: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setImage(null);
    setImageBase64(null);
    setResult(null);
    setError(null);
    setCopied(false);
    setChatInput("");
    setChatMessages([CHAT_STARTER_MESSAGE]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const downloadJSON = () => {
    if (!result) return;

    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "invoice_data.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    if (!result) return;

    const rows = [["Field", "Value"]];
    const flat = { ...result };
    delete flat.line_items;

    Object.entries(flat).forEach(([key, value]) => rows.push([key, value ?? ""]));

    if (result.line_items?.length) {
      rows.push(["", ""]);
      rows.push(["Line Items", ""]);
      rows.push(["Description", "Qty", "Unit Price", "Total"]);
      result.line_items.forEach((item) =>
        rows.push([item.description, item.quantity ?? "", item.unit_price ?? "", item.total ?? ""])
      );
    }

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "invoice_data.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyJSON = async () => {
    if (!result) return;

    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(`Kopyalama alınmadı: ${err.message}`);
    }
  };

  const sendChatMessage = async () => {
    const prompt = chatInput.trim();
    if (!prompt || chatLoading) return;

    if (!API_KEY) {
      setError("Chat üçün `.env` faylında `REACT_APP_GEMINI_API_KEY` lazımdır.");
      return;
    }

    if (!imageBase64 && !result) {
      setError("Əvvəlcə qəbz və ya faktura şəkli yüklə.");
      return;
    }

    const nextMessages = [...chatMessages, { role: "user", text: prompt }];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);
    setError(null);

    const historyText = nextMessages
      .slice(-6)
      .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.text}`)
      .join("\n");

    try {
      const parsed = await callGemini({
        systemPrompt: CHAT_SYSTEM_PROMPT,
        promptText: [
          "Current extracted JSON:",
          JSON.stringify(result, null, 2),
          "",
          "Recent chat history:",
          historyText,
          "",
          `Latest user request: ${prompt}`,
        ].join("\n"),
        imageBase64,
        imageMime,
        responseJsonSchema: CHAT_RESPONSE_SCHEMA,
        maxOutputTokens: 4096,
      });

      if (parsed?.updated_result && typeof parsed.updated_result === "object") {
        setResult(parsed.updated_result);
      }

      if (parsed?.suggested_tab && ["json", "table", "export"].includes(parsed.suggested_tab)) {
        setActiveTab(parsed.suggested_tab);
      } else if (parsed?.updated_result) {
        setActiveTab("table");
      }

      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: parsed?.reply || (parsed?.updated_result ? "Dəyişiklik tətbiq olundu." : "Hazırdır."),
        },
      ]);
    } catch (err) {
      setError(`Chat xətası: ${err.message}`);
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: "Sorğunu emal edə bilmədim. Zəhmət olmasa yenidən yoxla.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const confidenceColor =
    {
      high: theme.accent,
      medium: theme.warning,
      low: theme.danger,
    }[result?.confidence] || theme.textDim;

  const resultRows = result
    ? RESULT_FIELDS.map(([label, key]) => {
        const value = result[key];
        if (value == null) return null;

        if (["total_amount", "subtotal", "discount"].includes(key)) {
          return [label, `${value} ${result.currency || ""}`.trim()];
        }

        if (key === "tax_amount") {
          return [label, `${value}${result.tax_rate ? ` (${result.tax_rate})` : ""}`];
        }

        return [label, String(value)];
      }).filter(Boolean)
    : [];

  return (
    <div
      style={{
        ...styles.root,
        background: theme.background,
        color: theme.text,
        "--bg-accent": theme.backgroundAccent,
        "--panel": theme.panel,
        "--panel-strong": theme.panelStrong,
        "--panel-muted": theme.panelMuted,
        "--border": theme.border,
        "--border-strong": theme.borderStrong,
        "--text": theme.text,
        "--text-muted": theme.textMuted,
        "--text-dim": theme.textDim,
        "--accent": theme.accent,
        "--accent-soft": theme.accentSoft,
        "--accent-alt": theme.accentAlt,
        "--shadow": theme.shadow,
        "--input-bg": theme.inputBg,
        "--danger": theme.danger,
        "--danger-soft": theme.dangerSoft,
        "--warning": theme.warning,
        "--warning-soft": theme.warningSoft,
        "--empty-glow": theme.emptyGlow,
      }}
    >
      <div style={styles.backgroundLayer} />
      <div style={styles.orbLeft} />
      <div style={styles.orbRight} />

      <div style={styles.container}>
        <header className="hero-grid" style={styles.hero}>
          <div style={styles.heroCopy}>
            <div style={styles.eyebrowRow}>
              <span style={styles.badge}>Invoice AI</span>
              <span style={styles.softLabel}>Gemini powered workspace</span>
            </div>

            <h1 style={styles.heading}>Fakturanı yüklə, strukturlaşdırılmış nəticəni dərhal götür.</h1>
            <p style={styles.subheading}>
              Şəkildən məbləğ, tarix, satır məhsullar və digər sahələri çıxar, sonra JSON və ya CSV kimi ixrac et.
            </p>

            <div style={styles.heroMetaRow}>
              <div style={styles.heroMetaCard}>
                <span style={styles.heroMetaTitle}>Formatlar</span>
                <span style={styles.heroMetaValue}>JSON, cədvəl, CSV</span>
              </div>
              <div style={styles.heroMetaCard}>
                <span style={styles.heroMetaTitle}>Model</span>
                <span style={styles.heroMetaValue}>Gemini 2.5 Flash</span>
              </div>
            </div>
          </div>

          <div style={styles.heroActions}>
            <button onClick={() => setMode(mode === "dark" ? "light" : "dark")} style={styles.themeToggle}>
              <span style={styles.themeToggleKnob}>{mode === "dark" ? "☾" : "☀"}</span>
              <span>{mode === "dark" ? "Night mode" : "Light mode"}</span>
            </button>

            <div style={styles.statusCard}>
              <span style={styles.statusLabel}>Hazır vəziyyət</span>
              <strong style={styles.statusValue}>{image ? "Şəkil yüklənib" : "Yükləmə gözlənilir"}</strong>
              <span style={styles.statusHint}>Drag & drop və ya klik ilə şəkil əlavə et.</span>
            </div>
          </div>
        </header>

        {!API_KEY && (
          <div style={styles.warningBox}>
            <strong>API açarı tapılmadı.</strong> Proyekt qovluğunda `.env` yaradıb `REACT_APP_GEMINI_API_KEY`
            dəyərini əlavə et.
          </div>
        )}

        <section style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.sectionHeader}>
              <div>
                <div style={styles.sectionEyebrow}>Upload</div>
                <h2 style={styles.sectionTitle}>Sənəd görüntüsü</h2>
              </div>
              {image && (
                <button onClick={resetAll} style={styles.subtleButton}>
                  Təmizlə
                </button>
              )}
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => !image && fileInputRef.current?.click()}
              style={{
                ...styles.dropzone,
                borderColor: dragOver ? theme.accent : image ? theme.borderStrong : theme.border,
                background: dragOver ? theme.accentSoft : theme.inputBg,
                cursor: image ? "default" : "pointer",
              }}
            >
              {image ? (
                <div style={styles.previewWrap}>
                  <img src={image} alt="Invoice preview" style={styles.previewImage} />
                  <div style={styles.previewOverlay}>
                    <button onClick={() => fileInputRef.current?.click()} style={styles.primaryGhostButton}>
                      Başqa şəkil seç
                    </button>
                  </div>
                </div>
              ) : (
                <div style={styles.dropzoneEmpty}>
                  <div style={styles.uploadIcon}>▣</div>
                  <div style={styles.dropzoneTitle}>Şəkli bura sürüşdür və ya kliklə yüklə</div>
                  <div style={styles.dropzoneHint}>JPG, PNG, WEBP formatları dəstəklənir</div>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => processFile(event.target.files[0])}
              style={{ display: "none" }}
            />

            <div className="action-grid" style={styles.actionRow}>
              <button
                onClick={extractData}
                disabled={!imageBase64 || loading}
                style={{
                  ...styles.primaryButton,
                  opacity: !imageBase64 || loading ? 0.45 : 1,
                  cursor: !imageBase64 || loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Analiz gedir..." : "Məlumatları çıxar"}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={styles.secondaryButton}
                disabled={loading}
              >
                Fayl seç
              </button>
            </div>

            {error && <div style={styles.errorBox}>{error}</div>}
          </div>

          <div style={styles.card}>
            <div style={styles.sectionHeader}>
              <div>
                <div style={styles.sectionEyebrow}>Output</div>
                <h2 style={styles.sectionTitle}>Analiz nəticəsi</h2>
              </div>
              {result && (
                <div style={styles.confidenceBadge}>
                  <span style={{ color: confidenceColor }}>●</span>
                  <span>{result.confidence || "unknown"}</span>
                </div>
              )}
            </div>

            {!result && !loading && (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>◎</div>
                <div style={styles.emptyTitle}>Nəticə paneli hazırdır</div>
                <div style={styles.emptyText}>Şəkil yüklə və analiz et, strukturlaşdırılmış cavab burada görünəcək.</div>
              </div>
            )}

            {loading && (
              <div style={styles.loadingBox}>
                <div style={styles.loadingPulse} />
                <div style={styles.loadingTitle}>Gemini sənədi oxuyur</div>
                <div style={styles.loadingText}>Mətn çıxarılır, sahələr düzülür və JSON hazırlanır.</div>
              </div>
            )}

            {result && (
              <>
                <div style={styles.tabBar}>
                  {[
                    ["json", "JSON"],
                    ["table", "Cədvəl"],
                    ["export", "İxrac"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      style={{
                        ...styles.tabButton,
                        background: activeTab === id ? theme.panelMuted : "transparent",
                        color: activeTab === id ? theme.text : theme.textMuted,
                        borderColor: activeTab === id ? theme.borderStrong : "transparent",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {activeTab === "json" && <pre style={styles.jsonPanel}>{JSON.stringify(result, null, 2)}</pre>}

                {activeTab === "table" && (
                  <div style={styles.tablePanel}>
                    <div style={styles.resultGrid}>
                      {resultRows.map(([label, value]) => (
                        <div key={label} style={styles.resultItem}>
                          <span style={styles.resultLabel}>{label}</span>
                          <span style={styles.resultValue}>{value}</span>
                        </div>
                      ))}
                    </div>

                    {result.line_items?.length > 0 && (
                      <div style={styles.lineItemsSection}>
                        <div style={styles.lineItemsTitle}>Məhsul sətirləri</div>
                        <div style={styles.lineItemsTable}>
                          <div className="line-items-grid" style={styles.lineItemsHead}>
                            <span>Təsvir</span>
                            <span>Miqdar</span>
                            <span>Qiymət</span>
                            <span>Cəmi</span>
                          </div>
                          {result.line_items.map((item, index) => (
                            <div className="line-items-grid" key={`${item.description}-${index}`} style={styles.lineItemsRow}>
                              <span>{item.description || "-"}</span>
                              <span>{item.quantity ?? "-"}</span>
                              <span>{item.unit_price ?? "-"}</span>
                              <span>{item.total ?? "-"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "export" && (
                  <div style={styles.exportPanel}>
                    <button onClick={downloadJSON} style={styles.exportButtonPrimary}>
                      JSON yüklə
                    </button>
                    <button onClick={downloadCSV} style={styles.exportButtonSecondary}>
                      CSV yüklə
                    </button>
                    <button onClick={copyJSON} style={styles.exportButtonMuted}>
                      {copied ? "JSON kopyalandı" : "JSON-u kopyala"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section style={styles.chatSection}>
          <div style={styles.chatHeader}>
            <div>
              <div style={styles.sectionEyebrow}>AI Chat</div>
              <h2 style={styles.sectionTitle}>Qəbz üzərində əmrlərlə işləyən chatbot</h2>
            </div>
            <div style={styles.chatStatus}>{chatLoading ? "Gemini cavab yazır..." : "Hazırdır"}</div>
          </div>

          <div style={styles.chatSuggestionRow}>
            {CHAT_SUGGESTIONS.map((suggestion) => (
              <button key={suggestion} onClick={() => setChatInput(suggestion)} style={styles.chatSuggestionButton}>
                {suggestion}
              </button>
            ))}
          </div>

          <div style={styles.chatMessagesPanel}>
            {chatMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                style={{
                  ...styles.chatBubble,
                  ...(message.role === "user" ? styles.chatBubbleUser : styles.chatBubbleAssistant),
                }}
              >
                <div style={styles.chatBubbleRole}>{message.role === "user" ? "Sən" : "AI assistant"}</div>
                <div style={styles.chatBubbleText}>{message.text}</div>
              </div>
            ))}
          </div>

          <div className="action-grid" style={styles.chatComposer}>
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Məsələn: qəbzdəki vergi hissəsini cədvələ əlavə et və line item-ları yenilə"
              style={styles.chatTextarea}
              rows={4}
            />
            <button
              onClick={sendChatMessage}
              disabled={chatLoading || !chatInput.trim()}
              style={{
                ...styles.chatSendButton,
                opacity: chatLoading || !chatInput.trim() ? 0.5 : 1,
                cursor: chatLoading || !chatInput.trim() ? "not-allowed" : "pointer",
              }}
            >
              {chatLoading ? "Göndərilir..." : "Sorğunu göndər"}
            </button>
          </div>
        </section>
      </div>

      <style>{`
        * {
          box-sizing: border-box;
        }

        button,
        textarea {
          font: inherit;
        }

        @keyframes pulse {
          0% { transform: scale(0.92); opacity: 0.7; }
          50% { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(0.92); opacity: 0.7; }
        }

        @media (max-width: 900px) {
          .hero-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 640px) {
          .action-grid {
            grid-template-columns: 1fr !important;
          }

          .line-items-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  backgroundLayer: {
    position: "fixed",
    inset: 0,
    background: "var(--bg-accent)",
    pointerEvents: "none",
  },
  orbLeft: {
    position: "fixed",
    top: -120,
    left: -90,
    width: 280,
    height: 280,
    borderRadius: "50%",
    background: "rgba(29, 205, 159, 0.12)",
    filter: "blur(20px)",
    pointerEvents: "none",
  },
  orbRight: {
    position: "fixed",
    bottom: -100,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: "50%",
    background: "rgba(124, 200, 255, 0.12)",
    filter: "blur(20px)",
    pointerEvents: "none",
  },
  container: {
    position: "relative",
    zIndex: 1,
    maxWidth: 1220,
    margin: "0 auto",
    padding: "40px 20px 48px",
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.7fr)",
    gap: 20,
    alignItems: "stretch",
    marginBottom: 24,
  },
  heroCopy: {
    padding: "30px",
    borderRadius: 28,
    background: "var(--panel)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow)",
    backdropFilter: "blur(18px)",
  },
  eyebrowRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    marginBottom: 18,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 14px",
    borderRadius: 999,
    background: "var(--accent-soft)",
    color: "var(--accent)",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  softLabel: {
    color: "var(--text-dim)",
    fontSize: 13,
  },
  heading: {
    margin: "0 0 12px",
    fontSize: "clamp(34px, 5vw, 58px)",
    lineHeight: 1.02,
    letterSpacing: -1.8,
    maxWidth: 620,
  },
  subheading: {
    margin: 0,
    maxWidth: 580,
    color: "var(--text-muted)",
    lineHeight: 1.7,
    fontSize: 16,
  },
  heroMetaRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 14,
    marginTop: 24,
  },
  heroMetaCard: {
    padding: "16px 18px",
    borderRadius: 20,
    background: "var(--panel-muted)",
    border: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  heroMetaTitle: {
    color: "var(--text-dim)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  heroMetaValue: {
    fontSize: 15,
    fontWeight: 600,
  },
  heroActions: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  themeToggle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "14px 18px",
    borderRadius: 22,
    border: "1px solid var(--border)",
    background: "var(--panel)",
    color: "var(--text)",
    boxShadow: "var(--shadow)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    backdropFilter: "blur(18px)",
  },
  themeToggleKnob: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--accent-soft)",
    color: "var(--accent)",
    fontSize: 16,
  },
  statusCard: {
    padding: "22px",
    borderRadius: 24,
    background: "var(--panel)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    backdropFilter: "blur(18px)",
  },
  statusLabel: {
    fontSize: 12,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  statusValue: {
    fontSize: 20,
    lineHeight: 1.2,
  },
  statusHint: {
    color: "var(--text-muted)",
    fontSize: 14,
    lineHeight: 1.6,
  },
  warningBox: {
    marginBottom: 24,
    padding: "16px 18px",
    borderRadius: 18,
    border: "1px solid var(--warning)",
    background: "var(--warning-soft)",
    color: "var(--warning)",
    boxShadow: "var(--shadow)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
  },
  card: {
    padding: "24px",
    borderRadius: 28,
    background: "var(--panel)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow)",
    backdropFilter: "blur(18px)",
    minWidth: 0,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 20,
  },
  sectionEyebrow: {
    fontSize: 12,
    color: "var(--text-dim)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 24,
    lineHeight: 1.15,
  },
  subtleButton: {
    border: "1px solid var(--border)",
    background: "var(--panel-muted)",
    color: "var(--text)",
    borderRadius: 14,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 600,
  },
  dropzone: {
    minHeight: 340,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 24,
    transition: "all 0.2s ease",
    overflow: "hidden",
  },
  dropzoneEmpty: {
    minHeight: 340,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "32px",
  },
  uploadIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--accent-soft)",
    color: "var(--accent)",
    fontSize: 28,
    marginBottom: 20,
  },
  dropzoneTitle: {
    fontSize: 20,
    fontWeight: 700,
    maxWidth: 320,
    lineHeight: 1.35,
  },
  dropzoneHint: {
    marginTop: 10,
    color: "var(--text-muted)",
    fontSize: 14,
  },
  previewWrap: {
    position: "relative",
    height: "100%",
    minHeight: 340,
  },
  previewImage: {
    width: "100%",
    height: "100%",
    minHeight: 340,
    objectFit: "contain",
    display: "block",
    background: "var(--panel-strong)",
  },
  previewOverlay: {
    position: "absolute",
    inset: "auto 16px 16px auto",
  },
  primaryGhostButton: {
    border: "1px solid var(--border-strong)",
    background: "var(--panel)",
    color: "var(--text)",
    borderRadius: 14,
    padding: "11px 15px",
    cursor: "pointer",
    fontWeight: 600,
  },
  actionRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 12,
    marginTop: 18,
  },
  primaryButton: {
    border: "none",
    borderRadius: 16,
    padding: "15px 18px",
    background: "linear-gradient(135deg, var(--accent), var(--accent-alt))",
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 700,
  },
  secondaryButton: {
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "15px 18px",
    background: "var(--panel-muted)",
    color: "var(--text)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  errorBox: {
    marginTop: 16,
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid var(--danger)",
    background: "var(--danger-soft)",
    color: "var(--danger)",
    lineHeight: 1.6,
    fontSize: 14,
  },
  confidenceBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 999,
    background: "var(--panel-muted)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    textTransform: "capitalize",
    fontSize: 13,
  },
  emptyState: {
    minHeight: 340,
    borderRadius: 24,
    border: "1px solid var(--border)",
    background: "linear-gradient(180deg, var(--panel-muted), transparent)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "36px",
    boxShadow: "inset 0 0 0 1px var(--empty-glow)",
  },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--accent-soft)",
    color: "var(--accent)",
    fontSize: 28,
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 700,
  },
  emptyText: {
    marginTop: 10,
    color: "var(--text-muted)",
    maxWidth: 320,
    lineHeight: 1.7,
  },
  loadingBox: {
    minHeight: 340,
    borderRadius: 24,
    border: "1px solid var(--border)",
    background: "linear-gradient(180deg, var(--panel-muted), transparent)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "36px",
  },
  loadingPulse: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: "radial-gradient(circle, var(--accent-soft), transparent 65%)",
    marginBottom: 18,
    animation: "pulse 1.8s ease-in-out infinite",
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: 700,
  },
  loadingText: {
    marginTop: 10,
    maxWidth: 320,
    color: "var(--text-muted)",
    lineHeight: 1.7,
  },
  tabBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  tabButton: {
    padding: "11px 16px",
    borderRadius: 14,
    border: "1px solid transparent",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  },
  jsonPanel: {
    margin: 0,
    padding: "18px",
    borderRadius: 20,
    background: "var(--panel-strong)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    overflowX: "auto",
    maxHeight: 520,
    lineHeight: 1.65,
    fontSize: 13,
  },
  tablePanel: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 12,
  },
  resultItem: {
    padding: "14px",
    borderRadius: 18,
    border: "1px solid var(--border)",
    background: "var(--panel-muted)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
  },
  resultLabel: {
    fontSize: 12,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  resultValue: {
    fontSize: 15,
    fontWeight: 600,
    overflowWrap: "anywhere",
  },
  lineItemsSection: {
    padding: "16px",
    borderRadius: 20,
    border: "1px solid var(--border)",
    background: "var(--panel-strong)",
  },
  lineItemsTitle: {
    marginBottom: 12,
    fontSize: 15,
    fontWeight: 700,
  },
  lineItemsTable: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    overflowX: "auto",
  },
  lineItemsHead: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 2fr) repeat(3, minmax(70px, 1fr))",
    gap: 12,
    padding: "0 6px",
    color: "var(--text-dim)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  lineItemsRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 2fr) repeat(3, minmax(70px, 1fr))",
    gap: 12,
    padding: "14px 12px",
    borderRadius: 16,
    background: "var(--panel-muted)",
    border: "1px solid var(--border)",
    fontSize: 14,
    alignItems: "center",
  },
  exportPanel: {
    display: "grid",
    gap: 12,
  },
  exportButtonPrimary: {
    padding: "15px 18px",
    borderRadius: 16,
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent-alt))",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
  },
  exportButtonSecondary: {
    padding: "15px 18px",
    borderRadius: 16,
    border: "1px solid var(--border)",
    background: "var(--panel-muted)",
    color: "var(--text)",
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
  },
  exportButtonMuted: {
    padding: "15px 18px",
    borderRadius: 16,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text-muted)",
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
  },
  chatSection: {
    marginTop: 20,
    padding: "24px",
    borderRadius: 28,
    background: "var(--panel)",
    border: "1px solid var(--border)",
    boxShadow: "var(--shadow)",
    backdropFilter: "blur(18px)",
  },
  chatHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },
  chatStatus: {
    padding: "10px 12px",
    borderRadius: 999,
    background: "var(--panel-muted)",
    border: "1px solid var(--border)",
    color: "var(--text-muted)",
    fontSize: 13,
    fontWeight: 600,
  },
  chatSuggestionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  chatSuggestionButton: {
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "var(--panel-muted)",
    color: "var(--text)",
    cursor: "pointer",
    fontSize: 13,
  },
  chatMessagesPanel: {
    display: "grid",
    gap: 12,
    marginBottom: 16,
  },
  chatBubble: {
    maxWidth: "820px",
    padding: "14px 16px",
    borderRadius: 18,
    border: "1px solid var(--border)",
  },
  chatBubbleAssistant: {
    background: "var(--panel-muted)",
  },
  chatBubbleUser: {
    background: "var(--accent-soft)",
    marginLeft: "auto",
  },
  chatBubbleRole: {
    fontSize: 12,
    color: "var(--text-dim)",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  chatBubbleText: {
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
  },
  chatComposer: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 12,
    alignItems: "stretch",
  },
  chatTextarea: {
    width: "100%",
    resize: "vertical",
    minHeight: 110,
    padding: "16px",
    borderRadius: 18,
    border: "1px solid var(--border)",
    background: "var(--panel-strong)",
    color: "var(--text)",
    outline: "none",
    lineHeight: 1.6,
  },
  chatSendButton: {
    alignSelf: "stretch",
    minWidth: 180,
    padding: "16px 18px",
    borderRadius: 18,
    border: "none",
    background: "linear-gradient(135deg, var(--accent), var(--accent-alt))",
    color: "#ffffff",
    fontWeight: 700,
  },
};
