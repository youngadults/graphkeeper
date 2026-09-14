"use client";

export interface ParsedProps {
  ok: boolean;
  value?: Record<string, unknown>;
  error?: string;
}

/** Parse a props JSON textarea into a safe object. */
export function parsePropsText(text: string): ParsedProps {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: undefined };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Props must be valid JSON." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Props must be a JSON object (e.g. { \"tier\": \"high\" })." };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

export function serializeProps(props: Record<string, unknown> | undefined): string {
  if (!props || Object.keys(props).length === 0) return "";
  return JSON.stringify(props, null, 2);
}

interface PropsFieldProps {
  text: string;
  onChange: (value: string) => void;
  error?: string | null;
  rows?: number;
}

export function PropsField({ text, onChange, error, rows = 4 }: PropsFieldProps) {
  return (
    <div>
      <label htmlFor="gk-props" className="mb-1 block text-xs font-medium text-slate-600">
        Props (JSON, optional)
      </label>
      <textarea
        id="gk-props"
        rows={rows}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        placeholder='{ "confidence": 0.8 }'
        className={`w-full rounded-lg border px-2.5 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/40 ${
          error ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"
        }`}
      />
      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}