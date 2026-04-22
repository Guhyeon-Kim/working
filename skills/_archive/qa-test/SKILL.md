---
name: qa-test
description: Playwright MCP를 활용한 E2E 테스트 시나리오 작성·실행 가이드. qa-agent의 E2E 완결 BLOCKING 요건을 구체 테스트로 구현할 때 자동 로드.
---

# QA Test — Playwright MCP 기반 E2E

## 사용 시점

- qa-agent가 배포 전 검증 요청할 때 (E2E 완결 BLOCKING 대응)
- UI 변경 후 주요 플로우(로그인·결제·검색 등) 회귀 확인할 때
- 버그 재현 시나리오를 자동화로 남길 때

## Playwright MCP 도구 맵

| 단계 | 도구 | 용도 |
|-----|------|------|
| 진입 | `browser_navigate(url)` | 페이지 이동 |
| 관찰 | `browser_snapshot()` | DOM 트리(접근성 스냅샷) 획득. click/type 전 필수 |
| 상호작용 | `browser_click(ref)`, `browser_type(ref, text)`, `browser_fill_form(fields)`, `browser_select_option` | ref는 snapshot에서 얻은 node 식별자 |
| 대기 | `browser_wait_for({text|textGone|time})` | 네트워크 응답·상태 변화 대기. 고정 sleep 금지 |
| 검증 | `browser_snapshot()` 재호출 + 텍스트 포함 확인 / `browser_take_screenshot()` 시각 증거 |
| 디버그 | `browser_console_messages()`, `browser_network_requests()`, `browser_evaluate(fn)` |
| 정리 | `browser_close()` | 세션 종료 |

## 테스트 시나리오 작성 템플릿

```
[시나리오 이름] — 로그인 → 대시보드 도달

Given: 초기 URL과 선결 조건
  - URL: https://app.example.com/login
  - 테스트 계정: qa@example.com / (환경변수)

When: 사용자 행동
  1. navigate → /login
  2. snapshot → 이메일 input ref 획득
  3. type → 이메일
  4. type → 비밀번호
  5. click → 로그인 버튼
  6. wait_for → "대시보드" 텍스트 출현

Then: 검증 포인트 (모두 PASS해야 완결)
  - URL이 /dashboard 로 변경
  - 사용자 이름이 헤더에 노출
  - 콘솔 에러 0건
  - 네트워크 4xx/5xx 0건
```

## E2E 완결 체크리스트 (BLOCKING 기준)

qa-agent가 "E2E 미완결" 판정하지 않으려면 각 시나리오가 아래를 **전부** 충족해야 한다.

- [ ] 정상 경로(Golden Path) 1개 이상
- [ ] 실패 경로(잘못된 입력/네트워크 오류) 1개 이상
- [ ] 인증 필요 페이지의 미인증 접근 차단 확인
- [ ] 콘솔 에러·미처리 Promise rejection 0건
- [ ] 네트워크 4xx/5xx 0건 (의도된 401 제외)
- [ ] 키보드 단독 조작 가능 (접근성 최소)

## 자주 놓치는 것

1. **snapshot 없이 click 금지** — ref가 stale되면 실패. 상호작용 전 반드시 fresh snapshot.
2. **고정 sleep 금지** — `wait_for({text})` 또는 `wait_for({textGone})` 사용. time은 최후 수단.
3. **네트워크 요청 검증** — 제출 버튼 누르고 끝이 아니라 `browser_network_requests()`로 실제 API 호출 성공 확인.
4. **민감 정보** — 테스트 계정 비밀번호는 코드에 하드코딩 금지. `TEST_PASSWORD` 등 환경변수.
5. **세션 격리** — 테스트 간 의존성 금지. 각 시나리오는 독립 실행 가능해야 함.

## qa-agent와의 연계

- qa-agent가 "E2E 시나리오 N개 작성하라" 지시 → 이 스킬 참조
- 작성 후 qa-agent 재호출 시 Playwright MCP로 각 시나리오 재현 → PASS/BLOCK 판정
- BLOCK 1건이라도 있으면 배포 불가 (CLAUDE.md §핵심 규칙 2)

## 실제 코드 프로젝트 적용

하네스 패치된 프로젝트에서 실행할 때:
1. 프로젝트의 `.env.test` 또는 Codespace secrets에서 테스트 계정 조회
2. 대상 URL을 프로젝트 설정(`NEXT_PUBLIC_SITE_URL` 등)에서 읽음
3. 결과를 `.claude/qa-report/{timestamp}.md`로 저장 (qa-agent가 읽음)
