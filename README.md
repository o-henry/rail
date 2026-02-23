# RAIL

노드 기반 에이전트 워크플로우를 데스크톱에서 실행/검증/기록하는 Tauri + React 앱입니다.  
구성은 Next.js/Vite 계열의 실무 README 스타일(개요 → 빠른 시작 → 사용법 → 문제해결)을 참고해 정리했습니다.

## 핵심 기능

- 워크플로우 캔버스
  - Turn / Transform / Gate 노드 추가, 연결, 실행
  - 자동 레이아웃 정렬(행/열 배치)
  - 실행 중 엣지(연결선) 데이터 흐름 dot 애니메이션
- 피드 뷰
  - 실행 결과/요약/로그/점수 확인
  - 추가 요청, 공유, 포스트 삭제
- 기록 뷰
  - 실행 파일 목록 및 상세 추적(전이, 품질, provider trace)
- 설정 뷰
  - Codex 로그인/사용량 확인
  - 웹 provider 세션 열기 및 상태 동기화
  - 그래프 파일 저장/불러오기/이름변경/삭제

## 기술 스택

- Frontend: React 19, TypeScript, Vite
- Desktop Shell: Tauri v2 (Rust)
- Web automation worker: Node.js + Playwright Core

## 프로젝트 구조

```text
rail/
├─ src/                 # React UI
├─ src-tauri/           # Tauri(Rust) backend commands
├─ scripts/
│  ├─ web_worker/       # 웹 provider 세션/자동화 워커
│  ├─ install_git_hooks.sh
│  └─ secret_scan.sh
├─ graphs/              # 저장된 그래프 JSON
├─ runs/                # 실행 기록 JSON
└─ public/              # 아이콘/정적 리소스
```

## 요구사항

- Node.js 18+
- Rust toolchain (stable)
- macOS/Linux/Windows (Tauri 지원 환경)

## 빠른 시작

1) 의존성 설치

```bash
npm install
```

2) 프론트엔드 개발 서버

```bash
npm run dev
```

3) 데스크톱 앱 실행(Tauri)

```bash
npm run tauri dev
```

4) 프로덕션 빌드

```bash
npm run build
```

## 사용 가이드

### 1) 워크플로우 구성

- 워크플로우 탭에서 노드를 추가하고 연결합니다.
- 연결/노드 변경 시 레이아웃이 자동 정렬됩니다.

### 2) 실행

- 상단 질문 입력 후 실행 버튼을 누릅니다.
- 실행 상태는 노드와 피드에서 동시에 확인할 수 있습니다.

### 3) 피드 확인

- 결과 요약, 상세 로그, 점수, 사용량을 확인합니다.
- 필요하면 추가 요청을 보내 후속 실행을 유도할 수 있습니다.

### 4) 그래프 파일 관리

- 설정/노드설정의 그래프 파일 영역에서:
  - `저장`: 현재 그래프 저장
  - `이름 변경`: 선택한 파일명을 새 이름으로 변경(동일 이름 있으면 overwrite)
  - `삭제`: 선택한 그래프 파일 삭제
  - `새로고침`: 파일 목록 재동기화

## 데이터 저장 위치

- 그래프: `graphs/*.json`
- 실행 기록: `runs/*.json`
- 웹 워커 로그/프로필: 사용자 홈 디렉터리 하위 `.rail/` (환경에 따라 다를 수 있음)

## 단축키

- `Cmd/Ctrl + 1~4`: 탭 이동
- `H` 또는 한글 `ㅗ`: 캔버스 이동 모드 토글
- `Cmd/Ctrl + A`: 노드 전체 선택
- `Delete/Backspace`: 선택 노드/엣지 삭제

## 문제 해결

- provider 세션 에러 발생 시
  - 설정 탭에서 해당 provider `로그인` 후 `상태 동기화`
- 그래프 목록이 최신이 아닐 때
  - `새로고침` 버튼으로 재조회
- CPU 사용량이 비정상적으로 높을 때
  - 웹 워커 프로세스 상태를 확인하고 앱 재시작

## 보안 가드레일

이 저장소는 커밋/푸시 시 일반적인 시크릿 패턴(API 키, 토큰, 개인키)을 차단합니다.

```bash
bash scripts/install_git_hooks.sh
bash scripts/secret_scan.sh --all
```

CI에서도 동일 스캐너를 실행합니다.
