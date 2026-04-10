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
├── skills/              # 14개 스킬 (SKILL.md)
├── hooks/               # 8개 훅 (.mjs)
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

## MCP 연동

Notion, Supabase, Figma, Vercel, Make, Google Calendar, Gmail, Slack
→ 기획 산출물 Notion 정리, 일정 Calendar 등록, 디자인 Figma 참조 가능

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
