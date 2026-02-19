# SPEC: Tauri + Codex app-server 기반 그래프 에이전트 오케스트레이터 (MVP)

## 1) 목표
Tauri 데스크톱 앱에서 `codex app-server --listen stdio://`를 자식 프로세스로 실행하고, stdio(JSONL) 기반 JSON-RPC로 통신하여 그래프 기반 에이전트 오케스트레이션을 제공한다.

MVP는 다음을 반드시 포함한다.
- 화면
1. 그래프 에디터: 노드/엣지 추가/삭제, 드래그 이동, 연결
2. Run 버튼
3. 노드별 로그/상태 패널
4. 승인(approval) 모달
- 엔진
1. `src-tauri`에서 app-server spawn
2. stdin/stdout JSONL transport 구현
3. 필수 프로토콜 시퀀스 구현 (initialize/login/thread/turn/interrupt/approvals)
- 안전 기본값
1. 초기 `sandboxPolicy=readOnly`
2. approvals UI 완성 후 `workspaceWrite` 확장

## 2) 범위 / 비범위
### 범위 (MVP)
- 단일 워크스페이스에서 단일 실행 세션을 안정적으로 수행
- 그래프 편집, 실행, 취소, 승인 응답
- 실시간 델타/로그 스트리밍 반영
- 최소한의 영속화(JSON 파일 또는 local storage)

### 비범위 (MVP 이후)
- 멀티 세션 동시 실행
- 클라우드 동기화
- 고급 협업 기능(동시 편집, 권한 모델)
- 복잡한 스케줄러/큐/재시도 정책

## 3) 아키텍처 개요
- Frontend (React/TS)
  - 그래프 편집 UI, 실행 제어, 로그/상태 표시, approval 모달
- Tauri Backend (Rust)
  - `codex app-server` 프로세스 lifecycle 관리
  - JSONL framing + JSON-RPC request/response 매핑
  - 이벤트 스트림을 프런트로 브로드캐스트
- Child Process
  - `codex app-server --listen stdio://`

데이터 흐름:
1. 프런트가 Tauri command 호출 (`engine_initialize`, `engine_run_graph`, `engine_interrupt`, `engine_approval_response` 등)
2. Rust 엔진이 JSON-RPC request 전송
3. app-server 응답/notification 수신
4. Rust가 내부 상태 갱신 후 Tauri event emit
5. 프런트가 노드 상태/로그/UI 업데이트

## 4) 권장 폴더 구조
현 템플릿 구조를 유지하면서 아래처럼 확장한다.

```text
.
├─ SPEC.md
├─ src/
│  ├─ app/
│  │  ├─ store.ts
│  │  └─ events.ts
│  ├─ features/
│  │  ├─ graph/
│  │  │  ├─ GraphEditor.tsx
│  │  │  ├─ graphModel.ts
│  │  │  └─ graphValidation.ts
│  │  ├─ run/
│  │  │  ├─ RunButton.tsx
│  │  │  ├─ NodeStatusPanel.tsx
│  │  │  └─ ApprovalModal.tsx
│  │  └─ engine/
│  │     ├─ engineClient.ts
│  │     └─ engineTypes.ts
│  ├─ App.tsx
│  └─ main.tsx
└─ src-tauri/
   └─ src/
      ├─ lib.rs
      ├─ engine/
      │  ├─ mod.rs
      │  ├─ process.rs
      │  ├─ transport_jsonl.rs
      │  ├─ rpc.rs
      │  ├─ state.rs
      │  ├─ protocol.rs
      │  └─ approvals.rs
      └─ commands/
         ├─ mod.rs
         └─ engine_commands.rs
```

## 5) 프로토콜 필수 구현 (MVP)
모든 메시지는 JSON-RPC 2.0 객체를 줄바꿈(JSONL) 단위로 송수신한다.

### 5.1 initialize 핸드셰이크
필수 규칙:
1. app-server 시작 직후 `initialize` request 전송
2. `initialize` response 성공 후 `initialized` notification 전송
3. `initialize` 완료 전, 다른 request를 보내지 않는다
4. 문서 규약대로 initialize 이전 요청이 오면 `Not initialized` 에러로 처리

클라이언트 측 정책:
- Engine state가 `Initialized` 이전이면 `run/login/thread/turn` 관련 command를 UI에서 disable
- 방어적으로 Rust에서도 동일 검증

### 5.2 로그인 (ChatGPT auth)
필수 시퀀스:
1. `account/login/start` request (`type=chatgpt`)
2. 응답의 `authUrl`을 Tauri opener로 열기
3. `account/updated` notification에서 `authMode=chatgpt` 확인
4. 확인 후 Engine state를 `Ready`로 전환

타임아웃/실패:
- 로그인 대기 타임아웃(예: 5분)
- 실패 시 재시도 버튼 제공

### 5.3 실행 및 스트리밍
필수 시퀀스:
1. `thread/start`
2. `turn/start`
3. notification 스트리밍 처리
   - `item/agentMessage/delta`
   - 기타 `item/*` 이벤트 (노드 로그/상태 반영)

MVP 처리 원칙:
- 노드별 로그 버퍼 + 최종 메시지 스냅샷 유지
- 델타는 append-only로 처리하고 UI에서 점진 렌더링

### 5.4 취소
- 실행 중 `turn/interrupt` 전송 가능
- interrupt 성공 시 running 노드를 `Cancelled`로 전환
- 서버 후속 이벤트가 늦게 도착해도 idempotent하게 무시/정리

### 5.5 approvals
수신 이벤트:
- `item/commandExecution/requestApproval`
- `item/fileChange/requestApproval`

동작:
1. 해당 노드를 `WaitingApproval` 상태로 전환
2. Approval 모달 표시 (요청 상세 + 위험 표시)
3. 사용자 선택에 따라 accept/decline 응답 전송
4. 응답 결과를 로그/상태에 기록

보안 기본:
- 기본값은 `Decline` (모달 닫힘/타임아웃 시 자동 거절)
- 자동 승인 없음

## 6) 상태머신
### 6.1 Engine 상태
상태 정의:
- `Idle`: 프로세스 미기동
- `Starting`: app-server spawn 중
- `Initializing`: initialize/initialized 시퀀스 진행
- `AuthPending`: login 진행 중(authUrl 오픈 및 account/updated 대기)
- `Ready`: 실행 가능
- `Running`: turn 실행 중
- `Interrupting`: interrupt 요청 후 확인 대기
- `Error`: 복구 가능한 오류
- `Stopped`: 프로세스 종료

전이 요약:
1. `Idle -> Starting -> Initializing -> AuthPending -> Ready`
2. `Ready -> Running -> Ready`
3. `Running -> Interrupting -> Ready`
4. 모든 상태에서 치명적 실패 시 `Error` 또는 `Stopped`

가드 조건:
- `Initializing` 이전의 실행 관련 API 호출 금지 (`Not initialized`)
- `Running` 중 중복 `turn/start` 금지

### 6.2 Node 실행 상태
상태 정의:
- `Draft`: 편집 중, 미실행
- `Queued`: 실행 대기
- `Running`: 실행 중
- `Streaming`: delta 수신 중
- `WaitingApproval`: 승인 대기
- `Succeeded`: 성공 종료
- `Failed`: 실패 종료
- `Cancelled`: 인터럽트/거절로 중단

전이 예:
1. `Draft -> Queued -> Running -> Streaming -> Succeeded`
2. `Running/Streaming -> WaitingApproval -> Running`
3. `Running/Streaming -> Failed`
4. `Running/Streaming/WaitingApproval -> Cancelled`

## 7) 데이터 모델 (Graph JSON)
MVP 직렬화 포맷 제안:

```json
{
  "version": 1,
  "graphId": "graph-uuid",
  "name": "My Flow",
  "sandboxPolicy": "readOnly",
  "nodes": [
    {
      "id": "node-1",
      "type": "agent",
      "label": "Planner",
      "position": { "x": 120, "y": 80 },
      "config": {
        "model": "gpt-5-codex",
        "instructions": "...",
        "thread": { "reuse": false }
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-1",
      "target": "node-2",
      "condition": "always"
    }
  ],
  "run": {
    "entryNodeId": "node-1",
    "stopOnError": true,
    "maxSteps": 100
  },
  "ui": {
    "selectedNodeId": "node-1",
    "viewport": { "x": 0, "y": 0, "zoom": 1 }
  }
}
```

런타임 분리 원칙:
- Graph JSON에는 런타임 이벤트 로그를 저장하지 않는다
- 런타임 상태는 별도 메모리 상태(또는 session store)로 관리

런타임 상태 예시:

```json
{
  "runId": "run-uuid",
  "engineState": "Running",
  "nodeStates": {
    "node-1": {
      "status": "Streaming",
      "startedAt": "2026-02-19T10:00:00Z",
      "updatedAt": "2026-02-19T10:00:03Z",
      "logs": ["..."]
    }
  },
  "pendingApprovals": [
    {
      "approvalId": "appr-1",
      "nodeId": "node-1",
      "kind": "commandExecution",
      "summary": "Run shell command ..."
    }
  ]
}
```

## 8) 안전 기본값
초기 정책:
- `sandboxPolicy=readOnly`
- file write/command execution은 승인 없이는 불가
- approval 모달이 완성되기 전까지 `workspaceWrite` 옵션 노출 금지

확장 정책:
- approval UX 및 감사 로그가 준비되면 `workspaceWrite`를 opt-in으로 활성화
- 정책 변경은 사용자 명시 동의 + 경고 문구 필요

## 9) 단계별 Done Criteria
### Phase 1: 엔진 기초
- `codex app-server --listen stdio://` spawn/종료 안정 동작
- JSONL 송수신(부분 라인/멀티바이트 안전) 구현
- JSON-RPC request id 매핑, timeout, 에러 표준화
- initialize -> initialized 시퀀스 및 사전 요청 차단 완료

### Phase 2: 인증/실행 루프
- `account/login/start(type=chatgpt)` 구현
- `authUrl` 오픈 및 `account/updated authMode=chatgpt` 확인
- `thread/start -> turn/start` 실행 성공
- `item/agentMessage/delta` 스트리밍 UI 반영
- `turn/interrupt` 취소 동작 및 상태 정합성 보장

### Phase 3: 그래프 UI MVP
- 노드/엣지 추가/삭제/연결/드래그 이동 동작
- Run 버튼으로 entry node 실행
- 노드별 로그/상태 패널 반영
- 그래프 JSON 저장/복원

### Phase 4: approvals + 안전 확장
- `item/commandExecution/requestApproval` 처리
- `item/fileChange/requestApproval` 처리
- approval 모달 accept/decline 응답 완성
- readOnly 기본 정책 고정 + workspaceWrite opt-in 토글(기본 off)

### Phase 5: 안정화
- 통합 테스트 + 수동 시나리오 체크리스트 통과
- 프로세스 비정상 종료/재시작 복구 동작 확인
- 로그/에러 메시지 사용자 가독성 개선

## 10) 테스트 전략
### 단위 테스트 (Rust)
- JSONL framing(라인 분할, partial read)
- JSON-RPC request/response correlation
- Engine state transition guard

### 계약 테스트 (Protocol)
- initialize 이전 요청 시 실패 검증
- login/start -> account/updated 이벤트 처리 검증
- thread/start/turn/start 스트리밍 이벤트 파싱 검증
- approval request -> accept/decline roundtrip 검증

### E2E 테스트
- 앱 실행 -> 로그인 -> 간단 그래프 실행 -> interrupt -> 재실행
- approval 발생 시 모달 표시/응답/로그 반영

## 11) 위험요소 및 대응
### 위험 1: app-server가 experimental이라 프로토콜/필드 변경 가능
대응:
- `codex` CLI 버전 고정(예: package manager lock + 명시적 버전 정책)
- CI에서 버전 드리프트 감지(허용 범위 밖이면 실패)
- 프로토콜 어댑터 레이어(`protocol.rs`)로 앱 내부 모델과 분리

### 위험 2: stdio 스트림 불안정(버퍼링/부분 메시지/교착)
대응:
- 비동기 읽기 루프 + 라인 버퍼 누적 파서
- write queue + backpressure 처리
- heartbeat/timeout + 강제 재시작 루틴

### 위험 3: 승인 누락/오처리로 인한 안전 문제
대응:
- 승인 요청 수신 시 실행 자동 정지 상태 강제
- 모달 미응답 timeout 시 기본 거절
- 모든 승인 결정 감사 로그 기록

### 위험 4: 런타임 상태와 그래프 편집 상태 불일치
대응:
- Graph(정적)와 Runtime(동적) 상태 store 분리
- 이벤트 소스 단일화(Rust emit -> Front reducer)
- runId/threadId 기준으로 stale 이벤트 무시

## 12) 구현 메모 (MVP)
- 우선순위
1. Engine 프로토콜 신뢰성
2. Run/Interrupt/Approval end-to-end
3. 그래프 UI 편의성
- 실패 허용 전략
  - 치명 오류 발생 시 세션 리셋 버튼 제공
  - 로그 패널에 원인/복구 가이드 노출

---
본 SPEC은 MVP 구현 기준 문서이며, app-server 문서 변경 시 `프로토콜 필수 구현`과 `상태머신` 섹션을 우선 갱신한다.
