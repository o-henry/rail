import type { UnifiedInputValidationResult } from "../types";

type NormalizeUnifiedInputParams = {
  text: string;
  locale?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

function normalizeWhitespace(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export function normalizeUnifiedInput(params: NormalizeUnifiedInputParams): UnifiedInputValidationResult {
  const rawText = String(params.text ?? "");
  const normalizedText = normalizeWhitespace(rawText);
  const errors: string[] = [];

  if (normalizedText.length === 0) {
    errors.push("요청 내용이 비어 있습니다.");
  }
  if (normalizedText.length > 20000) {
    errors.push("요청이 너무 깁니다. 20,000자 이하로 입력하세요.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      rawText,
      normalizedText,
      locale: String(params.locale ?? "ko"),
      tags: [...(params.tags ?? [])].map((tag) => String(tag).trim()).filter(Boolean),
      metadata: { ...(params.metadata ?? {}) },
    },
  };
}
