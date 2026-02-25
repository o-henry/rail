import { feedPostStatusLabel, formatFeedInputSourceLabel, normalizeFeedSteps } from "../../features/feed/displayUtils";
import { extractFinalAnswer } from "../../features/workflow/labels";
import { toHumanReadableFeedText } from "../../features/workflow/promptUtils";
import { t } from "../../i18n";
import { formatRunDateTime, formatRunFileLabel } from "../mainAppUtils";
import type { FeedViewPost, RunRecord } from "./types";

export function buildFeedShareText(post: FeedViewPost, run: RunRecord | null): string {
  const markdownAttachment = post.attachments.find((attachment) => attachment.kind === "markdown");
  const rawContent = toHumanReadableFeedText(markdownAttachment?.content?.trim() ?? "");
  const visibleSteps = normalizeFeedSteps(post.steps);
  const lines: string[] = [
    `# ${post.agentName}`,
    `- ${t("feed.share.status")}: ${feedPostStatusLabel(post.status)}`,
    `- ${t("feed.share.role")}: ${post.roleLabel}`,
    `- ${t("feed.share.createdAt")}: ${formatRunDateTime(post.createdAt)}`,
  ];

  if (run?.runId) {
    lines.push(`- ${t("feed.share.runId")}: ${run.runId}`);
  }
  if (post.sourceFile) {
    lines.push(`- ${t("feed.share.sourceFile")}: ${formatRunFileLabel(post.sourceFile)}`);
  }

  const normalizedQuestion = toHumanReadableFeedText(post.question?.trim() ?? "");
  if (normalizedQuestion) {
    lines.push("", `## ${t("feed.share.question")}`, normalizedQuestion);
  }

  if (Array.isArray(post.inputSources) && post.inputSources.length > 0) {
    lines.push("", `## ${t("feed.inputSources")}`, ...post.inputSources.map((source) => `- ${formatFeedInputSourceLabel(source)}`));
  }

  if (post.inputContext?.preview) {
    lines.push("", `## ${t("feed.inputSnapshot")}`, toHumanReadableFeedText(post.inputContext.preview));
  }

  lines.push("", `## ${t("feed.share.summary")}`, post.summary?.trim() || t("feed.summary.empty"));

  if (visibleSteps.length > 0) {
    lines.push("", `## ${t("feed.share.steps")}`, ...visibleSteps.map((step) => `- ${step}`));
  }

  if (rawContent) {
    lines.push("", `## ${t("feed.share.detail")}`, rawContent);
  }

  const finalAnswer = extractFinalAnswer(run);
  if (finalAnswer) {
    lines.push("", `## ${t("feed.share.finalAnswer")}`, toHumanReadableFeedText(finalAnswer));
  }

  return lines.join("\n");
}
