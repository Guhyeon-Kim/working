# 프로젝트에 하네스 패치

대상: $ARGUMENTS

## 개요

이 Working Hub repo(`/workspaces/working/`) 전체가 하네스 소스다.
대상 repo에 필요한 구성 요소를 선별하여 복사·맞춤 조정한다.

## 소스 맵 (이 repo → 대상 repo)

| 소스 (Working Hub) | 대상 repo | 설명 |
|-------------------|-----------|------|
| `agents/*.md` | `.claude/agents/` | 프로젝트 유형별 선별 복사 |
| `agents/memory/` | `.claude/agents/memory/` | evolving-rules.json 빈 상태로 초기화 |
| `agents/delegation_workflow.md` | `.claude/agents/` | 오케스트레이션 허브 |
| `hooks/*.mjs` | `hooks/` | 핵심 훅 3개 필수 복사 |
| `skills/*/SKILL.md` | `skills/` | 프로젝트 유형별 선별 복사 |
| `.claude/commands/project/*.md` | `.claude/commands/project/` | 커맨드 복사 (patch 제외) |
| `scripts/delegate.mjs` | `scripts/` | 위임 래퍼 |
| `.gitignore` (세션 부분) | `.gitignore` (append) | 세션 임시 파일 규칙 추가 |

## 실행 순서

### 1단계: 대상 repo 분석
- 경로 확인 (로컬 경로 또는 GitHub URL)
- GitHub URL이면 `gh repo clone`으로 클론
- 기술 스택 자동 감지 (package.json → Node/React, requirements.txt → Python, go.mod → Go 등)
- 기존 CLAUDE.md / .claude/ 존재 여부 확인

### 2단계: CLAUDE.md 생성
Working Hub의 CLAUDE.md를 참고하되, 대상 프로젝트에 맞게 **새로 작성**한다:
- 프로젝트명, 기술 스택, 디렉토리 구조 반영
- 자동 의도 라우팅 섹션 포함
- 사고 깊이 자동 조절 섹션 포함
- Agent Teams 자동 관리 섹션 포함
- 자기 성장 시스템 섹션 포함

### 3단계: 에이전트 선별 복사
프로젝트 유형에 따라 필요한 에이전트만 복사:

| 유형 | 에이전트 |
|------|---------|
| 풀스택 웹 | pm, design, data, frontend, backend, qa, security, context |
| 프론트엔드 전용 | pm, design, frontend, qa |
| 백엔드/API 전용 | pm, data, backend, qa, security |
| 모바일 | pm, design, frontend, qa |
| 데이터/ML | pm, data, backend, qa |

공통 필수: delegation_workflow.md, memory/ (빈 evolving-rules.json)

### 4단계: 훅 복사 (필수 3개)
- `session-start-memory.mjs` — 세션 시작 메모리 로딩 + 턴 카운터 리셋
- `on-prompt-unified.mjs` — CLI 체크 + 품질 GC + 위험 감지 + Context Rot 방지
- `evolving-guardrails.mjs` — 반복 에러 축적 + hookify 자동 트리거

### 5단계: 스킬 선별 복사
공통 필수: planning, self-review, error-handling, project-log, dependency-check
프로젝트별: wireframe, flowchart, ui-component, design-system, api-contract

### 6단계: 설정 적용
- settings.json에 훅 등록 + Agent Teams 활성화
- .gitignore에 세션 임시 파일 규칙 추가

### 7단계: 결과 보고
- 패치된 파일 목록
- 프로젝트 맞춤 조정 내역
- 사용 가능한 커맨드/에이전트/스킬 안내

## 규칙

- 기존 CLAUDE.md가 있으면 **덮어쓰지 않고 머지 제안**
- 기존 .claude/ 설정이 있으면 **충돌 항목만 보고**
- invest-* 에이전트는 복사하지 않음 (Working Hub 전용)
- marketing-agent는 요청 시에만 복사
- 패치 후 CEO 확인 필수
