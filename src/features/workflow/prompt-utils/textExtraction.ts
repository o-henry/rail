import { extractStringByPaths, formatUnknown } from "../../../shared/lib/valueUtils";

export function getByPath(input: unknown, path: string): unknown {
  if (!path.trim()) {
    return input;
  }

  const parts = path.split(".").filter(Boolean);
  let current: unknown = input;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function stringifyInput(input: unknown): string {
  if (input == null) {
    return "";
  }
  if (typeof input === "string") {
    return input;
  }
  return formatUnknown(input);
}

export function extractPromptInputText(input: unknown, depth = 0): string {
  if (depth > 5 || input == null) {
    return "";
  }
  if (typeof input === "string") {
    return input.trim();
  }
  if (Array.isArray(input)) {
    const parts = input
      .map((item) => extractPromptInputText(item, depth + 1))
      .map((item) => item.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join("\n\n");
    }
    return stringifyInput(input).trim();
  }
  if (typeof input !== "object") {
    return stringifyInput(input).trim();
  }

  const record = input as Record<string, unknown>;
  const artifactPayload = getByPath(record, "artifact.payload");
  if (artifactPayload !== undefined) {
    if (typeof artifactPayload === "string" && artifactPayload.trim()) {
      return artifactPayload.trim();
    }
    if (artifactPayload && typeof artifactPayload === "object") {
      const payloadDirect = extractStringByPaths(artifactPayload, [
        "finalDraft",
        "text",
        "output.text",
        "result.text",
        "completion.text",
        "response.text",
        "payload.text",
        "content",
        "message",
      ]);
      if (payloadDirect && payloadDirect.trim()) {
        return payloadDirect.trim();
      }
    }
    const payloadExtracted = extractPromptInputText(artifactPayload, depth + 1);
    if (payloadExtracted) {
      return payloadExtracted;
    }
  }

  const direct = extractStringByPaths(input, [
    "artifact.payload.finalDraft",
    "artifact.payload.text",
    "artifact.payload.output.text",
    "artifact.payload.result.text",
    "text",
    "output.text",
    "result.text",
    "completion.text",
    "response.text",
    "payload.text",
    "artifact.payload.text",
    "artifact.text",
    "data.text",
    "raw.text",
  ]);
  if (direct && direct.trim()) {
    return direct.trim();
  }

  const nestedCandidates = [
    record.output,
    record.result,
    record.response,
    record.payload,
    record.artifact,
    record.data,
    record.item,
  ];
  for (const candidate of nestedCandidates) {
    const extracted = extractPromptInputText(candidate, depth + 1);
    if (extracted) {
      return extracted;
    }
  }

  const skipKeys = new Set([
    "text",
    "output",
    "result",
    "response",
    "payload",
    "artifact",
    "data",
    "item",
    "raw",
    "completion",
    "meta",
  ]);
  const mergedParts = Object.entries(record)
    .filter(([key]) => !skipKeys.has(key))
    .map(([key, value]) => {
      const extracted = extractPromptInputText(value, depth + 1);
      if (!extracted) {
        return "";
      }
      return `## ${key}\n${extracted}`;
    })
    .filter(Boolean);
  if (mergedParts.length > 0) {
    return mergedParts.join("\n\n");
  }

  return stringifyInput(input).trim();
}

export function extractFinalSynthesisInputText(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return extractPromptInputText(input);
  }
  const row = input as Record<string, unknown>;
  const question = String(row.question ?? "").trim();
  const packets = Array.isArray(row.evidencePackets) ? row.evidencePackets : [];
  const conflicts = Array.isArray(row.unresolvedConflicts) ? row.unresolvedConflicts : [];
  const memory = Array.isArray(row.runMemory) ? row.runMemory : [];

  const packetLines = packets
    .map((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return "";
      }
      const packet = entry as Record<string, unknown>;
      const nodeId = String(packet.nodeId ?? `node-${index + 1}`);
      const roleLabel = String(packet.roleLabel ?? "");
      const verification = String(packet.verificationStatus ?? "unparsed");
      const confidence = Number(packet.confidence ?? 0);
      const confidenceBand = String(packet.confidenceBand ?? "low");
      const citations = Array.isArray(packet.citations)
        ? packet.citations
            .slice(0, 4)
            .map((row) => {
              if (typeof row === "string") return row.trim();
              if (row && typeof row === "object") {
                const src = extractStringByPaths(row, ["url", "source", "title"]);
                return src ? src.trim() : "";
              }
              return "";
            })
            .filter(Boolean)
        : [];
      const claims = Array.isArray(packet.claims)
        ? packet.claims
            .slice(0, 8)
            .map((claim) => {
              if (!claim || typeof claim !== "object") return "";
              const text = extractStringByPaths(claim, ["text"]) ?? "";
              return String(text).trim();
            })
            .filter(Boolean)
        : [];
      const issues = Array.isArray(packet.dataIssues)
        ? packet.dataIssues.map((issue) => String(issue).trim()).filter(Boolean).slice(0, 6)
        : [];

      return [
        `### evidence:${nodeId}`,
        roleLabel ? `- role: ${roleLabel}` : "",
        `- verification: ${verification}`,
        `- confidence: ${Number.isFinite(confidence) ? confidence.toFixed(2) : "0.00"} (${confidenceBand})`,
        ...(citations.length > 0 ? [`- citations: ${citations.join(" | ")}`] : ["- citations: (none)"]),
        ...(issues.length > 0 ? [`- dataIssues: ${issues.join(" | ")}`] : []),
        ...(claims.length > 0 ? ["- claims:", ...claims.map((line) => `  - ${line}`)] : []),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean);

  const conflictLines = conflicts
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const metricKey = String((entry as Record<string, unknown>).metricKey ?? "").trim();
      const values = Array.isArray((entry as Record<string, unknown>).values)
        ? ((entry as Record<string, unknown>).values as unknown[])
            .map((row) => {
              if (!row || typeof row !== "object") return "";
              const nodeId = extractStringByPaths(row, ["nodeId"]) ?? "-";
              const value = extractStringByPaths(row, ["value"]) ?? "-";
              return `${nodeId}:${value}`;
            })
            .filter(Boolean)
            .join(", ")
        : "";
      if (!metricKey) return "";
      return `- ${metricKey}: ${values || "(values unavailable)"}`;
    })
    .filter(Boolean);

  const memoryLines = memory
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const nodeId = String((entry as Record<string, unknown>).nodeId ?? "").trim();
      const roleLabel = String((entry as Record<string, unknown>).roleLabel ?? "").trim();
      const summary = String((entry as Record<string, unknown>).decisionSummary ?? "").trim();
      if (!nodeId) return "";
      return `- ${nodeId}${roleLabel ? ` (${roleLabel})` : ""}: ${summary || "(no summary)"}`;
    })
    .filter(Boolean);

  const sections = [
    question ? `[QUESTION]\n${question}` : "",
    packetLines.length > 0 ? `[EVIDENCE PACKETS]\n${packetLines.join("\n\n")}` : "",
    conflictLines.length > 0 ? `[UNRESOLVED CONFLICTS]\n${conflictLines.join("\n")}` : "",
    memoryLines.length > 0 ? `[RUN MEMORY]\n${memoryLines.join("\n")}` : "",
  ].filter(Boolean);

  return sections.length > 0 ? sections.join("\n\n") : extractPromptInputText(input);
}
