# RAIL

> Local-first Multi-Agent Workflow Desktop for Codex + Web AI (Tauri + React + TypeScript)

RAIL은 여러 에이전트(코덱스/웹 AI/로컬 모델)를 **노드 그래프(DAG)** 로 연결해,
질문 수집 → 분석 → 검증 → 종합까지 한 번에 실행하는 데스크톱 앱입니다.

- 로컬 실행 중심 (Tauri)
- 실행 기록(run JSON) 기반 재현/검토
- 웹 AI는 API 키 없이 브라우저 확장(Web Connect)으로 반자동 연동

---

## Table of Contents

- [What It Solves](#what-it-solves)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Usage Guide](#usage-guide)
- [Web Connect Setup](#web-connect-setup)
- [Data & Persistence](#data--persistence)
- [Security Model](#security-model)
- [Architecture Rules (Guardrails)](#architecture-rules-guardrails)
- [Troubleshooting](#troubleshooting)
- [Development Scripts](#development-scripts)
- [Roadmap](#roadmap)

---

## What It Solves

단일 AI 채팅은 빠르지만, 다음 문제가 자주 생깁니다.

- 근거 부족/할루시네이션
- 긴 작업에서 컨텍스트 오염
- 검증/재현 어려움
- 역할 분업(조사/구현/검토/최종 종합) 부재

RAIL은 이 문제를 해결하기 위해,
**역할별 에이전트 노드 + 실행 로그 + 품질 게이트**를 결합합니다.

---

## Key Features

### 1) Workflow Canvas (노드 그래프)
- `Turn / Transform / Gate` 노드 구성
- 노드 연결, 선택, 드래그, 자동 정렬
- 실행/중지/되돌리기/다시하기
- 연결선 시각화 + 실행 상태 표시

### 2) Multi-Agent Execution
- Codex 기반 에이전트 실행
- 웹 에이전트(`web/gpt`, `web/gemini`, `web/claude`, `web/perplexity`, `web/grok`) 반자동 연동
- Ollama 로컬 모델 연결
- DAG 기반 상류 출력 → 하류 입력 자동 전달

### 3) Feed (결과/문서 뷰)
- 실행 결과를 카드 단위로 표시
- 요약/원문/입력 스냅샷/입력 출처 확인
- 추가 요청(후속 프롬프트) 전송
- 공유(텍스트/JSON 복사), 삭제
- 그룹(템플릿 실행 단위/사용자 정의 실행 단위) 접기/펼치기

### 4) Run Records (재현 가능한 실행 로그)
- `src-tauri/runs/run-*.json` 저장
- 상태 전이, provider trace, 품질 요약 보존
- 과거 실행 재검토 가능

### 5) Settings / Engine
- 엔진 시작/중지
- Codex 로그인/로그아웃
- 사용량 확인
- 작업 경로(CWD) 관리

### 6) Web Connect (브라우저 확장 연동)
- 로컬 루프백(`127.0.0.1`) + 토큰 기반 브리지
- 프롬프트 자동 주입/자동 전송 시도
- 실패 시 사용자 1회 전송으로 폴백
- 응답 자동 수집 후 다음 노드로 전달

---

## How It Works

1. 사용자가 Workflow 질문 입력
2. 시작 노드(또는 연결된 DAG) 실행
3. 각 노드가 입력을 처리
   - Turn: LLM 실행
   - Transform: 데이터 형태 변환
   - Gate: 조건 분기
4. 노드 출력은 다음 노드로 전달
5. 최종 노드 결과가 Feed/Run에 저장
6. 필요하면 Feed에서 후속 요청 → 해당 노드 재실행

---

## Project Structure

```txt
rail/
├─ src/
│  ├─ app/                # 앱 루트 조립
│  ├─ pages/              # 라우트 단위 페이지
│  ├─ components/         # 재사용 UI
│  ├─ features/           # 기능 단위 로직
│  ├─ shared/
│  │  ├─ tauri/           # Tauri IPC 래퍼(invoke/listen)
│  │  └─ lib/             # 공용 유틸
│  └─ i18n/
├─ src-tauri/             # Rust backend, run 저장
├─ extension/rail-bridge/ # Chrome MV3 확장(Web Connect)
├─ scripts/               # 도구 스크립트/검사 스크립트
├─ docs/
└─ public/
```

---

## Tech Stack

- Desktop: **Tauri v2**
- Frontend: **React 19 + TypeScript + Vite**
- Browser automation bridge: **Playwright Core + Chrome Extension (MV3)**
- Data format: JSON (graph/runs)

---

## Requirements

- Node.js 18+
- npm 9+
- Rust stable toolchain (Tauri 빌드용)
- macOS / Linux / Windows (Tauri 지원 환경)

---

## Quick Start

```bash
npm install
npm run dev
```

Tauri 데스크톱으로 실행:

```bash
npm run tauri dev
```

프로덕션 빌드:

```bash
npm run build
```

아키텍처 + 빌드 동시 검사:

```bash
npm run check
```

---

## Usage Guide

### A. 기본 실행

1. `워크플로우` 탭에서 템플릿 선택 또는 노드 직접 구성
2. 질문 입력
3. 실행 버튼 클릭
4. `피드` 탭에서 결과 카드 확인

### B. 피드에서 후속 요청

1. 결과 카드 펼치기
2. `에이전트에게 추가 요청` 입력
3. 전송 버튼 클릭
4. 후속 실행 결과가 같은 런 컨텍스트로 누적

### C. 그래프 저장/불러오기

- 저장: 현재 그래프를 파일로 저장
- 이름 변경: 저장 그래프명 수정
- 삭제: 그래프 파일 삭제
- 새로고침: 목록 재동기화

---

## Web Connect Setup

웹 AI를 API 키 없이 연동하는 방법입니다.

### 1) 확장 설치

1. Chrome `chrome://extensions` 진입
2. 개발자 모드 ON
3. `압축해제된 확장 프로그램 로드`
4. `extension/rail-bridge` 폴더 선택

### 2) 앱에서 연결 코드 발급

1. 앱 `웹 연결` 탭 이동
2. `연결 코드 복사`
3. 확장 팝업에 URL/토큰 입력 후 저장

### 3) 노드 설정

- 에이전트 실행기를 웹 계열로 선택 (`web/gpt` 등)
- 웹 결과 모드: `웹 연결 반자동(권장)`

### 4) 실행 동작

- 앱이 프롬프트 자동 주입/자동 전송 시도
- 자동 전송 실패 시에만 브라우저에서 1회 전송 필요
- 응답 완료 후 앱이 수집해 다음 노드로 전달

---

## Data & Persistence

- 그래프 파일: `graphs/*.json`
- 실행 기록: `src-tauri/runs/run-*.json`
- UI locale: browser localStorage (`rail_ui_locale`)

---

## Security Model

### 기본 원칙
- 로컬 우선 실행
- 민감 정보 최소 보관
- 브리지 통신 최소 권한

### Web Connect 보호
- `127.0.0.1` 루프백만 허용
- Bearer 토큰 인증
- 확장 ID allowlist 정책 지원
- 토큰 재발급 지원

### 개발 시 체크

```bash
bash scripts/secret_scan.sh --all
```

---

## Architecture Rules (Guardrails)

현재 레포에는 구조 재오염 방지를 위한 검사 스크립트가 포함되어 있습니다.

```bash
npm run check:arch
```

검사 항목:
- `src/main.tsx` 엔트리포인트 규칙
- 파일 라인수 제한(예외 목록 제외)
- 레이어 의존 방향
- cross-slice import 제한

---

## Troubleshooting

### 1) 웹 노드가 응답 없이 완료됨
- Web Connect 상태 확인
- 해당 서비스 탭 열림 여부 확인
- 확장 팝업 연결 테스트 재실행
- 자동 전송 실패 시 수동 1회 전송

### 2) 사용량 조회 실패
- 로그인 세션 상태 확인
- 엔진 버전에서 usage API 미지원일 수 있음

### 3) 그래프/피드가 기대와 다름
- 최신 run 파일 확인
- 동일 runId로 그룹핑되는지 확인
- 노드 연결(상류 → 하류) 점검

### 4) 개발 환경 성능 이슈
- dev 서버/워커 프로세스 중복 실행 여부 확인
- 불필요한 브라우저 자동화 세션 정리

---

## Development Scripts

- `npm run dev` : Vite 개발 서버
- `npm run tauri dev` : Tauri 개발 실행
- `npm run build` : 타입체크 + 번들
- `npm run check:arch` : 아키텍처 규칙 검사
- `npm run check` : 아키텍처 + 빌드 통합 검사

---

## Roadmap

- MainApp 대형 파일 추가 분해(FSD 강제)
- 페이지/기능별 테스트 보강
- 피드 문서 렌더링(표/차트/미디어) 고도화
- 실행/비용 관찰 지표 강화

---

## License

프로젝트 정책에 따릅니다. (라이선스 파일/고지 문서 참조)
