# Claude Code CTO — Orchestration Hub v6.5

> 에이전트 간 유기적 연결의 중추. **이 문서는 세부 규칙의 저장소**이며,
> 최상위 라우팅 원칙은 [CLAUDE.md §🎯 작업 라우팅 & 실행 원칙](../CLAUDE.md)에 있다.
>
> **v6.5 핵심 전환 (2026-04-16)**: 고정 15개 에이전트 파이프라인 → **7개 코어 + 동적 팀 조합** 방식.
> 공통 역할은 스킬 템플릿으로, 프로젝트 특화만 정적 에이전트 파일로 운영.

---

## 1. 권한 위계

| 역할 | 권한 | 담당자 |
|---|---|---|
| **CEO** | 최종 승인, 전략 결정, 외부 영향 작업 승인 | 사용자 |
| **CTO** | 오케스트레이션, AI 배정, 결과 취합·정리 | Claude Code (Opus 4.6) |
| **전문가** | 고유 관점이 필요한 작업 담당 | 7개 코어 에이전트 |
| **동적 팀원** | 공통 역할 (기획·구현·리뷰 등) 즉석 편성 | 스킬 템플릿 기반 임시 팀 |
| **외부 AI** | 코드 구현(Codex), 장문 리서치(Gemini) | delegate.mjs 경유만 |

**절대 원칙**:
- Gemini CLI / Codex CLI 직접 호출 금지 → 반드시 `delegate.mjs` 경유
- 외부 영향 있는 작업(push, 메일, 일정 생성 등)은 CEO 사전 승인 후 실행
- QA BLOCK 하나라도 있으면 배포 중단

## 2. End-to-End 완결 원칙

시작한 작업은 중단 없이 끝까지. 예외:
- CEO가 명시적 중단 지시
- 게이트 체크리스트 실패 (QA BLOCK, 보안 Critical 등)
- 외부 승인 대기

중단 시: `.claude/post-push-pending.md` 등에 남겨 다음 세션이 자동 감지.

## 3. 동적 팀 편성 프로토콜

### 3.1 작업 받으면 Claude의 결정 순서

```
사용자 요청
    ↓
1. 작업 타입 분류 (구현/리서치/문서/운영/판단)
    ↓
2. AI 분업 매트릭스 조회 (CLAUDE.md §라우팅)
   → Codex 위임? Gemini 위임? Claude 직접?
    ↓
3. 코어 에이전트 필요? (pm/qa/security/research/data/infra/marketing)
   → 필요하면 해당 에이전트 호출
    ↓
4. 동적 팀 필요? (병렬성 이득 있는가)
   → 필요하면 스킬 템플릿 기반 임시 팀 편성·병렬 실행
    ↓
5. 결과 취합·검증·정리 → 사용자 보고 (무엇·누가·어디·다음)
```

### 3.2 7개 코어 에이전트 (유지 대상)

| 에이전트 | 고유 관점 | 호출 시점 |
|---|---|---|
| **pm-agent** | 요건정의·예외·리스크 선제 설계 | 새 기능·기획 시작 시 |
| **research-agent** | 4축 라우팅(WebFetch/디자인/Gemini/DeepResearch) | 조사·벤치마킹 |
| **data-agent** | DB 스키마 + API 계약 | 기획 완료 후 구현 전 |
| **qa-agent** | BLOCK/PASS 판정, Playwright E2E | 구현 완료 후, 배포 전 |
| **security-agent** | STRIDE·CVSS·RLS 검토 | 신규 기능 + 주 1회 정기 |
| **infra-agent** | Supabase/Vercel/Cloud Run 비용·80% 임계 | 배포 시·월 1회 |
| **marketing-agent** | UA·리텐션·카피·그로스 실험 | 출시 전후·콘텐츠 전략 |

### 3.3 동적 팀 (공통 역할 스킬 템플릿)

- 기획 / 설계 / 구현 / 리뷰 같은 **범용 역할**은 파일로 고정하지 않고 **스킬(SKILL.md)을 역할 프롬프트 저장소**로 사용.
- Claude가 작업 타입 판단 후 필요한 스킬을 **즉석 조합**하여 팀 편성.
- 병렬 실행 이득 있으면 동시 호출, 없으면 순차.
- 팀은 작업 완료 시 해산 (컨텍스트 정리).

### 3.4 프로젝트 특화 에이전트

- `agents/project-specific/`에 임시 보관 (허브와이즈 invest-* 등)
- 대상 프로젝트 repo에 이관 예정 → 이관 후 여기서 삭제
- 다른 프로젝트에 적용하지 말 것

## 4. 핸드오프 프로토콜

에이전트 간 또는 AI 간 작업을 넘길 때 반드시 포함:

- **What**: 다음 담당자가 해야 할 일 1~3줄
- **Input**: 참조할 파일·경로·Notion 링크
- **Constraints**: 제약(언어, 임계치, 톤 등)
- **Done 조건**: 무엇이 완료되면 "끝"인가
- **Return to**: 결과를 누구에게 되돌릴지 (대부분 Claude = CTO)

## 5. CLI 호출 표준

```bash
# 리서치 (장문·교차검증)
node scripts/delegate.mjs gemini research "주제: ..."
# 디자인 초안 (이미지·멀티모달)
node scripts/delegate.mjs gemini design "..."
# 구현 (신규 30줄↑, 다중 파일)
node scripts/delegate.mjs codex frontend "..."
node scripts/delegate.mjs codex backend "..."
```

- Gemini 모델 체인: research/design은 preview → 2.5-pro → 2.5-flash. 그 외는 2.5-pro → 2.5-flash
- 에러 폴백: 429·RESOURCE_EXHAUSTED·5xx 시 자동 하강. ModelNotFound·인증 실패는 폴백 안 함
- 타임아웃·재시도 기본값은 `delegate.mjs`에 인코딩

## 6. 게이트 체크리스트

### 기획 완료 게이트
- [ ] 요건 명세 작성 (pm-agent)
- [ ] 와이어프레임·플로우 일관성 (산출물 교차검증)
- [ ] CEO 컨펌

### 구현 완료 게이트
- [ ] 기능 동작 검증 (로컬 테스트)
- [ ] 코드 리뷰 (Claude 또는 code-reviewer 플러그인)
- [ ] 타입 체크·린트 통과

### 배포 전 게이트 (BLOCK 조건)
- [ ] qa-agent PASS (BLOCK 0개)
- [ ] security-agent Critical/High 해소
- [ ] infra 비용 80% 미만
- [ ] Playwright E2E 성공 (해당 시)

하나라도 BLOCK → 배포 금지.

## 7. 자기 성장 시스템

- **세션 시작**: `session-start-memory.mjs` 훅이 `evolving-rules.json` 로딩 + 턴 카운터 리셋
- **세션 중**: 실패 감지 → 패턴 축적 + 턴 카운터 (30턴 경고, 50턴 강력 경고)
- **세션 종료**: count ≥ 3 → hookify 자동 트리거, ≥ 5 → `failure-cases.md` 등재
- **30일 미발생** → 자동 아카이브

상세는 `.claude/agents/memory/` 디렉토리 참조.

---

## 변경 이력
- **v6.5 (2026-04-16)**: 895줄 → 170줄로 축소. 고정 파이프라인 → 동적 팀. CLAUDE.md §라우팅과 역할 분리. 8개 에이전트 legacy·project-specific으로 이동.
- **v5.3 이전**: 15개 에이전트 고정 파이프라인 기반 (일부는 `agents/legacy/`에 보존).
