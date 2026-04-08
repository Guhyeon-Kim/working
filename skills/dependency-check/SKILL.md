---
name: dependency-check
description: 변경사항 발생 시 연쇄 영향 범위 파악이 필요할 때 자동 로드. 변경된 파일 범위만 체크.
---

# Dependency Check 스킬

## 핵심 원칙

> 변경의 파급 효과를 모르면 의도치 않은 곳이 깨진다.
> 체크 범위는 변경 유형에 맞게 한정한다. 전체 파일 탐색은 시간 낭비다.
> 순환 의존성은 아키텍처 문제의 신호다.

---

## 파일 의존 관계

```
requirements.md (확정)
  ├── wireframe.md
  │     └── design-spec.md → frontend/src/
  ├── flowchart.md
  ├── data-model.md (api-spec.md)
  │     ├── supabase/*.sql
  │     ├── frontend/src/ (타입, API 호출)
  │     └── backend/app/ (엔드포인트)
  └── project-log.md

globals.css (디자인 토큰)
  └── frontend/src/ (모든 컴포넌트)
```

---

## 변경 유형별 체크 범위

### 요구사항 변경 (requirements.md)
```
직접 영향: wireframe.md, flowchart.md, api-spec.md
간접 영향: design-spec.md, frontend/src/, backend/app/
주의: 기존 FR 번호 변경 시 모든 참조 파일 확인
```

### DB 스키마 변경 (supabase/*.sql)
```
직접 영향: api-spec.md, backend/app/routers/, frontend/src/ (타입)
간접 영향: RLS 정책 → 전체 접근 제어 재검토
주의: 컬럼 삭제는 2단계 (코드 먼저 → DB 나중)
```

### API 변경 (api-spec.md)
```
직접 영향: backend/app/routers/, frontend/src/ (API 호출부)
주의: 필드명 변경 → 양쪽 동시 변경 필수 (불일치 = 프로덕션 버그)
하위호환: 기존 클라이언트 영향 확인
```

### UI/디자인 변경 (globals.css, design-spec.md)
```
직접 영향: frontend/src/ (변경된 클래스 사용 컴포넌트)
주의: CSS 변수 이름 변경 → 전체 사용처 grep 필수
width class 변경 → 레이아웃 게이트 재실행
```

### 컴포넌트 변경 (frontend/src/components/)
```
직접 영향: 해당 컴포넌트 import 하는 페이지들
grep -r "컴포넌트명" frontend/src/app --include="*.tsx"
순환 의존성 확인: 컴포넌트가 자신을 사용하는 컴포넌트를 import 하지 않는가
```

---

## 순환 의존성 탐지

```bash
# 특정 컴포넌트의 import 체인 확인
grep -r "import.*[컴포넌트명]" frontend/src --include="*.tsx" -l

# API 필드명 전수 조회 (불일치 탐지)
grep -r "change_pct\|current_price\|traded_at" frontend/src backend/app --include="*.tsx" --include="*.py"
# → 발견되면 api-spec.md 기준 필드명으로 통일 필요
```

---

## 영향 범위 보고 형식

```
🔍 영향 범위 분석 [YYYY-MM-DD HH:MM]
변경 내용: [무엇이 바뀌었는가]

직접 영향 (반드시 업데이트)
- [파일]: [변경 필요 내용]

간접 영향 (확인 필요)
- [파일]: [잠재적 영향]

순환 의존성
- [있음 → 설계 검토 필요 / 없음]

업데이트 순서
1. [먼저 변경할 것]
2. [그 다음]
3. [마지막]

리스크
- [변경 시 주의할 점]
```

---

## 주의사항

```
□ 전체 파일 탐색 금지 → 변경 유형에 맞는 범위만
□ 누락 없도록 의존 관계 기준으로 체크
□ 변경 전 반드시 실행 (사후 확인은 이미 늦음)
□ "영향 없을 것 같다"는 추측 금지 → 코드로 확인
```
