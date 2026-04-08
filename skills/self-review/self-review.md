---
name: self-review
description: 모든 에이전트가 완료 전 자동 로드. 핸드오프 전 자체 검증 체크리스트.
allowed-tools: Read, Grep
---

# Self Review

핸드오프 전 자신의 산출물을 검증한다.
"완성된 것 같다"가 아니라 체크리스트를 통과해야 완료다.

## 공통 체크 (모든 에이전트)

```
□ 내가 맡은 범위를 모두 완료했는가?
□ 산출물(파일)을 실제로 저장했는가?
□ 다음 에이전트가 필요로 하는 정보가 산출물에 있는가?
□ 임의로 결정한 것이 있는가? (있으면 CEO 에스컬레이션)
```

## research-agent
```
□ research.md에 저장했는가?
□ 최소 3개 이상 소스를 확인했는가?
□ HubWise 적용 제안 섹션이 있는가?
□ 출처가 명시됐는가?
```

## planning-agent
```
□ requirements.md와 wireframe.md 모두 작성했는가?
□ 필수 요구사항에 FR-번호가 있는가?
□ 권한 매트릭스가 정의됐는가?
□ 모든 화면의 상태(로딩/에러/빈) 처리가 명시됐는가?
□ CEO 확인 없이 confirmed 상태로 변경하지 않았는가?
```

## design-agent
```
□ design-spec.md에 저장했는가?
□ wireframe의 모든 화면이 커버됐는가?
□ 5가지 상태(default/hover/loading/error/empty) 스펙이 있는가?
□ globals.css 토큰 변경사항이 정의됐는가?
□ design-review 스킬 기준을 충족하는가?
```

## data-agent
```
□ api-spec.md에 저장했는가?
□ 모든 필드명이 HubWise 표준(snake_case, price/change_rate)을 따르는가?
□ 에러 케이스가 정의됐는가?
□ RLS 정책이 포함됐는가?
```

## frontend-agent
```
□ design-spec의 모든 화면을 구현했는가?
□ async params 패턴 올바른가?
□ 'use client' 필요한 위치에 있는가?
□ TypeScript any가 없는가?
□ loading / error / empty 3가지 처리됐는가?
□ api-spec의 필드명 그대로 사용했는가?
□ 인증 가드 있는가?
□ console.log 제거했는가?
```

## backend-agent
```
□ api-spec의 모든 엔드포인트를 구현했는가?
□ 필드명이 api-spec과 일치하는가?
□ KIS API 실패 시 yfinance fallback 있는가?
□ 환경변수 함수 내 직접 호출하는가?
□ 에러 처리 있는가?
□ 인증 가드 있는가?
```

## 자체 검증 결과 보고

통과:
```
자체 검증 완료. 이슈 없음.
→ handoff-check 진행
```

문제 발견:
```
자체 검증에서 [N]개 이슈 발견:
- [이슈]: [수정 내용]
수정 후 재검증 완료.
→ handoff-check 진행
```
