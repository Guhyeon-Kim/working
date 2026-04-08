# Claude Code Dotfiles

## 새 머신 설치

```
bash <(curl -sL https://raw.githubusercontent.com/Guhyeon-Kim/dotfiles/main/install.sh)
```

이 한 줄이면 끝. 아래가 자동으로 실행됨:

1. CLI 설치 (claude-code, gemini, codex)
2. `~/.claude-config/`에 이 레포 클론
3. `~/.claude/`에 agents, hooks, skills, scripts 심링크
4. `settings.json` 경로를 새 머신 `$HOME`으로 자동 변환
5. 플러그인 9개 설치 (hookify, codex, telegram 등)

## 설치 후 추가 작업

```
# MCP 서버 연결 (인증 토큰 필요)
claude mcp add supabase ...
claude mcp add notion ...

# Telegram 페어링
# Claude Code 안에서: /telegram:access
```

## 구조

```
~/.claude-config/          <- 이 레포 (dotfiles)
├── agents/                <- 15개 에이전트 (pm, design, data, frontend, backend, qa, ...)
├── hooks/                 <- 10개 훅 (자기 성장 시스템 v5.3)
├── scripts/               <- 유틸리티 스크립트 + delegate.mjs (위임 래퍼)
├── skills/                <- 15개 스킬
├── settings.json          <- 글로벌 설정 (훅 등록, 플러그인, 권한)
└── install.sh             <- 원라인 설치 스크립트

~/.claude/                 <- Claude Code 홈
├── agents -> ~/.claude-config/agents    (심링크)
├── hooks  -> ~/.claude-config/hooks     (심링크)
├── skills -> ~/.claude-config/skills    (심링크)
├── scripts -> ~/.claude-config/scripts  (심링크)
└── settings.json          <- install.sh가 경로 변환해서 생성
```

## CLI 위임 래퍼 (v5.3 신규)

```
[불변 규칙] Codex/Gemini CLI 직접 호출 금지.
반드시 delegate.mjs를 통해 호출한다.

사용법:
  node ~/.claude/scripts/delegate.mjs codex frontend "로그인 페이지 구현"
  node ~/.claude/scripts/delegate.mjs codex backend "stocks API 구현"
  node ~/.claude/scripts/delegate.mjs gemini research "경쟁사 분석"
  node ~/.claude/scripts/delegate.mjs gemini design "대시보드 화면 초안"

delegate.mjs가 자동으로 하는 일:
  1. 프로젝트 컨텍스트에서 관련 파일 탐색 (api-spec, design-spec 등)
  2. 작업 유형별 컨텍스트 패킷 조립
  3. 반복 버그 레지스트리 + 코딩 규칙 자동 포함
  4. 패킷을 .claude/delegation/에 감사용 저장
  5. CLI 호출 + 결과 반환

enforce-delegation.mjs (v2.0)가 직접 호출을 차단하고 delegate.mjs 사용을 강제한다.
```

## 훅 시스템 (v5.3)

| 이벤트 | 훅 | 역할 |
| --- | --- | --- |
| SessionStart | session-start-memory.mjs | 이전 세션 학습 결과 로딩 (evolving-rules, failure/success 메모리) |
| UserPromptSubmit | cli-health-check.mjs | CLI 가용성 감지 + 폴백 모드 전환 |
| UserPromptSubmit | quality-gc.mjs | 24시간 주기 코드 품질 스캔 |
| UserPromptSubmit | on-prompt.mjs | 금융/보안/파괴적 작업 감지 + 작업 기록 |
| PreToolUse | enforce-delegation.mjs (v2.0) | delegate.mjs 사용 강제 + 직접 CLI 호출 차단 |
| PostToolUse(Bash) | acl-post-build.mjs | 빌드 실패 자동 교정 (3회 한도) |
| PostToolUse(Bash) | post-push-hook.mjs | 배포 후 사이트 검증 (async) |
| SubagentStop | acl-subagent-stop.mjs | 서브에이전트 후 타입체크 + 빌드 검증 |
| Stop | on-stop.sh | 세션 기록 + 품질 게이트 |
| Stop | evolving-guardrails.mjs | 반복 에러 패턴 축적 + 30일 자동 아카이브 |

## 자기 성장 시스템 (v5.3)

```
세션 시작
  └── session-start-memory.mjs
        ├── evolving-rules.json 로딩 (반복 에러 경고)
        ├── failure-cases.md 요약 (장애 사례 수)
        ├── success-patterns.md 요약 (성공 패턴 수)
        └── acl-state.json 확인 (미해결 빌드 에러)

세션 중
  ├── cli-health-check.mjs -> cli-status.json 갱신
  ├── enforce-delegation.mjs (v2.0) -> delegate.mjs 강제 + cli-status.json 참조하여 폴백
  ├── delegate.mjs -> 컨텍스트 패킷 조립 + .claude/delegation/에 저장
  ├── acl-post-build.mjs -> acl-state.json 기록 (빌드 재시도)
  └── quality-gc.mjs -> gc-report.md 생성 (24시간 주기)

세션 종료
  ├── on-stop.sh -> activity-log.md, quality-gate-log.md 기록
  └── evolving-guardrails.mjs
        ├── acl-state.json에서 실패 수집
        ├── quality-gate-log.md에서 실패 수집
        ├── activity-log.md에서 재시작 패턴 수집
        ├── evolving-rules.json에 패턴 축적
        ├── count >= 2: hookify 권장
        ├── count >= 3: 반복 버그 레지스트리 등재 시급
        ├── count >= 5: failure-cases.md + CLAUDE.md 등재 권고
        └── 30일+ 미발생 패턴 자동 아카이브 (GC)
```

### 학습 루프

```
실패 발생 -> evolving-rules.json 축적
                  |
         다음 세션 시작 시 경고 주입
                  |
         같은 실수 사전 차단
                  |
         count >= 3: hookify로 자동 차단 규칙 생성
                  |
         count >= 5: failure-cases.md에 정식 등재
                  |
         30일 미발생: 자동 아카이브 (해결된 것으로 간주)
```
