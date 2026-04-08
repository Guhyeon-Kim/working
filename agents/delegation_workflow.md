# Claude Code CTO — Orchestration Hub v5.2

> 에이전트 간 유기적 연결의 중추. 모든 에이전트는 이 문서의 프로토콜을 따른다.
> v5.0: 자기 성장 시스템 (ACL, 진화 규칙, GC, CLI 폴백)
> v5.1: 프로젝트 유형별 대응 + QA 캐스케이드 검수
> v5.2: SessionStart 메모리 로더 + evolving-guardrails 강화 + 30일 자동 아카이브

---

## 1. 권한 위계

```
CEO (\uc720\uc800 \u2014 \uc544\uc774\ub514\uc5b4\xb7\ubc29\ud5a5 \uacb0\uc815)
 \u2514\u2500\u2500 Claude Code (Sr. CTO 15yr+ \u2014 \ucd5c\ucd08 \uc9c0\uc2dc, \ucd5c\uc885 \ud310\ub2e8, \uc624\ucf00\uc2a4\ud2b8\ub808\uc774\uc158)
      \u251c\u2500\u2500 Gemini CLI  \u2192 \ub9ac\uc11c\uce58, \uae30\ud68d, \ub514\uc790\uc778 \ucd08\uc548 (\uac1c\ubc1c \uc678 \uc5c5\ubb34)
      \u251c\u2500\u2500 Codex CLI   \u2192 \uc18c\uc2a4 \ucf54\ub4dc \uad6c\ud604 (\uac1c\ubc1c \uc5c5\ubb34)
      \u2514\u2500\u2500 Plugin Agents \u2192 Gemini \ucd08\uc548 \uace0\ub3c4\ud654 + Codex 2\ucc28 \uac80\uc99d
```

---

## 2. End-to-End 완결 원칙

```
[불변 규칙] 시작이 있으면 반드시 끝까지.

페이지 유형별 최소 완결 범위:
  Type A (단일): 해당 페이지 5-State(기본/로딩/빈/에러/부분실패)
  Type B (목록+상세): 목록 → 상세 라우팅 동작까지
  Type C (CRUD): 목록 → 상세 → 등록 → 저장성공/실패/취소 전체 플로우

API 완결 범위:
  프론트에서 호출하는 모든 엔드포인트가 백엔드에 존재
  백엔드가 반환하는 모든 필드가 프론트에서 사용됨
  에러 응답(400/401/403/404/503)이 프론트에서 처리됨

위반 시: qa-agent가 BLOCK → 미완결 상태로 배포 불가
```

---

## 3. 5단계 파이프라인

### [1단계] 리서치·기획 — Gemini 초안 → CTO 고도화

```
Gemini CLI → .claude/docs/gemini-draft.md (초안)
  ↓
feature-dev:code-explorer → 기존 코드 패턴·의존성 분석 (자동)
  ↓
CTO → 초안 + 코드 분석 결합하여 고도화
  ↓
pm-agent (planning) → requirements.md + wireframe.md
  ↓
[CEO 확인①]
```

**역할 분담**:
- Gemini: 외부 리서치, 경쟁사 분석, 트렌드 조사, 초안 생성
- code-explorer: 기존 코드베이스에서 유사 패턴·재사용 가능 코드 탐색
- CTO: 두 결과를 종합하여 requirements 확정

### [2단계] 설계 — Gemini 초안 → CTO 고도화

```
data-agent → supabase/*-migration.sql + api-spec.md
  ↓
security-agent → 보안 리뷰 (Critical/High → BLOCK)
  ↓
Gemini CLI → 디자인 초안 (design-guide-v2.md 기준)
  ↓
feature-dev:code-architect → 아키텍처 블루프린트 (파일 구조, 컴포넌트, 데이터 흐름)
  ↓
CTO → 초안 + 블루프린트 결합 → design-spec.md 확정
```

**역할 분담**:
- Gemini: 디자인 초안, UI 참고자료 수집
- code-architect: 기존 패턴 기반 구현 블루프린트 (파일 목록, 빌드 순서)
- CTO: 명세 최종 확정, 게이트 체크

### [3단계] 구현 — Codex 실행

```
Codex CLI → frontend/src/ + backend/app/ 코드 작성
  ↓ (자동)
security-guidance 훅 → Edit/Write 시 실시간 보안 감지
  ↓ (자동, 구현 직후)
code-simplifier → 코드 정리·간소화
```

**격리 실행 기준**:
```
소규모 (1~5 파일): 기본 실행 (격리 없음)
대규모 (6+ 파일):  Agent(isolation: "worktree") 사용
  → 메인 브랜치 오염 없이 격리된 환경에서 Codex 실행
  → 검증 통과 후 worktree에서 변경사항 merge
```

**역할 분담**:
- Codex: 소스 코드 작성 (유일한 코드 구현 주체)
- security-guidance: PreToolUse 훅으로 자동 보안 체크
- code-simplifier: 구현 후 자동 정리 (중복 제거, 가독성 개선)
- CTO: Codex 지시어 작성, 인코딩 검증

### [4단계] 검증 — QA 캐스케이드 검수 (v5.1)

> 핵심 원칙: Claude Code 토큰 최소화.
> Gemini → Codex → Claude Code 순서로 검수. 어디서든 결함 → 수정 → 처음(1차-1)부터 재검수.
> CEO가 확인할 때는 이미 3중 검증 통과 상태.

#### 1차 검수 (Pre-deploy): 기획문서 vs 소스코드

```
[1차-1] Gemini 검수 (research-agent)
  입력: requirements.md + design-spec.md + 구현된 소스코드
  검증:
    - 기획 요구사항 대비 구현 누락/불일치
    - E2E 흐름 완결 (Type A/B/C별 최소 범위)
    - UI 텍스트, 라벨, 플로우 정확성
  결과: gemini-qa-report.md
  → 결함 발견? → 수정 → 다시 1차-1부터
  → PASS → 1차-2로

[1차-2] Codex 검수 (/codex:rescue)
  입력: 소스코드 + api-spec.md
  검증:
    - 빌드 (npm run build)
    - 타입 체크 (npx tsc --noEmit)
    - 린트 (npm run lint)
    - 코드 품질 (안티패턴, 보안 취약점, 인코딩)
  결과: codex-qa-report.md
  → 결함 발견? → 수정 → 다시 1차-1부터
  → PASS → 1차-3으로

[1차-3] Claude Code 검수 (CTO + qa-agent)
  입력: gemini-qa-report.md + codex-qa-report.md + 소스코드
  검증:
    - 아키텍처 정합성 (서버/클라이언트 분리, 상태관리)
    - 보안 게이트 (RLS, 인증, 키 노출)
    - 전체 흐름 완결 최종 판정
  병렬 보조 (중규모 이상):
    ├── pr-review-toolkit:code-reviewer (model: sonnet)
    ├── pr-review-toolkit:silent-failure-hunter (model: sonnet)
    └── pr-review-toolkit:type-design-analyzer (model: sonnet)
  결과: PASS / BLOCK
  → 결함 발견? → 수정 → 다시 1차-1부터
  → PASS → 5단계(배포)로
```

**캐스케이드 규칙**:
```
[불변] 어떤 단계에서 결함이 발견되면 수정 후 반드시 1차-1(Gemini)부터 재시작.
이유: 수정 과정에서 다른 부분이 깨질 수 있으므로 전체 재검증 필수.
효과: CEO가 확인할 때는 3중 검증 통과 → CEO 확인 항목 최소화.
```

**사용 기준**:
- 소규모 (1~2 파일): 1차-2(Codex) + 1차-3(qa-agent만) — Gemini 생략 가능
- 중규모 (3~10 파일): 전체 1차-1 → 1차-2 → 1차-3
- 대규모 (10+ 파일): 전체 + pr-review-toolkit 병렬 보조

#### 2차 검수 (Post-deploy): 스테이징/운영 실기기 확인

```
[2차] 배포 후 실기기 검증
  트리거: git push 후 배포 완료 감지 (post-push-hook.mjs)
  검증:
    - HTTP 상태 코드 (200 OK)
    - 주요 페이지 접근 가능 여부
    - 핵심 기능 동작 확인 (CEO 실기기 테스트)
  → PASS → 라이브 확정
  → FAIL → 롤백 또는 핫픽스 → 1차-1부터 재검수
```

### [5단계] 배포

```
commit-commands → /commit → /pr (표준화된 커밋·PR)
  ↓
hookify → 반복 실수 차단 규칙 적용
  ↓
[CEO 확인②] → 2차 검수 (실기기 확인) → 라이브
```

---

## 4. 파이프라인 변형

### 긴급 버그 (P0/P1 Fast Track)

```
CTO 원인 파악 → Codex 수정 → qa-agent → /commit → deploy
게이트 생략 가능. 사후 Decision Log 필수.
```

### 디자인 전면 개편 (REDESIGN-*)

```
design-guide-v2.md 확인 → Gemini 초안 → CTO 고도화
→ Codex 구현 → code-simplifier → qa-agent → /commit
소항목 패치 금지. 페이지 단위로만 작업.
```

### 리서치/교육/마케팅 (비개발)

```
Gemini CLI → 초안 → CTO 고도화 → CEO 리뷰
코드 변경 없으므로 Codex·검증 단계 생략.
```

---

## 4-1. 프로젝트 유형별 대응 (v5.1)

> 하나의 글로벌 하네스로 개인/팀/회사 프로젝트를 모두 지원한다.
> 프로젝트 루트의 `.claude/project-config.json`으로 유형을 선언.

### project-config.json 구조

```json
{
  "projectType": "personal",
  "projectName": "B급서비스",
  "team": [],
  "deployUrl": "https://www.blevels.com",
  "securityLevel": "standard",
  "codeOwnership": "full"
}
```

### 유형별 차이

| 항목 | personal | team | company |
|------|----------|------|---------|
| 코드 소유권 | full (자유 수정) | shared (PR 필수) | restricted (리뷰 필수) |
| 보안 수준 | standard | elevated | strict |
| 배포 | 직접 push | PR → merge | PR → 리뷰 → merge |
| 커밋 메시지 | 자유 형식 | Conventional Commits | 회사 컨벤션 |
| 브랜치 전략 | main 직접 | feature → main | feature → dev → main |
| CEO 확인 | 선택적 | PR 리뷰 | 필수 리뷰 |
| 민감 정보 | .env 주의 | .env 금지 + vault | .env 금지 + vault + 감사 |

### CTO 행동 규칙

```
[프로젝트 유형 감지]
  1. .claude/project-config.json 읽기
  2. 없으면 기본값: personal (현재 동작 유지)

[personal] 기존 워크플로우 그대로.
  - main 직접 push 가능
  - CEO 확인은 신규 기능/대규모 변경에만

[team] 협업 모드.
  - 반드시 feature 브랜치에서 작업
  - PR 생성 필수 (main 직접 push 금지)
  - 커밋 메시지: Conventional Commits (feat:, fix:, chore: 등)
  - 다른 팀원 코드 수정 시 주의 — git blame 확인 후 진행

[company] 엔터프라이즈 모드.
  - feature 브랜치 필수 + PR 리뷰 필수
  - 회사 코드 컨벤션 준수 (.claude/docs/code-conventions.md 참조)
  - 민감 정보 절대 금지 (security-agent 자동 감사)
  - 라이선스 호환성 확인 필수 (새 패키지 추가 시)
  - 커밋에 이슈/티켓 번호 포함
```

### 훅 동작 차이

```
enforce-delegation.mjs:
  personal → 기존 규칙 (3줄 이상 Codex 위임)
  team     → 동일 (위임 규칙은 프로젝트 유형과 무관)
  company  → 동일

on-prompt.sh:
  personal → 기존 위험 감지
  team     → 기존 + "다른 팀원 파일 변경" 감지 (향후)
  company  → 기존 + 컴플라이언스 키워드 감지 (향후)

post-push-hook.mjs:
  personal → deployUrl로 사이트 체크
  team     → PR 생성 알림만 (직접 push 아님)
  company  → PR 생성 + 리뷰어 자동 지정 (향후)
```

---

## 5. 핸드오프 프로토콜

### 시작 (수신)

```
□ 이전 단계 산출물 파일 존재 확인 (없으면 BLOCK)
□ 산출물에서 직접 읽기 (대화 맥락 의존 금지 — 파일이 진실의 근거)
□ 산출물 내용이 현재 작업에 충분한지 검증
□ 페이지 유형(A/B/C) 확인 → 작업 범위 결정
□ project-log에 [in-progress] 기록
```

### 종료 (송신)

```
□ 산출물 파일 저장 완료
□ 1차 자체 검증 (self-review 스킬) 통과
□ 다음 단계에 필요한 정보가 산출물에 모두 포함됐는지 확인
□ CTO에게 완료 보고 (표준 형식)
□ project-log에 [done] 기록
```

### 표준 완료 보고

```
[{역할} 완료] {기능명}
산출물: {파일 경로}
페이지 유형: {A/B/C}
완결 상태: {전체 플로우 확인 / 미완결 항목}
→ 다음: {다음 단계}
```

---

## 6. 산출물 체인

| 단계 | 산출물 | 소비자 |
|------|--------|--------|
| 리서치 | `.claude/docs/gemini-draft.md` | pm-agent, CTO |
| 기획 | `.claude/docs/requirements.md` | data, security, design, qa |
| 기획 | `.claude/docs/wireframe.md` | design |
| 설계(DB) | `supabase/*-migration.sql` | CEO(실행), security |
| 설계(API) | `.claude/docs/api-spec.md` | frontend, backend, qa |
| 설계(UI) | `.claude/docs/design-spec.md` | frontend |
| 구현 | `frontend/src/`, `backend/app/` | 검증 단계 전체 |
| 검증 | QA 리포트 (터미널) | CTO → CEO |
| 보안 | `.claude/docs/security-report-*.md` | CTO |

---

## 7. CLI 호출 표준

### Gemini — 리서치/초안

```bash
gemini -p "
[UTF-8 without BOM 필수. 한국어에 CP949/EUC-KR 사용 금지]
{작업 내용}
"
```

### Codex — 코드 구현

```bash
# VSCode / Codespaces
codex exec --full-auto -C frontend "{명세}"
codex exec --full-auto -C backend "{명세}"

# Firebase Studio (LandlockRestrict 우회)
codex exec --dangerously-bypass-approvals-and-sandbox -C frontend "{명세}"
```

### Codex 필수 지시어

```
모든 파일은 UTF-8 without BOM으로 저장.
한국어 문자열은 유니코드 이스케이프: '\uc804\ub7b5'
async params 패턴 필수 (Next.js 15+).
TypeScript any 금지, unknown + 타입 가드.
파일 읽기 시 전체 읽기 금지 — offset/limit 또는 grep으로 필요 범위만 읽을 것.
```

---

## 8. 게이트 체크리스트

### 구현 전 (CTO)

```
□ 화면구조 확정 (페이지 유형 A/B/C)
□ 데이터 입출력 확정 (api-spec.md)
□ 예외처리 시나리오 확정
□ 보안 리스크 검토 / 인프라 비용 영향
```

### 구현 후 (CTO)

```
□ 인코딩: broken: 0
□ 빌드: npm run build PASS
□ 보안: 하드코딩 키 / 권한 가드 누락 없음
□ E2E 완결: 시작→끝 전체 플로우 동작
□ 새 패키지 > 50kb → CEO 확인
```

---

## 9. 장애 대응 (자동 폴백 시스템)

> v5.0: cli-health-check.mjs가 세션 시작 시 CLI 가용성을 자동 감지.
> v5.2: session-start-memory.mjs가 이전 세션 학습 결과를 새 세션에 주입.
> enforce-delegation.mjs가 `.claude/cli-status.json`을 참조하여 폴백 모드 자동 전환.

### 세션 시작 시 메모리 로딩 (v5.2)

```
SessionStart
  → session-start-memory.mjs:
    1. evolving-rules.json 로딩 → 반복 에러 경고 (count >= 2: 주의, >= 3: 시급)
    2. failure-cases.md → 등록된 장애 사례 수 알림
    3. success-patterns.md → 등록된 성공 패턴 수 알림
    4. cli-status.json → 이전 세션 CLI 불가 상태 알림
    5. acl-state.json → 미해결 빌드 에러 알림
```

### 자동 감지 → 폴백 흐름

```
UserPromptSubmit
  → cli-health-check.mjs: codex/gemini --version 실행 (3초 timeout)
  → .claude/cli-status.json 갱신
  → CLI 불가 시 stderr 경고

PreToolUse (Bash|Write|Edit)
  → enforce-delegation.mjs: cli-status.json 확인
  → CLI 정상: 기존 위임 규칙 적용 (차단)
  → CLI 불가: 차단 우회 + 폴백 경고
    - Rule 1,2: gemini/codex 직접 호출 허용
    - Rule 4: 코드 줄 임계값 3줄 → 50줄로 완화
```

### 폴백 매트릭스

| 상황 | 자동 감지 | 폴백 | 복원 |
|------|-----------|------|------|
| Codex CLI 불가 | cli-health-check.mjs | CTO 직접 구현 (50줄 제한) | 다음 세션에서 자동 복원 |
| Gemini CLI 불가 | cli-health-check.mjs | CTO 직접 리서치 (WebSearch 차단 유지) | 다음 세션에서 자동 복원 |
| 둘 다 불가 | cli-health-check.mjs | 완전 폴백 모드 | 다음 세션에서 자동 복원 |
| Plugin Agent 장애 | — (수동) | CTO가 해당 역할 직접 수행 | — |
| Supabase 불가 | — (수동) | 로컬 mock → 복구 후 통합 | — |
| Cloud Run 장애 | — (수동) | 로컬 테스트 → 원인 파악 후 재배포 | — |

---

## 10. 모델 라우팅 (비용 최적화)

> OMC·Ruflo의 "스마트 모델 라우팅" 개념 도입.
> 작업 복잡도에 따라 모델을 선택하여 토큰 30~40% 절감.

### 라우팅 테이블

| 작업 유형 | 권장 모델 | 근거 |
|----------|----------|------|
| 단순 파일 수정, 오타, 포맷팅 | **Haiku** | 판단 불필요, 속도 우선 |
| 코드 리뷰 (pr-review-toolkit 병렬) | **Sonnet** | 패턴 매칭 충분, Opus 불필요 |
| 코드 정리 (code-simplifier) | **Sonnet** | 구조 파악 수준이면 충분 |
| 리서치·기획 초안 | **Gemini** | 외부 CLI (기존 유지) |
| **기획 고도화·정제** | **Opus** | Gemini 초안 → Opus 고도화 (Sonnet 불가, CEO 확인) |
| 소스 코드 구현 | **Codex** | 외부 CLI (기존 유지) |
| 아키텍처 설계·판단 | **Opus** | 복잡한 트레이드오프 분석 필요 |
| 보안 감사·게이트 판단 | **Opus** | 위험 판단은 최고 모델 |
| QA 최종 판정 | **Opus** | PASS/BLOCK 결정 권한 |
| CTO 오케스트레이션 | **Opus** | 전체 흐름 제어 |

### 적용 방법

```
# Agent 호출 시 model 파라미터 지정
Agent(subagent_type="pr-review-toolkit:code-reviewer", model="sonnet", ...)
Agent(subagent_type="code-simplifier:code-simplifier", model="sonnet", ...)

# 단순 탐색·검색은 Haiku
Agent(subagent_type="Explore", model="haiku", ...)
```

### 에스컬레이션 규칙

```
Haiku로 시작 → 판단 불확실 시 Sonnet으로 재시도
Sonnet으로 시작 → 아키텍처 결정 필요 시 Opus로 에스컬레이션
Opus는 다운그레이드 없음 (최종 판단 계층)
```

---

## 11. 병렬 실행 강화

> Ruflo의 "자동 병렬화" 개념 도입.
> 의존성 없는 작업은 항상 동시 실행.

### 병렬 가능 구간

```
[2단계 설계]
  data-agent ─┬─ security-agent (data 의존)
              └─ Gemini 디자인 초안 (data 비의존) ← 병렬 가능
                   └─ code-architect (디자인 의존)

[3단계 구현 → 4단계 전환]
  Codex 구현 완료 후:
  ┌─ code-simplifier (코드 정리)
  └─ 테스트 케이스 초안 작성 (Gemini)  ← 병렬 가능

[4단계 검증] (기존 병렬 + 명시적 규칙)
  반드시 병렬:
  ├── code-reviewer (model: sonnet)
  ├── silent-failure-hunter (model: sonnet)
  ├── type-design-analyzer (model: sonnet)
  ├── comment-analyzer (model: sonnet)
  └── pr-test-analyzer (model: sonnet)
  → 전부 완료 후 qa-agent (model: opus) 최종 판정
```

### 병렬 금지 (순차 필수)

```
security-agent → 구현 (보안 게이트 통과 전 코드 작성 금지)
qa-agent BLOCK → Codex 수정 (BLOCK 원인 파악 후 수정)
CEO 확인① → 2단계 진입 (기획 승인 전 설계 금지)
```

---

## 12. 성공 패턴 학습

> OMC·Ruflo 공통 "자체 학습 시스템" 개념 도입.
> failure-cases.md(실패 방지) + success-patterns.md(성공 반복) = 양방향 학습.

### 기록 시점

```
파이프라인 정상 완료 시:
  → "이번에 특히 잘 된 포인트" 1~2줄 기록
  → .claude/agents/memory/success-patterns.md에 추가

CEO "됐어요" / "좋아" 확인 시:
  → 해당 접근법을 패턴으로 기록
```

### 활용

```
세션 시작 시 (자동):
  session-start-memory.mjs → evolving-rules.json, failure-cases.md, success-patterns.md 자동 로딩
  → 반복 에러 경고 + 장애/성공 사례 수 알림

유사 작업 시작 시 (수동):
  failure-cases.md → "이건 하지 말 것" 확인
  success-patterns.md → "이렇게 하면 잘 됨" 참조
  → 두 파일 모두 확인 후 작업 시작
```

---

## 13. 반복 버그 레지스트리 (자동 연동)

> v5.2: evolving-guardrails.mjs가 evolving-rules.json에서 패턴을 자동 감지하여 등재 제안.
> count >= 2: hookify 권장 / count >= 3: 등재 시급 / count >= 5: failure-cases.md + CLAUDE.md 등재 권고
> 30일+ 미발생 패턴: 자동 아카이브 (해결 간주)

| # | 버그 | 해결 |
|---|------|------|
| 1 | async params (Next.js 15+) | `params: Promise<{}>` + `await params` |
| 2 | 서버/클라이언트 혼용 | `page.tsx`(서버) + `XxxClient.tsx`(클라이언트) |
| 3 | Supabase 클라이언트 구분 | 서버: `createServerClient` / 클라: `createBrowserClient` |
| 4 | TypeScript any | `unknown` + 타입 가드 |
| 5 | 환경변수 모듈 레벨 | 함수 내 `os.getenv()` 직접 호출 |
| 6 | Router prefix 중복 | `prefix="/stocks"` + `@router.get("/kr/...")` |
| 7 | 한국어 인코딩 | 유니코드 이스케이프 + `broken: 0` 검증 |
| 8 | Hydration 에러 | `Date.now()`, `Math.random()` → `useEffect` 내부만 |

### 자동 등재 프로세스

```
evolving-rules.json에서 count >= 3인 패턴 발견
  → evolving-guardrails.mjs가 stderr로 등재 제안
  → CTO가 위 테이블에 추가 + Codex 지시어(§7)에 반영
  → /hookify:hookify로 PreToolUse 차단 규칙 생성
  → evolving-rules.json에서 hookified: true 마킹
```

---

## 14. Harness 최적화 원칙

> v4.1 신규. 하네스 패턴 기반 토큰 절감 + 성능 향상 규칙.

### 14-1. 컨텍스트 격리 (Context Isolation)

```
[절대 규칙] 서브에이전트에는 최소 필요 정보만 전달한다.

위임 시:
  ✅ 작업에 필요한 파일 경로만 명시
  ✅ 산출물은 파일로 저장 후 경로만 반환
  ✅ 구조화된 요약만 상위로 전달
  ❌ 원시 데이터(전체 파일 내용, 로그 덤프) 직접 전달 금지
  ❌ 이전 단계의 대화 히스토리 전달 금지

Agent 호출 예시:
  Agent(prompt="api-spec.md 기준으로 /stocks 엔드포인트 구현. 산출물: backend/app/routers/stocks.py")
  → 필요한 파일 경로 + 산출물 경로만 전달
  → 에이전트가 직접 파일을 읽어서 작업
```

### 14-2. 외과적 도구 사용 (Surgical Tool Use)

```
[토큰 절감 핵심] 필요한 정보만 정확히 획득한다.

파일 읽기:
  ✅ Read(file, offset=100, limit=30)  — 필요한 30줄만
  ✅ Grep(pattern, path)               — 관련 코드만 검색
  ❌ Read(file)                         — 2000줄 전체 읽기

코드베이스 탐색:
  ✅ Glob("src/**/*.tsx") → 특정 패턴만
  ✅ Grep("functionName") → 정의 위치만
  ❌ ls -R / find . 전체 트리 덤프

Codex 지시어에도 동일 원칙 적용 (§7 참조).
```

### 14-3. 단계 전환 규칙 (Managed History)

```
[Lost in the Middle 방지] 단계 전환 시 대화 맥락에 의존하지 않는다.

규칙:
  1. 각 단계의 결과물은 반드시 파일에 저장 (§6 산출물 체인)
  2. 다음 단계 시작 시 산출물 파일에서 직접 읽기
  3. "아까 말한 것처럼" 같은 대화 참조 금지 — 파일이 진실의 근거
  4. CTO가 단계 간 브리지 역할: 이전 단계 요약 → 다음 단계 지시어에 포함

효과:
  - SDK의 자동 히스토리 압축이 효율적으로 동작
  - 긴 세션에서도 중간 정보 유실 없음
  - 에이전트가 항상 최신 상태의 산출물 기반으로 작업
```

### 14-4. 비동기 실행 기준 (Background Execution)

```
[run_in_background: true 사용 기준]

사용:
  ✅ 4단계 pr-review-toolkit 5개 병렬 검증
  ✅ Gemini 리서치 (결과 즉시 불필요할 때)
  ✅ 빌드/테스트 등 장시간 프로세스

사용 금지:
  ❌ 결과가 다음 작업의 입력인 경우 (순차 의존성)
  ❌ Gate 판단이 필요한 에이전트 (security, qa)

완료 처리:
  → 완료 알림(notification) 수신 후 결과 처리
  → polling/sleep으로 대기 금지
  → 대기 중 독립 작업 수행 가능
```

### 14-5. 안티패턴 (금지)

```
[하네스 효율을 저해하는 패턴]

1. Raw Relay: 서브에이전트 결과를 필터링 없이 다음 에이전트에 직접 전달
   → 오류 전파 + 토큰 낭비. 반드시 CTO가 검증·요약 후 전달.

2. Context Stuffing: 메인 오케스트레이터에서 모든 파일 직접 읽기
   → 컨텍스트 소진. 탐색·분석은 서브에이전트에 위임.

3. History Hoarding: "혹시 필요할까" 하고 이전 대화 전부 유지
   → Lost in the Middle 발생. 단계 전환 시 산출물 파일 기반으로 리셋.

4. Sequential Everything: 의존성 없는 에이전트를 순차 실행
   → 시간 낭비. §11 병렬 구간 참조.

5. Over-delegation: 5줄 수정에 서브에이전트 3개 호출
   → 오버헤드 > 이득. 단순 작업은 CTO가 직접 수행.
```

---

## 15. 자기 성장 시스템 (Self-Improving Harness)

> v5.0 신규. 4가지 자동화 메커니즘으로 하네스가 스스로 진화한다.

### 15-1. 자동 교정 루프 (ACL — Automatic Correction Loop)

```
[빌드/타입/린트 에러 발생 시 자동 수정 재시도]

PostToolUse(Bash: npm run build / npx tsc / npm run lint)
  → acl-post-build.mjs
  → exit code != 0?
     → YES: acl-state.json 재시도 카운터 확인
        → retries < 3: stderr 교정 지시 → Claude 자동 수정 → 재실행
        → retries >= 3: CEO 개입 요청 + 카운터 초기화
     → NO: 카운터 초기화 + quality-gate-log.md PASS 기록

SubagentStop (Codex 작업 완료)
  → acl-subagent-stop.mjs
  → npx tsc --noEmit → npm run build 자동 실행
  → 실패 시 교정 지시 / 성공 시 PASS 기록
```

**핵심**: PostToolUse는 도구 실행 직후에 발생하므로 Claude의 다음 행동을 유도 가능.
Stop 이벤트와 달리 "감지 → 수정 → 재시도" 루프가 사람 개입 없이 동작.

### 15-2. 진화하는 울타리 (Evolving Guardrails)

```
[같은 실수 반복 → 자동으로 더 강한 방어 구축]

Stop 이벤트
  → evolving-guardrails.mjs
  → acl-state.json + quality-gate-log.md에서 실패 수집
  → evolving-rules.json에 패턴 축적 (키워드 매칭)
  → count >= 2: hookify 규칙 생성 제안
  → count >= 3: 반복 버그 레지스트리(§13) 등재 제안

패턴 ID 자동 매핑:
  "error TS"     → typescript-error
  "async params" → async-params
  "broken"       → encoding-broken
  "Module not found" → module-not-found
  "Hydration"    → hydration-mismatch
```

**hookify 통합**: 자동 생성이 아닌 **제안** 방식.
CTO 판단 → `/hookify:hookify` → PreToolUse 규칙 생성 → hookified: true 마킹.

### 15-3. 자동 품질 점검 / GC (Garbage Collection)

```
[24시간마다 코드 품질 자동 스캔]

UserPromptSubmit
  → quality-gc.mjs
  → gc-state.json 확인 → 24시간 경과?
     → YES: quality-scan.mjs 실행
            - 안티패턴: console.log, any, localhost, TODO/FIXME
            - 미사용 export: import 참조 없는 export
            - 대형 파일: 300줄 이상
            → gc-report.md 생성 + stderr 요약
     → NO: 스킵
```

### 15-4. CLI 자동 폴백 (CLI Auto-Fallback)

```
[Codex/Gemini CLI 불가 시 자동 감지 → 우아한 성능 저하]

UserPromptSubmit
  → cli-health-check.mjs: codex/gemini --version (3초 timeout)
  → .claude/cli-status.json 갱신

PreToolUse
  → enforce-delegation.mjs: cli-status.json 참조
  → CLI 정상: 기존 위임 규칙 (차단)
  → CLI 불가: 차단 우회 + 코드 임계값 3줄 → 50줄 완화
  → 다음 세션에서 자동 복원 (매 세션 재체크)
```

### 15-5. 전체 훅 아키텍처

```
UserPromptSubmit ──→ cli-health-check.mjs   (CLI 가용성)
                 ──→ quality-gc.mjs          (GC 스캔)
                 ──→ on-prompt.sh            (작업 기록, 위험 감지)

PreToolUse ───────→ enforce-delegation.mjs   (위임 규칙 + 폴백)

PostToolUse(Bash) → acl-post-build.mjs       (자동 교정 루프)
                  → post-push-hook.mjs       (배포 후 점검)

SubagentStop ────→ acl-subagent-stop.mjs     (서브에이전트 후 검증)

Stop ────────────→ on-stop.sh                (완료 기록, 인코딩 게이트)
                 → evolving-guardrails.mjs   (진화하는 규칙)
```

### 데이터 흐름

```
acl-state.json ←── acl-post-build.mjs (쓰기) ──→ evolving-guardrails.mjs (읽기)
quality-gate-log.md ←── acl-*.mjs (쓰기) ──→ evolving-guardrails.mjs (읽기)
evolving-rules.json ←── evolving-guardrails.mjs (읽기/쓰기) ──→ CTO 판단 → hookify
cli-status.json ←── cli-health-check.mjs (쓰기) ──→ enforce-delegation.mjs (읽기)
gc-state.json ←── quality-gc.mjs (읽기/쓰기)
gc-report.md ←── quality-scan.mjs (stdout) ←── quality-gc.mjs (저장)
```
