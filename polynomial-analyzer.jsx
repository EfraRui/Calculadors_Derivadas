import { useState, useCallback, useRef, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from "recharts";

// ── Polynomial engine ────────────────────────────────────────────────────────

function parsePolynomial(expr) {
  // Normalize: lowercase, remove spaces, replace ** with ^
  let s = expr.replace(/\s+/g, "").replace(/\*\*/g, "^").toLowerCase();

  const terms = {};

  // Match terms like: 3x^4, -x^2, 5x, -7, +2x^3
  const regex = /([+-]?\d*\.?\d*)\*?x\^?([+-]?\d+\.?\d*)|([+-]?\d*\.?\d*)\*?x(?!\^)|([+-]?\d+\.?\d*)/g;
  let match;
  let lastIndex = 0;
  let found = false;

  // rebuild to handle leading sign
  const normalized = s.replace(/^([^+-])/, "+$1");

  const termRegex = /([+-])(\d*\.?\d*)\*?x\^([+-]?\d+\.?\d*)|([+-])(\d*\.?\d*)\*?x(?!\^)|([+-]\d+\.?\d*)/g;

  while ((match = termRegex.exec(normalized)) !== null) {
    found = true;
    if (match[1] !== undefined) {
      // x^n term
      const sign = match[1] === "+" ? 1 : -1;
      const coef = match[2] === "" || match[2] === undefined ? 1 : parseFloat(match[2]);
      const exp = parseFloat(match[3]);
      terms[exp] = (terms[exp] || 0) + sign * coef;
    } else if (match[4] !== undefined) {
      // x^1 term
      const sign = match[4] === "+" ? 1 : -1;
      const coef = match[5] === "" || match[5] === undefined ? 1 : parseFloat(match[5]);
      terms[1] = (terms[1] || 0) + sign * coef;
    } else if (match[6] !== undefined) {
      // constant term
      const val = parseFloat(match[6]);
      terms[0] = (terms[0] || 0) + val;
    }
  }

  if (!found) throw new Error("No se pudo interpretar la expresión.");
  return terms; // { exponent: coefficient }
}

function evalPoly(terms, x) {
  return Object.entries(terms).reduce((sum, [exp, coef]) => {
    return sum + coef * Math.pow(x, parseFloat(exp));
  }, 0);
}

function derivePoly(terms) {
  const d = {};
  for (const [exp, coef] of Object.entries(terms)) {
    const e = parseFloat(exp);
    if (e === 0) continue;
    const newExp = e - 1;
    d[newExp] = (d[newExp] || 0) + coef * e;
  }
  return d;
}

function polyToString(terms) {
  const keys = Object.keys(terms).map(Number).sort((a, b) => b - a);
  if (keys.length === 0) return "0";

  return keys
    .map((exp, i) => {
      const coef = terms[exp];
      if (coef === 0) return null;
      const sign = coef < 0 ? (i === 0 ? "−" : " − ") : i === 0 ? "" : " + ";
      const absC = Math.abs(coef);
      const cStr = absC === 1 && exp !== 0 ? "" : String(Number(absC.toFixed(4)));
      const xPart = exp === 0 ? "" : exp === 1 ? "x" : `x^${exp}`;
      return `${sign}${cStr}${xPart}`;
    })
    .filter(Boolean)
    .join("") || "0";
}

function findRoots(terms, xMin, xMax, steps = 2000) {
  const roots = [];
  const dx = (xMax - xMin) / steps;
  let prev = evalPoly(terms, xMin);

  for (let i = 1; i <= steps; i++) {
    const x = xMin + i * dx;
    const curr = evalPoly(terms, x);
    if (prev * curr <= 0) {
      // bisection
      let lo = x - dx, hi = x;
      for (let j = 0; j < 50; j++) {
        const mid = (lo + hi) / 2;
        const fMid = evalPoly(terms, mid);
        if (Math.abs(fMid) < 1e-10) { lo = hi = mid; break; }
        if (evalPoly(terms, lo) * fMid < 0) hi = mid; else lo = mid;
      }
      const root = (lo + hi) / 2;
      if (roots.every(r => Math.abs(r - root) > 0.001)) roots.push(root);
    }
    prev = curr;
  }
  return roots;
}

// ── Component ─────────────────────────────────────────────────────────────────

const EXAMPLES = [
  "x^3 - 3x^2 - x + 3",
  "2x^4 - 8x^2",
  "x^2 - 5x + 6",
  "x^3 - 6x^2 + 11x - 6",
  "-x^4 + 4x^2",
];

export default function App() {
  const [input, setInput] = useState("x^3 - 3x^2 - x + 3");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [xMin, setXMin] = useState(-5);
  const [xMax, setXMax] = useState(5);
  const [showD1, setShowD1] = useState(true);
  const [showD2, setShowD2] = useState(true);
  const [activeTab, setActiveTab] = useState("graph");

  const analyze = useCallback(() => {
    try {
      setError("");
      const terms = parsePolynomial(input);
      const d1 = derivePoly(terms);
      const d2 = derivePoly(d1);

      const pts = 600;
      const dx = (xMax - xMin) / pts;
      const data = Array.from({ length: pts + 1 }, (_, i) => {
        const x = xMin + i * dx;
        const y = evalPoly(terms, x);
        const y1 = evalPoly(d1, x);
        const y2 = evalPoly(d2, x);
        return {
          x: parseFloat(x.toFixed(4)),
          f: isFinite(y) ? parseFloat(y.toFixed(6)) : null,
          f1: isFinite(y1) ? parseFloat(y1.toFixed(6)) : null,
          f2: isFinite(y2) ? parseFloat(y2.toFixed(6)) : null,
        };
      });

      const roots = findRoots(terms, xMin, xMax);
      const criticals = findRoots(d1, xMin, xMax);
      const inflections = findRoots(d2, xMin, xMax);

      setResult({
        terms, d1, d2,
        strF: polyToString(terms),
        strD1: polyToString(d1),
        strD2: polyToString(d2),
        data, roots, criticals, inflections,
      });
    } catch (e) {
      setError(e.message);
      setResult(null);
    }
  }, [input, xMin, xMax]);

  useEffect(() => { analyze(); }, []);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: "#0d1117", border: "1px solid #30363d",
        padding: "10px 14px", borderRadius: 8, fontSize: 13,
        fontFamily: "monospace", color: "#e6edf3",
      }}>
        <div style={{ color: "#7d8590", marginBottom: 4 }}>x = {label}</div>
        {payload.map(p => (
          <div key={p.name} style={{ color: p.color }}>
            {p.name} = {p.value?.toFixed(4)}
          </div>
        ))}
      </div>
    );
  };

  const yValues = result?.data.flatMap(d => [d.f, d.f1, d.f2]).filter(v => v !== null && isFinite(v)) ?? [];
  const yPad = 0.1;
  const yMin = yValues.length ? Math.min(...yValues) * (1 + yPad) : -10;
  const yMax = yValues.length ? Math.max(...yValues) * (1 + yPad) : 10;

  return (
    <div style={{
      minHeight: "100vh", background: "#0d1117",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      color: "#e6edf3", padding: "0",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #21262d",
        padding: "20px 32px",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: "linear-gradient(135deg, #58a6ff, #bc8cff)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, fontWeight: 700,
        }}>∂</div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.3px" }}>
            Analizador Polinomial
          </div>
          <div style={{ fontSize: 12, color: "#7d8590", marginTop: 2 }}>
            f(x) → f′(x) → f″(x) · raíces · puntos críticos
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>

        {/* Input row */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label style={{ fontSize: 11, color: "#7d8590", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              f(x) = 
            </label>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && analyze()}
              placeholder="ej: x^3 - 3x^2 + 2"
              style={{
                width: "100%", background: "#161b22",
                border: "1px solid #30363d", borderRadius: 8,
                color: "#e6edf3", padding: "10px 14px",
                fontSize: 15, fontFamily: "inherit", outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={e => e.target.style.borderColor = "#58a6ff"}
              onBlur={e => e.target.style.borderColor = "#30363d"}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {[["x mín", xMin, setXMin], ["x máx", xMax, setXMax]].map(([lbl, val, set]) => (
              <div key={lbl}>
                <label style={{ fontSize: 11, color: "#7d8590", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{lbl}</label>
                <input
                  type="number"
                  value={val}
                  onChange={e => set(parseFloat(e.target.value))}
                  style={{
                    width: 80, background: "#161b22",
                    border: "1px solid #30363d", borderRadius: 8,
                    color: "#e6edf3", padding: "10px 10px",
                    fontSize: 14, fontFamily: "inherit", outline: "none",
                  }}
                />
              </div>
            ))}
          </div>

          <button
            onClick={analyze}
            style={{
              background: "linear-gradient(135deg, #1f6feb, #58a6ff)",
              border: "none", borderRadius: 8,
              color: "#fff", padding: "10px 24px",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", letterSpacing: "0.03em",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={e => e.target.style.opacity = "0.85"}
            onMouseLeave={e => e.target.style.opacity = "1"}
          >
            Analizar ↵
          </button>
        </div>

        {/* Examples */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
          <span style={{ fontSize: 11, color: "#7d8590", marginRight: 4, lineHeight: "26px" }}>Ejemplos:</span>
          {EXAMPLES.map(ex => (
            <button key={ex} onClick={() => { setInput(ex); setTimeout(analyze, 50); }}
              style={{
                background: "#161b22", border: "1px solid #30363d",
                borderRadius: 6, color: "#58a6ff", padding: "3px 10px",
                fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={e => e.target.style.borderColor = "#58a6ff"}
              onMouseLeave={e => e.target.style.borderColor = "#30363d"}
            >{ex}</button>
          ))}
        </div>

        {error && (
          <div style={{
            background: "#2d1010", border: "1px solid #f85149",
            borderRadius: 8, padding: "12px 16px", color: "#f85149",
            fontSize: 13, marginBottom: 20,
          }}>⚠ {error}</div>
        )}

        {result && (
          <>
            {/* Formulas banner */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12, marginBottom: 24,
            }}>
              {[
                { label: "f(x)", expr: result.strF, color: "#58a6ff" },
                { label: "f′(x)", expr: result.strD1, color: "#3fb950" },
                { label: "f″(x)", expr: result.strD2, color: "#f78166" },
              ].map(({ label, expr, color }) => (
                <div key={label} style={{
                  background: "#161b22", border: `1px solid ${color}33`,
                  borderRadius: 10, padding: "14px 16px",
                  borderLeft: `3px solid ${color}`,
                }}>
                  <div style={{ fontSize: 11, color: "#7d8590", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                  <div style={{ fontSize: 14, color, wordBreak: "break-all", lineHeight: 1.5 }}>{expr}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #21262d" }}>
              {[["graph", "Gráfica"], ["roots", "Raíces y puntos"]].map(([id, label]) => (
                <button key={id} onClick={() => setActiveTab(id)} style={{
                  background: "none", border: "none",
                  borderBottom: activeTab === id ? "2px solid #58a6ff" : "2px solid transparent",
                  color: activeTab === id ? "#e6edf3" : "#7d8590",
                  padding: "10px 20px", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 14, fontWeight: activeTab === id ? 600 : 400,
                  transition: "all 0.15s",
                }}>{label}</button>
              ))}
              {activeTab === "graph" && (
                <div style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center", paddingRight: 8 }}>
                  {[
                    { key: "showD1", val: showD1, set: setShowD1, label: "f′", color: "#3fb950" },
                    { key: "showD2", val: showD2, set: setShowD2, label: "f″", color: "#f78166" },
                  ].map(({ key, val, set, label, color }) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color }}>
                      <input type="checkbox" checked={val} onChange={e => set(e.target.checked)}
                        style={{ accentColor: color }} />
                      {label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {activeTab === "graph" && (
              <div style={{
                background: "#161b22", border: "1px solid #21262d",
                borderRadius: 12, padding: "20px 8px 8px",
              }}>
                <div style={{ fontSize: 12, color: "#7d8590", paddingLeft: 20, marginBottom: 8 }}>
                  Usá el scroll o pellizco para hacer zoom · Arrastrá para desplazarte
                </div>
                <ResponsiveContainer width="100%" height={420}>
                  <LineChart data={result.data} margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                    <XAxis dataKey="x" stroke="#7d8590" tick={{ fontSize: 11, fill: "#7d8590" }}
                      label={{ value: "x", position: "insideBottomRight", fill: "#7d8590", fontSize: 12 }} />
                    <YAxis stroke="#7d8590" tick={{ fontSize: 11, fill: "#7d8590" }}
                      domain={[yMin, yMax]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 13, color: "#7d8590" }} />
                    <ReferenceLine y={0} stroke="#30363d" strokeWidth={1.5} />
                    <ReferenceLine x={0} stroke="#30363d" strokeWidth={1.5} />
                    {result.roots.map((r, i) => (
                      <ReferenceLine key={`r${i}`} x={parseFloat(r.toFixed(4))}
                        stroke="#58a6ff44" strokeDasharray="4 4" />
                    ))}
                    <Line type="monotone" dataKey="f" name="f(x)" stroke="#58a6ff"
                      strokeWidth={2.5} dot={false} connectNulls={false} />
                    {showD1 && <Line type="monotone" dataKey="f1" name="f′(x)" stroke="#3fb950"
                      strokeWidth={1.8} dot={false} connectNulls={false} />}
                    {showD2 && <Line type="monotone" dataKey="f2" name="f″(x)" stroke="#f78166"
                      strokeWidth={1.5} dot={false} connectNulls={false} strokeDasharray="5 3" />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {activeTab === "roots" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
                {[
                  {
                    title: "Raíces de f(x)", subtitle: "donde f(x) = 0",
                    items: result.roots, color: "#58a6ff",
                    empty: "No se encontraron raíces reales en el rango.",
                    fmt: r => {
                      const y1 = evalPoly(result.d1, r);
                      return `x ≈ ${r.toFixed(6)}  →  f′(${r.toFixed(2)}) = ${y1.toFixed(4)}`;
                    }
                  },
                  {
                    title: "Puntos críticos de f(x)", subtitle: "donde f′(x) = 0",
                    items: result.criticals, color: "#3fb950",
                    empty: "No se encontraron puntos críticos en el rango.",
                    fmt: r => {
                      const y = evalPoly(result.terms, r);
                      const y2 = evalPoly(result.d2, r);
                      const tipo = y2 > 0.001 ? "🔻 mínimo local" : y2 < -0.001 ? "🔺 máximo local" : "punto de inflexión";
                      return `x ≈ ${r.toFixed(6)}  f(x)=${y.toFixed(4)}  ${tipo}`;
                    }
                  },
                  {
                    title: "Inflexiones de f(x)", subtitle: "donde f″(x) = 0",
                    items: result.inflections, color: "#f78166",
                    empty: "No se encontraron inflexiones en el rango.",
                    fmt: r => {
                      const y = evalPoly(result.terms, r);
                      return `x ≈ ${r.toFixed(6)}  f(x)=${y.toFixed(4)}`;
                    }
                  },
                ].map(({ title, subtitle, items, color, empty, fmt }) => (
                  <div key={title} style={{
                    background: "#161b22", border: `1px solid ${color}33`,
                    borderRadius: 12, padding: "20px",
                    borderTop: `3px solid ${color}`,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color, marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 11, color: "#7d8590", marginBottom: 16 }}>{subtitle}</div>
                    {items.length === 0
                      ? <div style={{ fontSize: 13, color: "#7d8590" }}>{empty}</div>
                      : items.map((r, i) => (
                        <div key={i} style={{
                          background: "#0d1117", borderRadius: 8,
                          padding: "10px 12px", marginBottom: 8,
                          fontSize: 12, color: "#e6edf3", lineHeight: 1.7,
                        }}>{fmt(r)}</div>
                      ))
                    }
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ textAlign: "center", padding: "32px", color: "#484f58", fontSize: 11 }}>
        Sintaxis: <code style={{ color: "#7d8590" }}>x^n</code> · <code style={{ color: "#7d8590" }}>3x^2 - 5x + 1</code> · Enter para analizar
      </div>
    </div>
  );
}
