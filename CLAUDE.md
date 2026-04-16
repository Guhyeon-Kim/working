# CLAUDE.md — Working Hub

> HubWise/BiLevel 제외, 모든 작업의 중앙 허브 (회사/개인/일정)
> Claude Code Dotfiles v6.4 | 최종 업데이트: 2026-04-16

---

## 🚀 첫 진입 자동 셋업 (Windows·Codespace·macOS 공통)

**원칙: 사용자가 개발 세부를 신경 쓰지 않아도 Claude가 자동으로 셋업을 마친다.**
Claude Code가 이 repo에서 실행되는 순간, 이 섹션을 읽고 아래 조건을 점검하여 누락을 자가치유한다.

### Claude가 자동 점검하는 조건

1. `~/.claude/hooks/` 에 `.mjs` 파일이 **5개 이상** 있는가?
2. `~/.claude/skills/` 가 **비어있지 않은가**?
3. `claude plugin list`에 `gptaku-plugins`가 있는가?
4. 이 repo의 `core.hooksPath` 가 `.githooks`로 설정돼 있는가? (git pull 자동 sync용)

### 하나라도 누락이면

Claude가 사용자에게 한 줄만 물어본다: **"자동 셋업을 진행할까요?"**
사용자가 "응" / "ok" / "해줘" 등으로 답하면 즉시 실행:

```
node scripts/bootstrap.mjs --apply
```

> 이 명령은 **Windows cmd / PowerShell / Git Bash / Linux / macOS 어디서든 동일**하다. Node.js가 OS별 경로 차이를 흡수.

bootstrap이 알아서 수행하는 것:
1. `~/.claude-config` (dotfiles) clone 또는 pull
2. 훅·스킬·`settings.json`을 `~/.claude/`에 복사 (atomic — 중단돼도 기존 파일 보존)
3. 플러그인 3개 + Python 의존성 설치
4. **`.githooks` 자동 활성화** → 이후 `git pull` 할 때마다 user-scope 자동 동기화
5. MCP 서버 등록 안내 (1회 수동 필요한 부분)

### 자가치유 이중 방어선

[hooks/_auto-heal.mjs](hooks/_auto-heal.mjs)가 **Claude Code 세션 시작 최상단**에서 동일 조건을 감지해 bootstrap을 자동 호출한다. 사용자가 아무 말도 안 해도 훅이 사라져있으면 세션 시작할 때 자동 복구 시도.

### Windows 특이사항 (사용자가 알아둘 것 없음, Claude가 자동 처리)

- **WSL 권장**: Claude Code는 WSL2 환경에서 가장 안정적으로 동작. 하지만 Windows 네이티브 cmd/PowerShell에서도 위 명령 그대로 실행 가능.
- **Git for Windows** 필수: `.githooks/post-merge`는 bash 스크립트이므로 Git for Windows에 포함된 Git Bash가 실행. Git for Windows만 설치돼 있으면 자동 동작.
- **MCP 서버**: `~/.claude.json`은 머신별 독립이므로 Windows 첫 셋업 후 1회 추가 등록 필요. bootstrap 실행 시 출력되는 `claude mcp add ...` 3줄을 복붙하면 끝. (Codespace 토큰은 `%GH_MCP_TOKEN%` 환경변수로)

### 사용자에게 필요한 유일한 행동

- **Claude Code 실행** → 알아서 감지·복구·진행
- bootstrap이 뜨면 "응"만 답하면 됨

모두 정상이면 자동 셋업 스킵하고 본 작업으로 진입.

---

## 프로젝트 개요

이 저장소는 코드 구현 저장소가 아닌 **작업 컨트롤 타워**.
리서치, 기획, 산출물 작성, 외부 서비스 연동, 프로젝트 관리를 여기서 수행한다.
실제 코드 프로젝트는 필요 시 별도 repo를 생성한다.

## 두 repo의 역할 분리 (v6.4 — 2026-04-16 명문화)

| repo | 용도 | 업데이트 |
|---|---|---|
| **working** (이 repo) | 살아있는 개발·전파 hub. 기존 머신·프로젝트는 `git pull` 시 `.githooks/post-merge`가 `sync-user-scope.mjs`를 자동 호출해 user-scope에 즉시 반영. | 일상 커밋 |
| **dotfiles** (`~/.claude-config`) | **신규 머신 초기 셋업 templates 전용**. hooks·skills·최소 scripts·settings.json 템플릿만 보유. 신규 머신이 `install.sh` → `bootstrap.mjs`로 환경을 처음 구축할 때 사용. | working 안정화 시 `node scripts/release-to-dotfiles.mjs --push`로 반자동 릴리즈 |

**핵심**: 기존 머신 반영은 working만으로 충분. dotfiles는 새 머신을 위한 보관소. 두 repo가 drift나더라도 release 스크립트로 주기적 sync.

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

## 🎯 작업 라우팅 & 실행 원칙 (v6.5 — 2026-04-16 개정)

> **최상위 원칙**: 사용자는 목표만 말한다. Claude가 적합한 AI를 배정하고 결과를 정리한다.
> 이 섹션은 이후 나오는 모든 라우팅/파이프라인 섹션보다 **우선권**을 가진다.

### Claude의 포지션: 오케스트레이터 + 정리자

사용자 요청을 받으면 Claude는 **다음 5단계 자동 진행**:

1. **작업 타입 분류**: 구현? 리서치? 문서? 의사결정? MCP 운영?
2. **적합한 AI 배정**: 아래 매트릭스에 따라 Codex·Gemini·Claude(직접) 결정
3. **동적 팀 구성** (필요 시): 병렬 실행이 이득이면 팀 즉석 편성
4. **결과 취합·정리**: 한 문단으로 사용자에게 보고
5. **프로젝트 관련이면 Notion 기록** (2단계 활성화 예정, 지금은 수동)

### AI 분업 매트릭스 (2026-04 기준, Opus 4.6·Gemini 3.x Pro·Codex GPT-5)

> **2단 판단 순서 (Semantic Routing)**: 정량 임계치만으로 라우팅하면 엣지 케이스를 놓침 (2026 트렌드: Cursor·Cline 등도 의도 기반 전환).
> Claude는 다음 순서로 판단한다:
>
> 1. **의도 분류 (1차)**: 이 작업이 본질적으로 **어떤 성격**인가? (구현/리서치/문서/MCP운영/판단/리팩터/리서치-구현 하이브리드 등)
> 2. **컨텍스트량 측정 (2차)**: 필요한 파일 수·참조 문서 길이·외부 검색 필요 여부는?
> 3. **정량 임계치 체크 (3차)**: 아래 매트릭스 적용
>
> 세 단계가 충돌하면 **의도가 우선**. 정량은 참고용.

| 작업 타입 | 담당 | 판단 근거 |
|---|---|---|
| 신규 파일 **30줄 이상** 코드 작성 | **Codex** | 통째 작성 정확도·속도 |
| **3개 이상 파일** 동시 수정·리팩터 | **Codex** | 다중 파일 일관성 |
| 테스트 생성·대량 수정 | **Codex** | 패턴 파악 후 확장 |
| **장문** 문서·PDF·영상 리서치 | **Gemini** | 2M 컨텍스트 |
| 디자인 레퍼런스·이미지 분석 | **Gemini** | 멀티모달 |
| 검색 결합 리서치 (교차검증 필요) | **Gemini** | Grounding |
| **30줄 이하** 수정·간단 디버깅 | **Claude 직접** | 오버헤드 없음 |
| 한국어 문서·기획서·요건정의 | **Claude 직접** | 톤·구조 |
| MCP 툴 호출 (Notion·Google·Supabase·Figma·Make·Vercel) | **Claude 직접** | 툴 체인 안정성 |
| 의사결정·전략·오케스트레이션 | **Claude 직접** | 추론 |

**경계 사례** Claude 판단 기준:
- 코드 분량 애매할 때 → **Codex 쪽으로 기울임** (구독비 ROI, Aider-style Architect/Editor 분리)
- 리서치인데 짧은 단건 웹 리딩 → **Claude 직접** (WebFetch)
- 리서치인데 교차검증·장문 → **Gemini**
- **리서치 → 구현 연쇄**: 2단계로 쪼개서 Gemini(리서치) → Codex(구현). Claude는 중간 정리·핸드오프만

### 위임 시 행동 규약

```
1. 사용자: "X 해줘"
2. Claude: (내부 판단) 작업 타입 + 적합 AI 결정
3. 위임 시:
   - delegate.mjs 경유 호출 (Codex/Gemini CLI 직접 호출 금지)
   - 사용자에게 "Codex에 위임: 다중 파일 일관성 필요" 한 줄 알림
4. Claude: 결과 받으면 → 검증·정리 → 한 문단 요약 보고
5. 외부 영향 있는 행동 (push, 메일, 일정 생성 등)만 사전 고지
```

### 에이전트 운영 방식: **동적 팀 기본**

- **공통 역할**(기획·리서치·설계·구현·QA·보안·리뷰)은 **스킬 템플릿**으로 저장. 작업마다 Claude가 필요한 역할을 **즉석 편성**하여 병렬 실행 후 해산.
- **고정 에이전트 파일**(`.claude/agents/*.md`)은 **프로젝트 특화 전용**. 예: 허브와이즈 투자 분석, B무거나 스크래퍼 같이 **특수 지식이 필요한 경우**만.
- 결과: 에이전트 수는 줄고, 조합 가능성은 늘어남. 작업에 최적화된 팀이 매번 새로 구성.

### 2단 에이전트 구조

```
┌──────────────────────────────────────────┐
│  Working Hub (공통 메인)                  │
│  • 동적 팀용 스킬 템플릿 (공통 역할)        │
│  • 고유 관점 에이전트 (pm, qa, security 등) │
│  • AI 라우팅 규칙 (이 섹션)                │
└───────────────┬──────────────────────────┘
                │ git pull → post-merge 자동 전파
                ▼
┌──────────────────────────────────────────┐
│  각 프로젝트 repo                          │
│  • .claude/agents/ ← 프로젝트 전용 특화     │
│  • CLAUDE.md ← 프로젝트 특성 반영          │
│  • 공통 인프라는 Working Hub에서 자동 수신   │
└──────────────────────────────────────────┘
```

### 결과 정리 포맷 (모든 작업 완료 후 Claude가 제공)

1. **무엇을 했는지** 한 줄
2. **누가 했는지** (Codex / Gemini / Claude 직접 중)
3. **어디에 결과가 있는지** (파일 경로, Notion 링크 등)
4. **다음 할 일 제안** (필요 시)

### 병렬 Worktree 전략 (v6.5 — 2026-04-16 신규)

**언제 적용**:
- 3개 이상 파일을 **서로 독립적으로** 수정할 때
- 프론트엔드 + 백엔드를 동시 진행
- 멀티 관점 리뷰 (구현·테스트·문서화 병렬)

**실행 방법**:
- Agent 도구 호출 시 `isolation: "worktree"` 옵션 사용 → 각 서브에이전트가 **독립 git worktree**에서 작업, 파일 충돌 원천 차단
- 작업 완료 후 Claude가 결과 머지·검증
- Cursor·Cline 등 2026년 주류 도구가 채택한 패턴

**제한**:
- 의존성 강한 순차 작업 (A 결과를 B가 참조)에는 부적합 — 순차로
- 로컬 스토리지 사용량 일시 증가 (worktree는 git이 자동 관리)

---

## 코어 에이전트 7개 (v6.5 감축 완료)

고정 파이프라인이 아닌 **동적 팀 편성**. 아래 7명은 고유 관점이 있어 유지, 나머지는 `agents/legacy/`·`agents/project-specific/`로 이동.

| 에이전트 | 고유 관점 | 호출 시점 |
|---|---|---|
| **pm-agent** | 요건정의·예외·리스크 선제 설계 | 새 기능·기획 시작 |
| **research-agent** | 4축 리서치 라우터 | 조사·벤치마킹 |
| **data-agent** | DB 스키마 + API 계약 | 구현 전 설계 |
| **qa-agent** | BLOCK/PASS 판정, Playwright E2E | 배포 전 |
| **security-agent** | STRIDE·CVSS·RLS | 신규 기능 + 정기 |
| **infra-agent** | Supabase/Vercel 비용·80% 임계 | 배포 시·월 1회 |
| **marketing-agent** | UA·리텐션·카피 | 출시 전후 |

**기획·설계·구현·리뷰 같은 공통 역할은 에이전트 파일이 아닌 [스킬 템플릿](skills/)으로 저장**. Claude가 작업마다 필요한 스킬을 즉석 조합하여 **동적 팀**을 편성한다. 팀은 작업 완료 시 해산 (컨텍스트 정리).

상세 프로토콜: [agents/delegation_workflow.md](agents/delegation_workflow.md)

## 멀티 AI 체계

| AI | 역할 | 호출 방법 |
|----|------|-----------|
| Claude Code (Opus) | CTO 오케스트레이션, 최종 판단 | 직접 |
| Gemini CLI | 리서치, 기획 초안, 디자인 초안 | `delegate.mjs gemini` |
| Codex CLI | 소스 코드 구현 | `delegate.mjs codex` |

**임계치·판단 기준은 위 §🎯 작업 라우팅 & 실행 원칙 참고.**

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

## 리서치·레퍼런스 수집 4축 라우팅

**research-agent가 라우터 역할**. 요청 받으면 먼저 어느 축인지 판단 후 해당 도구만 사용한다.

| 축 | 도구 | 언제 |
|---|---|---|
| **A. 단건 웹 리딩** | `WebFetch` / `WebSearch` | URL 하나 읽기. `insane-search` 플러그인이 차단 플랫폼(X·Reddit·네이버 블로그·디시·YouTube 자막 등 40+) 자동 우회 |
| **B. 디자인 레퍼런스** | `/insane-design [URL]` | 특정 서비스 UI·CSS 토큰·폰트 스택 추출 → `design.md` + 인터랙티브 리포트 |
| **C. 일반 리서치** | `node scripts/delegate.mjs gemini research "..."` | 경쟁 조사, 시장 규모, 1~5p 요약. Gemini 체인(preview→2.5-pro→flash) 자동 폴백 |
| **D. 딥 리서치** | `/deep-research [주제]` | 20p+ 종합 리포트, 7단계 파이프라인·멀티에이전트·A~E 등급·교차검증. 제안서·투자·중요 의사결정 근거용 |

**D축 발동 기준** (하나라도 해당): 20p+ 리포트 / 소스 간 교차검증 필수 / 웹·PPT 패키징 / 세션 중단·재개.
그 외는 C축 기본, A·B는 요청 성격 명확할 때만.

**보안 주의**: 쿼리·URL이 외부 서비스로 전송된다 (Jina Reader, 웹 검색, Gemini 등).
- 민감 URL(내부 도메인, `.claude/` 경로) 금지
- 비공개 아이디어·차별화 포인트는 추상화된 키워드로 쿼리
- PII·시크릿 자기 검사 후 전송
- `RESEARCH/` 산출물은 `.gitignore` 확인

설치 플러그인: `insane-design`, `insane-search`, `deep-research` (gptaku-plugins 마켓플레이스). Windows 로컬에 반영하려면 [scripts/setup-plugins.mjs](scripts/setup-plugins.mjs) 참고.

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

## 동적 팀 기본 (v6.5 — Agent Teams 진화형)

**기본 원칙**: 공통 역할은 에이전트 파일로 박지 않고 **작업마다 즉석 편성**. Working Hub에서든 프로젝트 repo에서든 동일.

**동적 팀 자동 편성 기준:**
- 3개 이상 독립 모듈·파일을 병렬 수정
- 기획+구현+QA 관점을 동시에 보는 게 이득인 작업
- 여러 스킬 템플릿 조합으로 해결 가능

**Claude가 하는 일:**
1. 작업 분석 → 병렬성·관점 다양성 이득 판단
2. 필요한 역할 조합 결정 (스킬 템플릿 기반)
3. **외부 영향 없으면 즉시 편성**, 있으면 사용자 승인
4. 팀 파견 → 결과 취합·검증 → 팀 해산 (컨텍스트 정리)
5. 사용자에게 요약 보고 (무엇·누가·어디·다음)

**고정 에이전트 파일과의 관계:**
- 고정: 7개 코어 에이전트 (pm, qa, security 등 고유 관점 있는 것만)
- 동적: 공통 역할 (기획·구현·리뷰 등)은 스킬 템플릿 조합

## Notion 자동 기록 원칙 (v6.5)

프로젝트 관련 작업이 완료되면 Claude는 **관련 Notion 페이지에 자동 기록**한다.

**자동 기록 대상 프로젝트** (감지 키워드):
- 허브와이즈 / HubWise
- B무거나
- 티스토리 (블로그 관련)
- 팀 프로젝트 (명시적 언급 시)
- 여행 일정 / 여행 계획
- 일정·캘린더 관련 요청

**기록 포맷**:
```
[YYYY-MM-DD HH:mm] 작업 제목
담당: Codex / Gemini / Claude 직접
결과: 한 문단 요약
파일·링크: ...
다음 할 일: (있으면)
```

**자동 기록 대상 아님**: 일반 대화, 단순 조회, 실패한 시도. 사용자에게 "Notion에 기록할까요?" 묻지 않음 — 위 조건이면 자동, 아니면 생략.

MCP 툴: `mcp__claude_ai_Notion__notion-create-pages` / `notion-update-page`.

## 태블릿·모바일 Handoff 프로토콜 (v6.5)

**플랫폼 조합**:
- **Claude Code (VSCode extension)** — Codespace·Windows 로컬 양쪽
- **Claude Code 웹 (claude.ai/code)** — 태블릿·폰에서 세션 이어가기
- **Remote Control** (`/remote-control` 또는 `claude --rc`) — 진행 중 Codespace 세션을 모바일에서 이어받기

**태블릿 사용 시 Claude 행동 지침**:
- 긴 코드 생성·파일 편집이 필요하면 **Codex 위임이 기본** (태블릿 환경에서 Claude가 직접 쓰면 실수 증가)
- 긴 리서치·장문 분석은 **Gemini 위임**
- Claude는 **지휘·판단·정리**만 — 모바일에서도 가볍게 유지
- 결과 정리는 **Notion 자동 기록**으로 남겨 PC에서 이어받기 편하게

### 세션 Handoff (Cloud Handoff 패턴 — 2026 모바일 vibe coding 표준)

모바일에서 긴 작업을 시작하고 PC로 옮기거나, 그 반대의 경우:

1. **백그라운드 위임**: 긴 작업(대규모 리팩터, 리서치, 빌드)은 `run_in_background: true`로 파견. 세션 끊겨도 작업은 진행됨.
2. **진행 상태 저장**: `.claude/pending/<task-id>.md`에 What / Next / Blocker 구조로 기록.
3. **Notion 자동 기록**: 프로젝트 관련이면 Notion 페이지에 실시간 진행상황 갱신.
4. **재접속 시 복원**: 다른 기기로 세션 연결하면 Claude가 `.claude/pending/`와 Notion을 먼저 읽고 컨텍스트 복원.

### 외부 통신 (선택)
- `channels` 플러그인으로 Telegram·Discord 알림. CI 결과·장시간 작업 완료 통지 등.
- 허브와이즈·B무거나 같은 프로젝트의 배포 결과는 사용자 폰으로 푸시 가능.

## 🔄 자가 진화 로드맵 (v7 예고)

v6.5 리서치(Gemini, 2026-04-16)에서 식별한 **우선순위 높은 미래 방향**. 이번 릴리즈엔 **원칙만 명시**, 실제 구현은 v7에서 단계별.

| 항목 | 현재 v6.5 | v7 목표 |
|---|---|---|
| **Semantic Routing** | 정량 임계치 + 의도 힌트 | 경량 LLM이 의도·컨텍스트량 분석 후 라우팅 (on-prompt-unified 고도화) |
| **스킬 자가 생성** | evolving-rules 누적 + hookify 수동 트리거 | 반복 에러 감지 시 Claude가 **새 SKILL.md 자동 작성** 후 리포 반영 |
| **병렬 Worktree 기본화** | 옵션 제공 | 3개 이상 파일 변경 감지 시 **자동 worktree 파견** |
| **토큰 최적화 프록시** | 없음 | 터미널 출력 필터링 훅(RTK 스타일) — 무의미한 로그 차단으로 토큰 40~60% 절감 |
| **MCP 컨텍스트 지연 로딩** | Working Hub 복사·동기화 방식 | 각 프로젝트 컨텍스트를 MCP로 DB 조회하듯 당겨오기 |

**원칙**: 실패 케이스를 5회 넘게 만나면 그 자리에서 Claude가 **자가 개선 제안** 작성 → 사용자 승인 후 훅/스킬 자동 생성. 현재는 hookify 플러그인이 부분 구현, v7에서 완전 자동화.

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
