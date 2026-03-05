# RAIL

RAIL은 Tauri 기반 로컬 우선 워크플로우 데스크톱 앱입니다.
현재 버전은 그래프 실행을 `DAG`/`RAG` 모드로 분리해, 일반 노드 오케스트레이션과 데이터 수집형 문서 생성을 한 앱에서 처리합니다.

---

## 현재 탭 구성

- `대시보드`: 실행 상태/최근 결과 확인
- `그래프`: 캔버스 기반 워크플로우 편집 및 실행 (`DAG`, `RAG` 토글)
- `데이터베이스`: 실행 산출물(문서/JSON) 조회 및 관리
- `설정`: 런타임/환경 설정

---

## 그래프 모드

### DAG 모드
- 일반 그래프 노드(턴/변환/게이트 등) 구성 및 실행
- 노드 단위 실행 상태와 로그 확인

### RAG 모드
- VIA 계열 파이프라인을 RAIL 내부에 내장한 실행 모드
- 템플릿 기반 파이프라인 생성
  - `주식/마켓`, `커뮤니티`, `뉴스`, `SNS`
- 주요 수집/처리 노드
  - `trigger.manual`
  - `source.*` (`news`, `sns`, `community`, `market`, `dev` 등)
  - `transform.normalize`, `transform.verify`, `transform.rank`
  - `agent.codex`
  - `export.rag`

---

## RAG 동적 크롤링 옵션

RAG에서 `source.*` 노드를 선택하면 우측 워크스페이스에 동적 크롤링 옵션이 표시됩니다.

입력 필드:
- `키워드 (쉼표)`
- `국가 코드 (쉼표, 예: KR,US,JP,CN)`
- `사이트/URL (쉼표 또는 줄바꿈)`
- `최대 수집 건수 (숫자)`

### 동적 크롤링 프리셋 (4종)
- `마켓 핫토픽`
- `커뮤니티 핫토픽`
- `뉴스 헤드라인`
- `SNS 트렌드`

권장 사용 순서:
1. RAG 템플릿 적용
2. 소스 노드 선택
3. 동적 프리셋 적용 또는 직접 입력
4. 실행

주의:
- 템플릿을 다시 적용하면 노드가 재구성되면서 커스텀 옵션이 초기화될 수 있습니다.
- 국가 코드는 지원 목록 외 값이 무시될 수 있습니다.
- 최대 수집 건수는 내부 제한(최대 120)이 적용됩니다.

---

## 런타임 구조 (내장형 VIA)

외부 `/via` 저장소 없이 RAIL 내부 런타임으로 동작합니다.

- Python 런타임: `scripts/via_runtime/`
- Tauri 브리지 명령:
  - `via_health`
  - `via_run_flow`
  - `via_get_run`
  - `via_list_artifacts`
- 앱 최초 실행 시 워크스페이스 기준 부트스트랩:
  - `/.rail/.venv_via` 생성 및 의존성 준비

데이터 경로(워크스페이스 기준):
- 런타임 데이터: `/.rail/via/`
- RAG 산출물: `/.rail/via-docs/rag/{flow-name}/{run-id}/`

---

## 빠른 시작

```bash
npm install
npm run tauri:dev
```

웹 UI만 실행:

```bash
npm run dev
```

빌드:

```bash
npm run build
```

전체 체크:

```bash
npm run check
```

---

## 프로젝트 구조

```txt
src/
  app/                # 앱 조립, 상태, 런타임 핸들러
  pages/              # 대시보드/그래프/데이터베이스/설정 화면
  features/           # 도메인 로직 (workflow, studio, presets 등)
  styles/             # 페이지/레이아웃 스타일
scripts/via_runtime/  # 내장 VIA Python 런타임
src-tauri/            # Rust bridge 및 시스템 명령
```

---

## 문서

- 보안: [SECURITY.md](./SECURITY.md)
- 약관: [TERMS.md](./TERMS.md)
- 면책: [DISCLAIMER.md](./DISCLAIMER.md)
- 서드파티 고지: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
