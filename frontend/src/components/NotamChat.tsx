/**
 * NotamChat.tsx
 *
 * Purpose
 * - Minimal NOTAM Q&A chat UI to query backend `/ai/notam` and display
 *   a concise answer with citations and matched NOTAMs.
 *
 * Props
 * - defaultIcao?: string — initial ICAO to query (default: "EGLL")
 * - compact?: boolean — use a tighter layout for side panels
 *
 * Behaviour
 * - Submits GET /ai/notam with q, icao and optional k.
 * - Shows loading/error states, then the answer text, provider tag and
 *   a few top matches with IDs for transparency.
 *
 * Notes
 * - Keeps the UI deterministic and concise per certification constraints.
 */
import React, { useState } from 'react';
import { getNotamAnswer, type NotamAnswer } from '../lib/api';

export type NotamChatProps = {
  defaultIcao?: string;
  compact?: boolean;
};

export default function NotamChat({ defaultIcao = 'EGLL', compact = true }: NotamChatProps): JSX.Element {
  const [icao, setIcao] = useState<string>(defaultIcao.toUpperCase());
  const [q, setQ] = useState<string>('Runway closure');
  const [k, setK] = useState<number>(5);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NotamAnswer | null>(null);

  const runQuery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setResult(null);
    try {
      setLoading(true);
      const res = await getNotamAnswer(q, icao, k);
      setResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Request failed');
      setError(msg);
      // keep previous result cleared
    } finally {
      setLoading(false);
    }
  };

  const labelStyle: React.CSSProperties = { display: 'block', fontWeight: 600, marginBottom: 6 };
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' };
  const inputStyle: React.CSSProperties = {
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(31,41,55,0.9)',
    color: 'white',
  };
  const buttonStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(31,41,55,0.9)',
    color: 'white',
    cursor: 'pointer',
    fontSize: 12,
  };

  return (
    <div>
      <span style={labelStyle}>NOTAM Q&A</span>
      <form onSubmit={runQuery} style={rowStyle}>
        <input
          type="text"
          placeholder="Enter your question"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="NOTAM question"
          style={{ ...inputStyle, flex: 1, minWidth: 180 }}
        />
        <input
          type="text"
          value={icao}
          onChange={(e) => setIcao(e.target.value.toUpperCase())}
          aria-label="ICAO"
          style={{ ...inputStyle, width: 70, textTransform: 'uppercase' }}
          maxLength={4}
        />
        {!compact && (
          <input
            type="number"
            value={k}
            min={1}
            max={10}
            onChange={(e) => setK(Math.max(1, Math.min(10, Number(e.target.value))))}
            aria-label="Max results"
            style={{ ...inputStyle, width: 70 }}
            title="Max results to consider"
          />
        )}
        <button type="submit" style={buttonStyle} disabled={!q.trim() || icao.length !== 4 || loading}>
          {loading ? 'Searching…' : 'Ask'}
        </button>
      </form>

      {error && (
        <div role="alert" style={{ marginTop: 8, color: '#fca5a5' }}>{error}</div>
      )}

      {result && (
        <div style={{ marginTop: 8 }}>
          <div style={{ opacity: 0.9, marginBottom: 4 }}>
            Answer <span style={{ opacity: 0.7 }}>(provider: {result.provider})</span>
          </div>
          <div style={{ lineHeight: 1.35 }}>{result.answer}</div>
          {result.citations.length > 0 && (
            <div style={{ marginTop: 6, opacity: 0.9 }}>Citations: {result.citations.join(', ')}</div>
          )}
          {result.matches.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer' }}>Show matches</summary>
              <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                {result.matches.slice(0, 5).map((m) => (
                  <li key={m.id}>
                    <span style={{ opacity: 0.85 }}>
                      [{m.id}] {m.text} <span style={{ opacity: 0.7 }}>(score {m.score.toFixed(3)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
