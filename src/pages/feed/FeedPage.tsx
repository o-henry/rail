import FancySelect from "../../components/FancySelect";
import FeedDocument from "../../components/feed/FeedDocument";

type FeedPageProps = {
  vm: any;
};

export default function FeedPage({ vm }: FeedPageProps) {
  const {
    feedInspectorTurnNode,
    feedInspectorPost,
    feedInspectorEditable,
    feedInspectorEditableNodeId,
    feedInspectorTurnExecutor,
    feedInspectorTurnConfig,
    feedInspectorQualityProfile,
    feedInspectorQualityThresholdOption,
    feedInspectorPromptTemplate,
    updateNodeConfigById,
    turnModelLabel,
    turnRoleLabel,
    TURN_EXECUTOR_OPTIONS,
    turnExecutorLabel,
    TURN_MODEL_OPTIONS,
    toTurnModelDisplayName,
    DEFAULT_TURN_MODEL,
    getWebProviderFromExecutor,
    normalizeWebResultMode,
    cwd,
    QUALITY_PROFILE_OPTIONS,
    normalizeQualityThreshold,
    QUALITY_THRESHOLD_OPTIONS,
    ARTIFACT_TYPE_OPTIONS,
    toArtifactType,
    feedFilterOpen,
    setFeedFilterOpen,
    setFeedStatusFilter,
    setFeedExecutorFilter,
    setFeedPeriodFilter,
    setFeedKeyword,
    feedStatusFilter,
    feedExecutorFilter,
    feedPeriodFilter,
    feedKeyword,
    feedCategoryMeta,
    feedCategory,
    feedCategoryPosts,
    setFeedCategory,
    feedShareMenuPostId,
    setFeedShareMenuPostId,
    feedLoading,
    currentFeedPosts,
    groupedFeedRuns,
    feedGroupExpandedByRunId,
    setFeedGroupExpandedByRunId,
    feedGroupRenameRunId,
    setFeedGroupRenameRunId,
    setFeedGroupRenameDraft,
    feedGroupRenameDraft,
    onSubmitFeedRunGroupRename,
    toHumanReadableFeedText,
    hashStringToHue,
    buildFeedAvatarLabel,
    pendingNodeRequests,
    feedReplyDraftByPost,
    feedExpandedByPost,
    onSelectFeedInspectorPost,
    onShareFeedPost,
    onDeleteFeedPost,
    setFeedExpandedByPost,
    formatFeedInputSourceLabel,
    formatRunDateTime,
    formatRelativeFeedTime,
    formatDuration,
    formatUsage,
    setFeedReplyDraftByPost,
    onSubmitFeedAgentRequest,
  } = vm;

  return (
    <section className="feed-layout workspace-tab-panel">
            <article className="panel-card feed-agent-panel">
              {/* <div className="feed-agent-panel-head"> */}
                {/* <h3>에이전트 상세설정</h3> */}
                {/* <span>{feedInspectorAgentPosts.length}개</span> */}
              {/* </div> */}
              {/* {feedInspectorAgentPosts.length === 0 && (
                <div className="inspector-empty">표시할 에이전트 포스트가 없습니다.</div>
              )}
              {feedInspectorAgentPosts.length > 0 && (
                <div className="feed-agent-list">
                  {feedInspectorAgentPosts.map((post) => (
                    <button
                      className={feedInspectorPost?.id === post.id ? "is-active" : ""}
                      key={`${post.nodeId}:${post.id}`}
                      onClick={() => onSelectFeedInspectorPost(post)}
                      type="button"
                    >
                      <span className="feed-agent-list-name">{post.agentName}</span>
                      <span className="feed-agent-list-sub">{post.roleLabel}</span>
                    </button>
                  ))}
                </div>
              )} */}
              {feedInspectorTurnNode && (
                <section className="feed-agent-settings">
                  <div className="feed-agent-settings-header">
                    <strong>{feedInspectorPost?.agentName ?? turnModelLabel(feedInspectorTurnNode)}</strong>
                    {!feedInspectorEditable && <span className="feed-agent-readonly-badge">기록 스냅샷</span>}
                  </div>
                  <div className="feed-agent-settings-grid">
                    <label>
                      에이전트
                      <FancySelect
                        ariaLabel="피드 에이전트 실행기"
                        className="modern-select"
                        disabled={!feedInspectorEditable}
                        onChange={(next) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(feedInspectorEditableNodeId, "executor", next);
                        }}
                        options={TURN_EXECUTOR_OPTIONS.map((option: any) => ({
                          value: option,
                          label: turnExecutorLabel(option),
                        }))}
                        value={feedInspectorTurnExecutor}
                      />
                    </label>
                    {feedInspectorTurnExecutor === "codex" && (
                      <label>
                        모델
                        <FancySelect
                          ariaLabel="피드 에이전트 모델"
                          className="modern-select"
                          disabled={!feedInspectorEditable}
                          onChange={(next) => {
                            if (!feedInspectorEditableNodeId) {
                              return;
                            }
                            updateNodeConfigById(feedInspectorEditableNodeId, "model", next);
                          }}
                          options={TURN_MODEL_OPTIONS.map((option: any) => ({ value: option, label: option }))}
                          value={toTurnModelDisplayName(
                            String(feedInspectorTurnConfig?.model ?? DEFAULT_TURN_MODEL),
                          )}
                        />
                      </label>
                    )}
                    {feedInspectorTurnExecutor === "ollama" && (
                      <label>
                        Ollama 모델
                        <input
                          disabled={!feedInspectorEditable}
                          onChange={(event) => {
                            if (!feedInspectorEditableNodeId) {
                              return;
                            }
                            updateNodeConfigById(
                              feedInspectorEditableNodeId,
                              "ollamaModel",
                              event.currentTarget.value,
                            );
                          }}
                          placeholder="예: llama3.1:8b"
                          value={String(feedInspectorTurnConfig?.ollamaModel ?? "llama3.1:8b")}
                        />
                      </label>
                    )}
                    {getWebProviderFromExecutor(feedInspectorTurnExecutor) && (
                      <>
                        <label>
                          웹 결과 모드
                          <FancySelect
                            ariaLabel="피드 에이전트 웹 결과 모드"
                            className="modern-select"
                            disabled={!feedInspectorEditable}
                            onChange={(next) => {
                              if (!feedInspectorEditableNodeId) {
                                return;
                              }
                              updateNodeConfigById(feedInspectorEditableNodeId, "webResultMode", next);
                            }}
                            options={[
                              { value: "bridgeAssisted", label: "웹 연결 반자동 (권장)" },
                              { value: "manualPasteText", label: "텍스트 붙여넣기" },
                              { value: "manualPasteJson", label: "JSON 붙여넣기" },
                            ]}
                            value={String(
                              normalizeWebResultMode(feedInspectorTurnConfig?.webResultMode),
                            )}
                          />
                        </label>
                        <label>
                          자동화 타임아웃(ms)
                          <input
                            disabled={!feedInspectorEditable}
                            onChange={(event) => {
                              if (!feedInspectorEditableNodeId) {
                                return;
                              }
                              updateNodeConfigById(
                                feedInspectorEditableNodeId,
                                "webTimeoutMs",
                                Number(event.currentTarget.value) || 180_000,
                              );
                            }}
                            type="number"
                            value={String(feedInspectorTurnConfig?.webTimeoutMs ?? 180_000)}
                          />
                        </label>
                      </>
                    )}
                    <label>
                      역할
                      <input
                        disabled={!feedInspectorEditable}
                        onChange={(event) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(feedInspectorEditableNodeId, "role", event.currentTarget.value);
                        }}
                        placeholder={turnRoleLabel(feedInspectorTurnNode)}
                        value={String(feedInspectorTurnConfig?.role ?? "")}
                      />
                    </label>
                    <label>
                      작업 경로
                      <input
                        className="lowercase-path-input"
                        disabled={!feedInspectorEditable}
                        onChange={(event) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(feedInspectorEditableNodeId, "cwd", event.currentTarget.value);
                        }}
                        value={String(feedInspectorTurnConfig?.cwd ?? cwd)}
                      />
                    </label>
                    <label>
                      품질 프로필
                      <FancySelect
                        ariaLabel="피드 에이전트 품질 프로필"
                        className="modern-select"
                        disabled={!feedInspectorEditable}
                        onChange={(next) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(feedInspectorEditableNodeId, "qualityProfile", next);
                        }}
                        options={QUALITY_PROFILE_OPTIONS}
                        value={feedInspectorQualityProfile}
                      />
                    </label>
                    <label>
                      통과 기준 점수
                      <FancySelect
                        ariaLabel="피드 에이전트 품질 통과 기준 점수"
                        className="modern-select"
                        disabled={!feedInspectorEditable}
                        onChange={(next) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(
                            feedInspectorEditableNodeId,
                            "qualityThreshold",
                            normalizeQualityThreshold(next),
                          );
                        }}
                        options={QUALITY_THRESHOLD_OPTIONS}
                        value={feedInspectorQualityThresholdOption}
                      />
                    </label>
                    <label>
                      출력 아티팩트
                      <FancySelect
                        ariaLabel="피드 에이전트 출력 아티팩트"
                        className="modern-select"
                        disabled={!feedInspectorEditable}
                        onChange={(next) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(feedInspectorEditableNodeId, "artifactType", next);
                        }}
                        options={ARTIFACT_TYPE_OPTIONS}
                        value={toArtifactType(feedInspectorTurnConfig?.artifactType)}
                      />
                    </label>
                    <label>
                      출력 스키마(JSON)
                      <textarea
                        className="prompt-template-textarea"
                        disabled={!feedInspectorEditable}
                        onChange={(event) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(
                            feedInspectorEditableNodeId,
                            "outputSchemaJson",
                            event.currentTarget.value,
                          );
                        }}
                        rows={4}
                        value={String(feedInspectorTurnConfig?.outputSchemaJson ?? "")}
                      />
                    </label>
                    {feedInspectorQualityProfile === "code_implementation" && (
                      <>
                        <label>
                          로컬 품질 명령 실행
                          <FancySelect
                            ariaLabel="피드 에이전트 로컬 품질 명령 실행"
                            className="modern-select"
                            disabled={!feedInspectorEditable}
                            onChange={(next) => {
                              if (!feedInspectorEditableNodeId) {
                                return;
                              }
                              updateNodeConfigById(
                                feedInspectorEditableNodeId,
                                "qualityCommandEnabled",
                                next === "true",
                              );
                            }}
                            options={[
                              { value: "false", label: "미사용" },
                              { value: "true", label: "사용" },
                            ]}
                            value={String(feedInspectorTurnConfig?.qualityCommandEnabled === true)}
                          />
                        </label>
                        <label>
                          품질 명령 목록
                          <textarea
                            className="prompt-template-textarea"
                            disabled={!feedInspectorEditable}
                            onChange={(event) => {
                              if (!feedInspectorEditableNodeId) {
                                return;
                              }
                              updateNodeConfigById(
                                feedInspectorEditableNodeId,
                                "qualityCommands",
                                event.currentTarget.value,
                              );
                            }}
                            rows={3}
                            value={String(feedInspectorTurnConfig?.qualityCommands ?? "npm run build")}
                          />
                        </label>
                      </>
                    )}
                    <label>
                      프롬프트 템플릿
                      <textarea
                        className="prompt-template-textarea feed-agent-prompt-textarea"
                        disabled={!feedInspectorEditable}
                        onChange={(event) => {
                          if (!feedInspectorEditableNodeId) {
                            return;
                          }
                          updateNodeConfigById(
                            feedInspectorEditableNodeId,
                            "promptTemplate",
                            event.currentTarget.value,
                          );
                        }}
                        rows={8}
                        value={feedInspectorPromptTemplate}
                      />
                    </label>
                  </div>
                </section>
              )}
            </article>
            <article className="panel-card feed-main">
              <div className="feed-topbar">
                <h2>피드</h2>
                <button
                  className={`feed-filter-toggle ${feedFilterOpen ? "is-open" : ""}`}
                  onClick={() => setFeedFilterOpen((prev: any) => !prev)}
                  type="button"
                >
                  <span className="feed-filter-toggle-label">필터</span>
                </button>
              </div>
              <div className={`feed-filter-inline-wrap ${feedFilterOpen ? "is-open" : ""}`}>
                <div className="feed-filter-inline">
                  <label>
                    상태
                    <FancySelect
                      ariaLabel="피드 상태 필터"
                      className="modern-select"
                      onChange={(next) => setFeedStatusFilter(next)}
                      options={[
                        { value: "all", label: "전체" },
                        { value: "draft", label: "작업중" },
                        { value: "done", label: "완료" },
                        { value: "failed", label: "오류" },
                        { value: "cancelled", label: "취소" },
                      ]}
                      value={feedStatusFilter}
                    />
                  </label>
                  <label>
                    실행기
                    <FancySelect
                      ariaLabel="피드 실행기 필터"
                      className="modern-select"
                      onChange={(next) => setFeedExecutorFilter(next)}
                      options={[
                        { value: "all", label: "전체" },
                        { value: "codex", label: "Codex" },
                        { value: "web", label: "WEB" },
                        { value: "ollama", label: "Ollama" },
                      ]}
                      value={feedExecutorFilter}
                    />
                  </label>
                  <label>
                    기간
                    <FancySelect
                      ariaLabel="피드 기간 필터"
                      className="modern-select"
                      onChange={(next) => setFeedPeriodFilter(next)}
                      options={[
                        { value: "all", label: "전체" },
                        { value: "today", label: "오늘" },
                        { value: "7d", label: "최근 7일" },
                      ]}
                      value={feedPeriodFilter}
                    />
                  </label>
                  <label className="feed-filter-keyword-field">
                    키워드
                    <input
                      onChange={(e) => setFeedKeyword(e.currentTarget.value)}
                      placeholder="질문/역할/모델 검색"
                      value={feedKeyword}
                    />
                  </label>
                </div>
              </div>
              <div className="feed-topic-tabs">
                {feedCategoryMeta.map((row: any) => {
                  const count = feedCategoryPosts[row.key].length;
                  return (
                    <button
                      className={`${feedCategory === row.key ? "is-active" : ""} ${
                        row.key === "all_posts" ? "is-all-posts" : ""
                      }`.trim()}
                      key={row.key}
                      onClick={() => setFeedCategory(row.key)}
                      type="button"
                    >
                      <span className="feed-topic-label">{row.label}</span>
                      {count > 0 && <span className="feed-topic-count">{count}</span>}
                    </button>
                  );
                })}
              </div>
              <article
                className="feed-stream"
                onClick={() => {
                  if (feedShareMenuPostId) {
                    setFeedShareMenuPostId(null);
                  }
                }}
              >
                {feedLoading && <div className="log-empty">피드 로딩 중...</div>}
                {!feedLoading && currentFeedPosts.length === 0 && (
                  <div className="log-empty">표시할 포스트가 없습니다.</div>
                )}
                {!feedLoading &&
                  groupedFeedRuns.map((group: any) => {
                    const isGroupExpanded = feedGroupExpandedByRunId[group.runId] !== false;
                    const isRenamingGroup = feedGroupRenameRunId === group.runId;
                    return (
                      <section
                        className={`feed-run-group ${isGroupExpanded ? "is-expanded" : ""}`}
                        key={`feed-run-group-${group.runId}`}
                      >
                        <header className="feed-run-group-head">
                          <div className="feed-run-group-meta">
                            <strong>{group.name}</strong>
                            <span>
                              {group.posts.length}개 · {formatRunDateTime(group.latestAt)}
                              {group.isLive ? " · 실행 중" : ""}
                            </span>
                          </div>
                          <div className="feed-run-group-actions">
                            {group.kind === "custom" && !isRenamingGroup && !group.isLive && (
                              <button
                                className="feed-run-group-rename"
                                onClick={() => {
                                  setFeedGroupRenameRunId(group.runId);
                                  setFeedGroupRenameDraft(group.name);
                                }}
                                type="button"
                              >
                                이름 변경
                              </button>
                            )}
                            <button
                              className="feed-run-group-toggle"
                              onClick={() =>
                                setFeedGroupExpandedByRunId((prev: any) => ({
                                  ...prev,
                                  [group.runId]: !(prev[group.runId] !== false),
                                }))
                              }
                              type="button"
                            >
                              {isGroupExpanded ? "닫기" : "열기"}
                            </button>
                          </div>
                        </header>
                        {isRenamingGroup && (
                          <div className="feed-run-group-rename-row">
                            <input
                              onChange={(event) => setFeedGroupRenameDraft(event.currentTarget.value)}
                              placeholder="세트 이름 입력"
                              value={feedGroupRenameDraft}
                            />
                            <button
                              onClick={() => void onSubmitFeedRunGroupRename(group.runId, group.sourceFile)}
                              type="button"
                            >
                              저장
                            </button>
                            <button
                              onClick={() => {
                                setFeedGroupRenameRunId(null);
                                setFeedGroupRenameDraft("");
                              }}
                              type="button"
                            >
                              취소
                            </button>
                          </div>
                        )}
                        <div className={`feed-run-group-body ${isGroupExpanded ? "is-expanded" : ""}`}>
                          <div className="feed-run-group-posts">
                            {group.posts.map((post: any) => {
                              const attachments = Array.isArray(post.attachments) ? post.attachments : [];
                              const evidence = post.evidence && typeof post.evidence === "object" ? post.evidence : {};
                              const markdownAttachment = attachments.find((attachment: any) => attachment?.kind === "markdown");
                              const visibleContentRaw = markdownAttachment?.content ?? post.summary ?? "(첨부 없음)";
                              const visibleContent = toHumanReadableFeedText(visibleContentRaw);
                              const readableQuestion = toHumanReadableFeedText(post.question ?? "");
                              const readableInputPreview = toHumanReadableFeedText(post.inputContext?.preview ?? "");
                              const avatarHue = hashStringToHue(`${post.nodeId}:${post.agentName}:${post.roleLabel}`);
                              const avatarStyle = {
                                backgroundColor: `hsl(${avatarHue} 78% 92%)`,
                                color: `hsl(${avatarHue} 54% 28%)`,
                                borderColor: `hsl(${avatarHue} 36% 76%)`,
                              };
                              const avatarLabel = buildFeedAvatarLabel(post);
                              const score = Math.max(
                                1,
                                Math.min(99, Number((evidence as any).qualityScore ?? (post.status === "done" ? 95 : 55))),
                              );
                              const pendingRequestCount = (pendingNodeRequests[post.nodeId] ?? []).length;
                              const requestDraft = feedReplyDraftByPost[post.id] ?? "";
                              const isExpanded = feedExpandedByPost[post.id] === true;
                              const isDraftPost = post.status === "draft";
                              const canRequest = post.nodeType === "turn";
                              const nodeInputSources = post.inputSources ?? [];
                              const upstreamSources = nodeInputSources.filter((source: any) => source.kind === "node");
                              return (
                                <section
                                  className={`feed-card feed-card-sns ${
                                    feedInspectorPost?.id === post.id ? "is-selected" : ""
                                  }`.trim()}
                                  key={post.id}
                                  onClick={() => onSelectFeedInspectorPost(post)}
                                >
                                  <div className="feed-card-head">
                                    <div className="feed-card-avatar" style={avatarStyle}>
                                      <span>{avatarLabel}</span>
                                    </div>
                                    <div className="feed-card-title-wrap">
                                      <h3 className={post.nodeType === "gate" ? "gate-node-title" : undefined}>
                                        {post.agentName}
                                      </h3>
                                      <div className="feed-card-sub">{post.roleLabel}</div>
                                    </div>
                                    <div className="feed-card-head-actions">
                                      <span
                                        className={`feed-score-badge ${
                                          isDraftPost ? "live" : post.status === "done" ? "good" : "warn"
                                        }`}
                                        title={isDraftPost ? "에이전트 작업 중" : `품질 점수 ${score}`}
                                      >
                                        {isDraftPost ? "LIVE" : score}
                                      </span>
                                      <div
                                        className="feed-share-menu-wrap feed-share-menu-wrap-head"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                        }}
                                      >
                                        <button
                                          aria-label="공유하기"
                                          className="feed-share-icon-button"
                                          onClick={() => setFeedShareMenuPostId((prev: any) => (prev === post.id ? null : post.id))}
                                          type="button"
                                        >
                                          <img alt="" aria-hidden="true" className="feed-share-icon" src="/share-svgrepo-com.svg" />
                                        </button>
                                        {feedShareMenuPostId === post.id && (
                                          <div className="feed-share-menu">
                                            <button onClick={() => void onShareFeedPost(post, "clipboard")} type="button">
                                              <span>텍스트 복사</span>
                                            </button>
                                            <button onClick={() => void onShareFeedPost(post, "json")} type="button">
                                              <span>JSON 복사</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                      <button
                                        aria-label="포스트 삭제"
                                        className="feed-delete-icon-button"
                                        disabled={!post.sourceFile}
                                        onClick={() => void onDeleteFeedPost(post)}
                                        type="button"
                                      >
                                        <img alt="" aria-hidden="true" className="feed-delete-icon" src="/xmark.svg" />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="feed-card-summary">{post.summary || "(요약 없음)"}</div>
                                  <button
                                    className="feed-more-button"
                                    aria-expanded={isExpanded}
                                    onClick={() =>
                                      setFeedExpandedByPost((prev: any) => ({
                                        ...prev,
                                        [post.id]: !prev[post.id],
                                      }))
                                    }
                                    type="button"
                                  >
                                    {isExpanded ? "접기" : "더보기"}
                                  </button>
                                  <div className={`feed-card-details ${isExpanded ? "is-expanded" : ""}`} aria-hidden={!isExpanded}>
                                    {upstreamSources.length > 0 ? (
                                      <section className="feed-card-input-sources">
                                        <div className="feed-card-input-sources-title">입력 출처</div>
                                        <ul>
                                          {upstreamSources.map((source: any, index: any) => (
                                            <li key={`${post.id}:source:${source.nodeId ?? source.agentName}:${index}`}>
                                              {formatFeedInputSourceLabel(source)}
                                            </li>
                                          ))}
                                        </ul>
                                      </section>
                                    ) : readableQuestion ? (
                                      <div className="feed-card-question">Q: {readableQuestion}</div>
                                    ) : null}
                                    {readableInputPreview && (
                                      <section className="feed-card-input-sources">
                                        <div className="feed-card-input-sources-title">
                                          전달 입력 스냅샷
                                          {post.inputContext?.truncated ? " (일부)" : ""}
                                        </div>
                                        <pre className="feed-sns-content">{readableInputPreview}</pre>
                                      </section>
                                    )}
                                    <FeedDocument className="feed-sns-content" text={visibleContent} />
                                    <div className="feed-evidence-row">
                                      <span>{formatRelativeFeedTime(post.createdAt)}</span>
                                      <span>생성 시간 {formatDuration((evidence as any).durationMs)}</span>
                                      <span>사용량 {formatUsage((evidence as any).usage)}</span>
                                      {pendingRequestCount > 0 && <span>추가 요청 대기 {pendingRequestCount}건</span>}
                                    </div>
                                    {canRequest && (
                                      <div className="feed-reply-row">
                                        <input
                                          onChange={(event) =>
                                            setFeedReplyDraftByPost((prev: any) => ({
                                              ...prev,
                                              [post.id]: event.currentTarget.value,
                                            }))
                                          }
                                          placeholder="에이전트에게 추가 요청을 남기세요"
                                          value={requestDraft}
                                        />
                                        <button
                                          aria-label="요청 보내기"
                                          className="primary-action question-create-button feed-reply-send-button"
                                          onClick={() => onSubmitFeedAgentRequest(post)}
                                          type="button"
                                        >
                                          <img alt="" aria-hidden="true" className="question-create-icon" src="/up.svg" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </section>
                              );
                            })}
                          </div>
                        </div>
                      </section>
                    );
                  })}
              </article>
            </article>
    </section>
  );
}
