# 에이전트 카탈로그 (Agents Catalog)

**양식**: agents-catalog v1.0
**작성일**: 2026-04-22

---

## 0. 이 문서의 목적

7개 공통 에이전트의 개요·역할·호출 방법을 한눈에 정리한다. 각 에이전트의 상세
프롬프트는 `agents/<id>.md`에 있다.

---

## 1. 에이전트 목록

| ID | 역할 | 주 CLI | 주 MCP |
|---|---|---|---|
| [researcher](../../agents/researcher.md) | 리서치·벤치마킹 | Gemini | Context7 |
| [planner](../../agents/planner.md) | 요건정의·기획 고도화 | Claude | Notion |
| [copywriter](../../agents/copywriter.md) | 마케팅·카피 조정 | Gemini + Claude | — |
| [designer](../../agents/designer.md) | UI·정보구조 | Claude | Figma |
| [builder](../../agents/builder.md) | Front/Backend 구현 | Codex | Context7, Supabase |
| [tester](../../agents/tester.md) | 테스트·디버깅 | Codex | Playwright |
| [curator](../../agents/curator.md) | 컨텍스트·로그·메모리 | Claude | Notion |

---

## 2. 간단 설명

### researcher
경쟁 조사, 시장 리서치, 기술 스택 비교, 레퍼런스 수집. Gemini의 긴 컨텍스트와
검색 기반으로 정보를 모으고 구조화한다. **결정은 하지 않음** (정보 제공만).

### planner
CEO의 아이디어를 구체 요구사항으로 변환. 백로그·우선순위·수용 기준 정의. 결정은
CEO에게 선택지로 제시. **Claude 내장 기능** (CLI delegate 최소).

### copywriter
랜딩·이메일·푸시·광고 카피. Gemini로 초안 다수 생성 후 Claude가 컨텍스트
적합성 검토 → 최종 제안 2~3개를 CEO에 제시.

### designer
UI·정보구조·사용자 플로우. Figma MCP로 기존 디자인 참조하거나 신규 와이어프레임
제안. Tailwind 기반 코드 출력 가능. 디자인 시스템 준수.

### builder
Frontend·Backend 구현의 주력. Codex CLI 경유로 코드 생성·수정. Context7 MCP로
최신 라이브러리 문서 조회. Supabase MCP로 DB 마이그레이션·RLS 확인.

### tester
테스트 작성·실행·디버깅. Playwright MCP로 E2E 테스트. **BLOCK 판정 권한 보유**
(배포 차단 가능). `builder`가 만든 것을 독립적으로 검증.

### curator
세션·프로젝트 컨텍스트 관리. Notion MCP로 devlog·기획 문서 업로드·정리. 장기
메모리 관리. 온보딩 문서 작성.

---

## 3. 호출 방법

### 3-1. delegate.mjs 경유 (원칙)

모든 에이전트 호출은 `scripts/delegate.mjs`를 통한다:

```bash
node scripts/delegate.mjs <cli> <agent-id> "<prompt>"
```

예시:
```bash
node scripts/delegate.mjs gemini researcher \
  "한국 개인투자자 대상 행동재무학 앱 Top 10 조사"

node scripts/delegate.mjs codex builder \
  "허브와이즈 편향지수 계산 엔드포인트 POST /api/bias/score 구현"

node scripts/delegate.mjs codex tester \
  "POST /api/bias/score에 대한 Playwright E2E 테스트 작성"
```

### 3-2. Claude 직접 호출 (planner, curator)

`planner`와 `curator`는 Claude 자체 기능이므로 Claude Code 세션 내에서 직접
작업:

```
planner 역할로 다음 요건을 정리해줘:
<CEO 아이디어>
```

또는 에이전트 파일을 참조 요청:

```
agents/planner.md 를 읽고 그 가이드에 따라 다음 아이디어를
요건서로 작성해줘: <아이디어>
```

### 3-3. 에이전트 사슬 (작업 패턴별)

**β 패턴 (제품 신기능)**:
```bash
# 1. 요건 정리 (planner)
# Claude 직접 수행

# 2. 구현 (builder)
node scripts/delegate.mjs codex builder "<요건 기반 구현 지시>"

# 3. 테스트 (tester)
node scripts/delegate.mjs codex tester "<동일 기능의 E2E 테스트>"
```

CTO(Claude)가 이 순서를 조율하고 결과를 통합.

---

## 4. 경계 (각 에이전트가 하지 않는 것)

### researcher
- ❌ 의사결정 (정보만 제공)
- ❌ 코드 작성 (builder로 위임)
- ❌ 제품 전략 수립 (planner로 위임)

### planner
- ❌ 구현 (builder로)
- ❌ 테스트 작성 (tester로)
- ❌ 리서치 (researcher로)

### copywriter
- ❌ 기능 결정 (planner로)
- ❌ 디자인 (designer로)

### designer
- ❌ 비즈니스 로직 결정 (planner로)
- ❌ 백엔드 스키마 (builder로)

### builder
- ❌ 테스트 (tester로, 독립성 유지)
- ❌ 요건 판단 (planner로)
- ❌ 디자인 시스템 결정 (designer로)

### tester
- ❌ 구현 자체 (builder로)
- ❌ 디자인 평가 (designer로)

### curator
- ❌ 요건 정리 (planner로)
- ❌ 구현 (builder로)

---

## 5. v5.3 에이전트와 매핑

v5.3의 15개 에이전트가 v6.0의 7개에 어떻게 흡수됐는지:

| v5.3 에이전트 | v6.0 매핑 | 비고 |
|---|---|---|
| pm-agent | planner | 역할 거의 동일, 이름 단순화 |
| research-agent | researcher | 4축 라우팅은 researcher 프롬프트에 흡수 |
| design-agent | designer | Figma MCP 연계 유지 |
| data-agent | builder | DB 스키마·API 계약은 builder가 처리 |
| frontend-agent | builder | 통합 (Front/Back 분리 불요) |
| backend-agent | builder | 통합 |
| qa-agent | tester | 이름 변경, BLOCK 권한 유지 |
| security-agent | (Claude 내장) | builder·tester의 판단에 내재화 |
| infra-agent | (Claude 직접) | δ 패턴으로 CTO가 직접 처리 |
| context-agent | curator | 이름 변경 |
| invest-content-agent | (프로젝트 레포) | 허브와이즈 전용, working에서는 제외 |
| invest-education-agent | (프로젝트 레포) | 동일 |
| invest-trading-agent | (프로젝트 레포) | 동일 |
| marketing-agent | copywriter | 이름 변경, 역할 구체화 |

**흡수 원칙**:
- 범용적 역할 → 7개 공통 에이전트 중 하나로
- 프로젝트 특화 → 해당 프로젝트 레포의 `agents/` 로
- 판단·결정 역할 → Claude 내장 (CTO가 직접)

v5.3의 15개 에이전트 파일은 `agents/_archive/`에 보존. 필요 시 참조 가능.

---

## 6. 에이전트 추가·변경 규칙

### 6-1. 에이전트는 7개로 고정

- 성장 방향: 에이전트 추가 X, 스킬·훅 고도화 O
- 신규 역할 필요 시 기존 에이전트 프롬프트 강화로 해결 우선

### 6-2. 예외: 프로젝트 특화 에이전트

working 레포에는 7개만. 프로젝트 레포(hubwise-invest 등)는 도메인 특화
에이전트 추가 가능:

- 허브와이즈: `invest-domain` (행동재무학 용어·분석 특화)
- 컨텐츠 자동화: `content-pipeline` (특정 채널 최적화)
- 블레벨: (추가 예정 없음. α 패턴으로 충분)

이들은 해당 레포의 `agents/` 에 있고, working에는 반영되지 않음.

### 6-3. 에이전트 프롬프트 버전업

- 유형 A 버전업 규칙 적용 (`docs/current/doc-management.md` §2-1)
- 기존 프롬프트를 `docs/asis/agent-<id>-v<old>.md`로 복사 후 덮어쓰기
- 에이전트 프롬프트 파일 상단의 버전 필드 업데이트

---

## 7. 스킬·MCP 연계

각 에이전트가 주로 사용하는 스킬·MCP는 `agents/<id>.md`의 "사용 자산" 섹션에
나열. 단 **스킬·MCP는 공용 자산이므로 어느 에이전트든 필요 시 호출 가능**.

예:
- `error-handling` 스킬은 builder가 주로 쓰지만 tester도 호출 가능
- `Notion MCP`는 curator가 주로 쓰지만 planner가 기획 업로드에도 씀

에이전트가 "내 전담 스킬"을 배타적으로 소유하지 않는다.

---

## 8. 버전 변경 이력

| 버전 | 날짜 | 주요 변경 |
|---|---|---|
| v1.0 | 2026-04-22 | 초안. 7 에이전트 정의, v5.3→v6.0 매핑, 경계 명시 |
