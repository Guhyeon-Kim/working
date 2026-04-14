# CLAUDE.md — Working Hub

> HubWise/BiLevel 제외, 모든 작업의 중앙 허브 (회사/개인/일정)
> Claude Code Dotfiles v6.2 | 최종 업데이트: 2026-04-10

---

## 프로젝트 개요

이 저장소는 코드 구현 저장소가 아닌 **작업 컨트롤 타워**.
리서치, 기획, 산출물 작성, 외부 서비스 연동, 프로젝트 관리를 여기서 수행한다.
실제 코드 프로젝트는 필요 시 별도 repo를 생성한다.

## 언어

모든 응답, 문서, 커밋 메시지는 **한국어**로 작성한다. 기술 용어와 코드 식별자는 원문 유지.

## 디렉토리 구조

```
/workspaces/working/
├── agents/              # 15개 전문 에이전트 (.md)
│   ├── delegation_workflow.md  # 오케스트레이션 허브 v5.3
│   └── memory/          # 누적 학습 (failure-cases, success-patterns 등)
├── skills/              # 19개 스킬 (SKILL.md) — truth source
├── hooks/               # 13개 훅 (.mjs/.sh) — truth source, settings.json은 user 경로 참조
├── docs/                # 문서 (에이전트-셋팅.md 등)
├── .claude/             # Claude Code 상태 파일
│   ├── commands/project/ # 커스텀 슬래시 커맨드 (/project:*)
│   └── agents/memory/   # evolving-rules.json
└── scripts/             # delegate.mjs (위임 래퍼)
```

## 핵심 규칙

1. **Codex/Gemini CLI 직접 호출 금지** — 반드시 `delegate.mjs` 경유
2. **QA BLOCK = 배포 불가** — qa-agent가 하나라도 BLOCK이면 머지/배포 금지
3. **End-to-End 완결** — 시작한 작업은 반드시 끝까지 (delegation_workflow.md §2)
4. **비파괴 우선** — git push --force, reset --hard 등 파괴적 명령 전 반드시 확인
5. **산출물 정합성** — 요건명세 → 와이어프레임 → 플로우 → 테스트 시나리오 간 필드/예외 일치
6. **repo → user 동기화 규칙** — `agents/`, `skills/`, `hooks/`는 repo가 truth. 새 파일/수정은 repo에 먼저 반영한 뒤 `~/.claude/` 하위로 복사. settings.json이 user 경로를 참조하므로 복사 빠지면 silently 실패함.
7. **user-scope = 모든 프로젝트 공통 인프라** — `~/.claude/settings.json`과 user-scope MCP 서버는 Working Hub뿐 아니라 **하네스가 패치된 모든 프로젝트에 그대로 전파**된다. 따라서 Working Hub의 쓰임새만 보고 MCP/권한을 제거하면 안 된다. "하위 코드 프로젝트에서 필요한가?" 기준으로 판단할 것. 예: Playwright는 Working Hub에선 안 쓰지만 QA agent의 E2E BLOCKING 요건 때문에 user-scope에 상주해야 함.
8. **크로스 플랫폼 필수** — 유저는 Codespace(Linux)와 Windows(VSCode/cmd) 양쪽에서 Claude Code를 사용한다. 훅은 `.mjs`(Node.js)만 작성, `.sh`는 Windows cmd에서 실행 불가. 경로는 `path.join()`, 환경변수는 OS별 문법 모두 안내. user-scope는 머신별 독립이므로 repo 업데이트 후 양쪽 환경에서 `node scripts/sync-user-scope.mjs` 실행이 동기화 방법.

## 에이전트 파이프라인 (5단계)

```
[1] 리서치·기획  — research-agent(Gemini) → pm-agent → CEO 컨펌
[2] 설계        — design-agent → data-agent (스키마+API 계약)
[3] 구현        — frontend-agent + backend-agent (Codex CLI 경유)
[4] 검증        — qa-agent(BLOCK/PASS) + security-agent(STRIDE)
[5] 배포        — infra-agent → post-push-hook → 헬스체크
```

## 멀티 AI 체계

| AI | 역할 | 호출 방법 |
|----|------|-----------|
| Claude Code (Opus) | CTO 오케스트레이션, 최종 판단 | 직접 |
| Gemini CLI | 리서치, 기획 초안, 디자인 초안 | `delegate.mjs gemini` |
| Codex CLI | 소스 코드 구현 | `delegate.mjs codex` |

### Gemini 모델 체인 정책 (2026-04-13 기준)

`delegate.mjs`는 target에 따라 자동으로 모델 체인을 선택하고 일시 오류 시 폴백한다.

| target | 기본 체인 | 전략 |
|--------|----------|------|
| `research`, `design` | preview → 2.5-pro → 2.5-flash | **품질 우선** — 최신 preview가 가용하면 사용, 용량 초과 시 안정 모델로 자동 하강 |
| 그 외 (`frontend`, `backend`, `education`, `marketing`) | 2.5-pro → 2.5-flash | **재현성 우선** — preview 생략 |

**현재 primary preview:** `gemini-3.1-pro-preview` (2026-04-13 확인)

**신규 모델 출시 시 대응 (예: `gemini-3.2-pro-preview` 출시)**:
```bash
# 1회성 override
GEMINI_MODEL_CHAIN="gemini-3.2-pro-preview,gemini-2.5-pro,gemini-2.5-flash" \
  node scripts/delegate.mjs gemini research "..."

# 또는 primary만 교체
GEMINI_MODEL="gemini-3.2-pro-preview" node scripts/delegate.mjs gemini research "..."
```
체인 영구 변경은 [scripts/delegate.mjs](scripts/delegate.mjs)의 `GEMINI_CHAINS` 상수 업데이트.

**폴백 트리거**: 429, RESOURCE_EXHAUSTED, MODEL_CAPACITY_EXHAUSTED, ETIMEDOUT, 5xx, "too many requests", "no capacity"
**폴백 안 함**: ModelNotFound, 인증 실패, 문법 오류 등 재시도해도 동일한 결과가 나올 오류

## MCP 연동 (10개 정상)

**claude.ai 커넥터 (7개)**: Notion, Supabase, Figma, Vercel, Make, Google Calendar, Gmail
**user-scope 로컬 (3개)**: Playwright, Context7, GitHub
**미사용**: Slack (claude.ai dynamic scope, 해제 대기)

용도:
- **Notion**: 기획 산출물 저장, 제안서·리서치 정리
- **Supabase / Vercel**: DB·배포 (코드 프로젝트)
- **Figma**: 디자인 참조·코드 생성
- **Make**: 외부 자동화 워크플로
- **Google Calendar / Gmail**: 일정·메일 관리
- **Playwright**: QA agent E2E 검증 (BLOCKING 요건)
- **Context7**: 최신 라이브러리 문서 주입 (코드 생성 품질)
- **GitHub**: PR·issue·repo 관리 (Codespace `GITHUB_TOKEN` 자동 활용)

## 자동 의도 라우팅

사용자가 자연어로 말하면 Claude가 의도를 파악하여 자동으로 적절한 워크플로우를 실행한다.
사용자가 커맨드를 외우거나 직접 입력할 필요 없다.

| 사용자 발화 예시 | 자동 실행 |
|----------------|----------|
| "~서비스 만들고 싶어" / "~기획해줘" | `.claude/commands/project/plan.md` 워크플로우 |
| "~에 대해 조사해줘" / "~벤치마킹" | `.claude/commands/project/research.md` 워크플로우 |
| "지금 뭐하고 있었지?" / "현황 알려줘" | `.claude/commands/project/status.md` 워크플로우 |
| "pm한테 시켜" / "보안 감사해줘" | `.claude/commands/project/delegate.md` → 해당 에이전트 |
| "산출물 검토해줘" / "빠진 거 없나?" | `.claude/commands/project/review.md` 워크플로우 |
| "노션에 정리해줘" | `.claude/commands/project/notion.md` 워크플로우 |
| "일정 잡아줘" / "캘린더에 넣어줘" | Google Calendar MCP 직접 실행 |
| "메일 확인해줘" | Gmail MCP 직접 실행 |
| "Figma 보여줘" / figma.com URL | Figma MCP 직접 실행 |
| "상세하게 계획 세워줘" / "꼼꼼하게 기획해줘" / "제대로 설계해줘" | `/ultraplan` 제안 (아래 참조) |
| "이 프로젝트에 하네스 적용해줘" / "구조 세팅해줘" | `.claude/commands/project/patch.md` 워크플로우 |
| "팀 만들어" / "병렬로 작업해" | Agent Teams 자동 구성 (아래 참조) |

### Ultraplan 자동 제안 기준

다음 조건에 해당하면 ultraplan 사용을 제안한다:
- 사용자가 **"상세하게" / "꼼꼼하게" / "제대로" / "깊게" / "정밀하게"** 등 품질 강조 표현 사용
- **섹션별 리뷰**가 필요한 복잡한 기획 (아키텍처 설계, 대규모 마이그레이션, 멀티 서비스 연동)
- 사용자가 **"웹에서 보고 싶어" / "브라우저에서" / "PR로 만들어줘"** 등 웹 리뷰 요청

제안 형식:
```
이 작업은 ultraplan이 적합합니다.
- 웹에서 섹션별 코멘트로 정밀 리뷰 가능
- 터미널은 자유롭게 다른 작업 가능
- 완성 후 웹 실행(→PR) 또는 터미널 복귀 선택

ultraplan으로 진행할까요?
```

제안만 하고 **사용자가 승인해야** `/ultraplan`을 실행한다. 단순 기획은 일반 plan.md 워크플로우로 충분하므로 무조건 ultraplan을 쓰지 않는다.

**라우팅 규칙:**
1. 사용자 발화에서 의도를 파악한다 (기획/리서치/위임/리뷰/정리/일정/메일 등)
2. 해당 커맨드 .md 파일을 읽고 그 안의 실행 순서를 따른다
3. 의도가 불명확하면 한 문장으로 확인한다 ("기획을 시작할까요, 리서치만 할까요?")
4. 복합 요청이면 파이프라인 순서대로 실행한다
5. 품질 강조 표현이 있으면 ultraplan 제안을 검토한다

**수동 커맨드도 지원** (`/` 입력 후 자동완성에서 선택):
`/project:plan`, `/project:research`, `/project:status`, `/project:delegate`, `/project:review`, `/project:notion`

## 사고 깊이 자동 조절

작업 복잡도에 따라 토큰을 효율적으로 사용한다. 무조건 깊게 생각하지 않는다.

| 작업 유형 | effort 수준 | 이유 |
|-----------|------------|------|
| 상태 확인, 단순 조회, 파일 읽기 | low | 판단 불필요, 실행만 |
| 문서 정리, 포맷팅, 노션 업로드 | low~medium | 구조화만 필요 |
| 리서치 결과 정리, 일반 산출물 작성 | medium | 적절한 분석 필요 |
| 요건 정의, 와이어프레임, 플로우차트 | high | 예외 케이스·정합성 판단 필요 |
| 아키텍처 설계, 보안 감사, QA 판정 | max | 깊은 추론 필수 |
| 복수 산출물 간 정합성 교차 검증 | max | 누락 방지에 최대 사고 필요 |

**적용 규칙:**
1. 작업 시작 시 복잡도를 판단하고 적절한 수준으로 사고한다
2. 같은 세션 내에서도 작업이 바뀌면 수준을 조절한다
3. 사용자가 "깊게 생각해" / "대충 해줘" 등으로 오버라이드 가능
4. 토큰 절약이 목적 — 단순 작업에 max를 쓰지 않는다

### 품질 강조 트리거 → ultrathink / ultraplan 분기

사용자가 **"상세하게 / 꼼꼼하게 / 제대로 / 깊게 / 집중해서 / 최대한 / 고민해서 / 정밀하게"** 등 품질 강조 표현을 쓰면 작업 성격에 따라 다르게 대응한다.

| 작업 성격 | 대응 | 설명 |
|-----------|------|------|
| **구현·수정·디버깅·리팩터** | **ultrathink(=max effort)** 자동 적용 | 코드 수정 작업은 웹 리뷰가 과함 → 즉시 max effort로 깊게 추론하고 실행. 승인 요청 없이 바로 진행. |
| **기획·설계·아키텍처** | **ultraplan 제안** | 웹에서 섹션별 리뷰가 필요 → `/ultraplan` 사용 제안 후 사용자 승인 대기. |
| **리서치·조사** | **max effort + 출처 검증 강화** | Gemini 위임 + 교차 검증 |

**ultrathink 자동 트리거 예시:**
- "상세하게 수정해줘" / "꼼꼼하게 고쳐줘" / "제대로 디버깅해봐" / "깊이 고민해서 구현" → 즉시 max effort
- "이슈를 집중해서 해결해줘" / "최대한 꼼꼼하게 봐줘" → 즉시 max effort

**판단 기준:** 파일을 수정하거나 코드를 쓰는 작업이면 ultrathink, 문서/기획/아이데이션이면 ultraplan.

## 원격·모바일 작업

| 기능 | 사용법 | 용도 |
|------|--------|------|
| **Remote Control** | `/remote-control` 또는 `claude --rc` | 폰/태블릿에서 진행중 세션 이어서 작업. 외출 중 기획 리뷰 |
| **Channels** | `--channels plugin:telegram@claude-plugins-official` | Telegram/Discord로 모바일에서 메시지 푸시. CI 결과 수신 |
| **Ultraplan** | `/ultraplan [작업]` 또는 프롬프트에 ultraplan 포함 | 웹에서 섹션별 리뷰, 터미널 자유 |

**자동 제안 기준:**
- "밖에서도 확인하고 싶어" / "폰으로 볼 수 있어?" → Remote Control 제안
- "텔레그램으로 알려줘" / "CI 결과 받고 싶어" → Channels 안내

## 반복·예약 작업

| 기능 | 사용법 | 용도 |
|------|--------|------|
| **`/loop`** | `/loop 5m 배포 상태 확인` | 세션 내 반복 폴링 (배포 헬스체크, PR 상태) |
| **리마인더** | "3시에 릴리즈 브랜치 푸시 알려줘" | 자연어 일회성 알림 |
| **Scheduled Tasks** | `/schedule` (클라우드) | 세션 종료 후에도 작동하는 예약 작업 |

**자동 제안 기준:**
- "배포 끝나면 알려줘" → `/loop` 제안
- "매일 아침 PR 확인" → Scheduled Tasks 안내

## Agent Teams 자동 관리

실제 코드 프로젝트 repo에서 복잡한 구현 작업 시, Claude가 작업 성격을 판단하여 팀을 자동 구성한다.

**자동 제안 기준:**
- 3개 이상 독립 모듈/파일을 동시에 수정해야 할 때
- 프론트엔드 + 백엔드 + 테스트를 병렬로 진행할 때
- 멀티 관점 리뷰가 필요할 때

**Claude가 하는 일:**
1. 작업 분석 → 병렬화 가능 여부 판단
2. 팀원 수/역할 동적 결정 (3~5명 권장)
3. 사용자에게 구성안 제안 → 승인 후 실행
4. 팀 생성 → 태스크 분배 → 진행 모니터링 → 결과 취합 → 팀 정리

**제안하지 않는 경우:**
- 단일 파일 수정, 순차적 의존성이 강한 작업
- 기획/리서치 단계 (서브에이전트가 더 효율적)
- 이 Working Hub repo에서의 작업 (코드 구현이 아니므로)

## 크로스 플랫폼 동기화

Codespace(Linux)와 Windows 로컬에서 같은 훅·스킬·전역 설정을 유지하려면 **repo 업데이트 후 양쪽 환경에서 한 번씩** 실행:

```bash
# Linux / macOS / Codespace
node scripts/sync-user-scope.mjs

# Windows cmd
node scripts\sync-user-scope.mjs

# Windows PowerShell
node scripts/sync-user-scope.mjs
```

스크립트가 수행하는 작업:
- `os.homedir()`로 현재 OS의 홈 디렉토리 자동 판별
- `hooks/`, `skills/`를 `~/.claude/` 아래로 강제 동기화 (기존 파일 덮어쓰기)
- `settings.json`의 훅 command 경로를 현재 OS 기준으로 재작성 (bash `.sh` → node `.mjs` 자동 치환 포함)
- MCP 재등록 명령을 OS에 맞는 환경변수 문법으로 출력 (`$VAR` vs `%VAR%`)

**주의**: MCP 서버(Playwright/Context7/GitHub)는 머신별 `~/.claude.json`에 따로 저장되므로, Windows에서 최초 한 번은 `claude mcp add` 명령을 직접 실행해야 함 (sync 스크립트가 명령어를 출력해줌).

## 하네스 패치

이 repo 전체가 하네스 소스다. 새 프로젝트 repo에 구조를 이식할 때 사용.
"이 프로젝트에 하네스 적용해줘" 또는 `/project:patch [경로]`로 실행.

패치 내용: CLAUDE.md(맞춤 생성) + 에이전트(선별) + 훅 + 스킬 + 커맨드 + Agent Teams 활성화 + .gitignore
→ 모든 프로젝트 repo에서 동일한 Claude Code 환경을 보장한다.

## 되감기·복구

세션 중 실수하면 `Esc+Esc` 또는 `/rewind`로 이전 상태로 되돌릴 수 있다.
- **코드+대화 복원**: 특정 시점으로 완전 되감기
- **코드만 복원**: 대화는 유지하고 파일만 되돌리기
- **요약 압축**: 긴 대화의 일부만 압축해서 컨텍스트 확보

## 자기 성장 시스템

- 세션 시작: `evolving-rules.json` 로딩 → 반복 에러 경고 + 턴 카운터 리셋
- 세션 중: 실패 감지 → 패턴 축적 + 턴 카운터 (30턴 경고, 50턴 강력 경고)
- 세션 종료: count >= 3 → hookify 자동 트리거, >= 5 → failure-cases.md 등재
- 30일 미발생 → 자동 아카이브
