import { feedPostStatusLabel, formatFeedInputSourceLabel, normalizeFeedSteps } from "../../features/feed/displayUtils";
import { extractFinalAnswer } from "../../features/workflow/labels";
import { toHumanReadableFeedText } from "../../features/workflow/promptUtils";
import { formatRunDateTime, formatRunFileLabel } from "../mainAppUtils";
import type { FeedViewPost, RunRecord } from "./types";

export function buildFeedShareText(post: FeedViewPost, run: RunRecord | null): string {
  const markdownAttachment = post.attachments.find((attachment) => attachment.kind === "markdown");
  const rawContent = toHumanReadableFeedText(markdownAttachment?.content?.trim() ?? "");
  const visibleSteps = normalizeFeedSteps(post.steps);
  const lines: string[] = [
    `# ${post.agentName}`,
    `- 상태: ${feedPostStatusLabel(post.status)}`,
    `- 역할: ${post.roleLabel}`,
    `- 생성 시간: ${formatRunDateTime(post.createdAt)}`,
  ];

  if (run?.runId) {
    lines.push(`- 실행 ID: ${run.runId}`);
  }
  if (post.sourceFile) {
    lines.push(`- 기록 파일: ${formatRunFileLabel(post.sourceFile)}`);
  }

  const normalizedQuestion = toHumanReadableFeedText(post.question?.trim() ?? "");
  if (normalizedQuestion) {
    lines.push("", "## 질문", normalizedQuestion);
  }

  if (Array.isArray(post.inputSources) && post.inputSources.length > 0) {
    lines.push("", "## 입력 출처", ...post.inputSources.map((source) => `- ${formatFeedInputSourceLabel(source)}`));
  }

  if (post.inputContext?.preview) {
    lines.push("", "## 전달 입력 스냅샷", toHumanReadableFeedText(post.inputContext.preview));
  }

  lines.push("", "## 요약", post.summary?.trim() || "(요약 없음)");

  if (visibleSteps.length > 0) {
    lines.push("", "## 단계", ...visibleSteps.map((step) => `- ${step}`));
  }

  if (rawContent) {
    lines.push("", "## 상세", rawContent);
  }

  const finalAnswer = extractFinalAnswer(run);
  if (finalAnswer) {
    lines.push("", "## 최종 답변", toHumanReadableFeedText(finalAnswer));
  }

  return lines.join("\n");
}
