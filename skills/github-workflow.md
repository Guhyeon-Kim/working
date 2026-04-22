# github-workflow

**버전**: v6.0
**주 사용 에이전트**: builder
**연계 스킬**: self-review

---

## 목적

커밋 메시지·브랜치·PR·이슈의 컨벤션 통일. Git 히스토리를 "검색·이해 가능한
자산"으로 유지.

---

## 호출 시점

- 변경 커밋 전
- PR 생성 전
- 이슈 작성 전
- 브랜치 생성 전

---

## 커밋 메시지 컨벤션 (Conventional Commits)

### 기본 형식
```
<type>(<scope>): <subject>

<body (선택)>

<footer (선택)>
```

### Type
- `feat`: 새 기능
- `fix`: 버그 수정
- `refactor`: 동작 변경 없는 리팩토링
- `docs`: 문서만 변경
- `test`: 테스트 추가·수정
- `chore`: 빌드·설정·도구 변경
- `perf`: 성능 개선
- `style`: 포매팅 (동작 영향 없음)
- `bump`: 버전 업 (v5.3 → v6.0 같은)

### Scope (선택)
프로젝트의 주요 모듈·도메인:
- `api` / `ui` / `db` / `auth` / `bias` 등

### Subject
- 50자 이내
- 명령형 현재 시제 ("Add X", "Fix Y", "Remove Z")
- 끝에 마침표 없음
- 한국어 가능 ("편향 지수 API 신규", "로그인 500 에러 수정")

### 예시
```
feat(api): 편향 지수 계산 엔드포인트 신규

POST /api/bias/score 구현. FOMO·군중심리·손실회피·과신 4종
계산. Supabase RLS로 타인 데이터 접근 차단.

수용 기준:
- 5초 이내 응답 (p95 2.8초 측정)
- 0~100 범위 정규화

Refs: <요건서 링크>
```

```
fix(auth): 비활성 계정 로그인 시 500 에러

inactive 상태 계정이 로그인 시도 시 null reference 발생.
명시적 체크 추가 → 403 반환.

Fixes: <이슈 번호 또는 tester 리포트>
```

```
bump: CLAUDE.md v5.3 → v6.0
```

---

## 브랜치 네이밍

### 형식
```
<type>/<short-description>
```

### Type
- `feat/` — 기능
- `fix/` — 버그
- `refactor/`
- `docs/`
- `chore/`
- `hotfix/` — 프로덕션 긴급 수정

### 예시
- `feat/bias-score-api`
- `fix/inactive-account-login`
- `refactor/split-bias-calculator`
- `hotfix/prod-auth-500`

### 백업 브랜치
중요한 변경 전 백업:
- `backup/pre-v6-migration`
- `backup/before-delete-legacy`

---

## PR 컨벤션

### 제목
커밋 메시지 형식과 동일. 50자 내외.

### 본문 템플릿
```markdown
## 변경 사항
- <핵심 변경 3~5개>

## 요건서·이슈
- 요건서: <링크>
- 이슈: #<번호>

## 테스트
- [ ] 단위 테스트 추가 (파일명)
- [ ] E2E 테스트 추가 (파일명)
- [ ] tester 리포트: <링크>

## 체크리스트
- [ ] TypeScript 통과
- [ ] Lint 통과
- [ ] 민감 정보 하드코딩 없음
- [ ] .env 변경 있으면 Notion 🔑 DB 업데이트

## 스크린샷 (UI 변경 시)
<Before / After>

## 배포 주의사항
- DB 마이그레이션: 있음·없음 (있으면 SQL 파일명)
- 환경변수 신규: <목록>
- Breaking change: 있음·없음 (있으면 상세)

## 리뷰어에게
- 특히 확인해 주길 원하는 부분:
```

---

## 이슈 작성

### 버그 리포트 템플릿
```markdown
## 재현 환경
- OS·브라우저·버전:
- 계정: <테스트 계정>

## 재현 경로
1. ...
2. ...
3. ...

## 예상 동작
<어떻게 되어야 하는가>

## 실제 동작
<무엇이 잘못됐는가>

## 스크린샷·로그
<있으면>

## 관련
- 요건서:
- 이전 이슈:
```

### 기능 요청 템플릿
```markdown
## 해결하려는 문제
<사용자가 겪는 pain>

## 제안 해결책
<아이디어>

## 대안
<다른 접근법>

## 우선순위
<근거>
```

---

## 체크리스트

### 커밋 전
- [ ] 관련 변경만 staged (무관 파일 섞이지 않음)
- [ ] 커밋 메시지 type·scope·subject 규칙 준수
- [ ] 민감 정보 포함 여부 확인
- [ ] 큰 변경은 여러 커밋으로 분할

### PR 전
- [ ] self-review 스킬 체크 통과
- [ ] PR 본문 템플릿 완성
- [ ] 테스트 통과
- [ ] 리뷰어 할당

### Merge 전
- [ ] 리뷰 코멘트 모두 해소
- [ ] CI 통과
- [ ] 의존성 있는 다른 PR 확인

---

## 금지

- **"fix stuff" 류 커밋**: 검색·이해 불가
- **거대 커밋**: 한 커밋에 수천 줄 → 리뷰 불가, 논리 단위로 분할
- **.env 커밋**: .gitignore 확인
- **--force push to main**: 금지 (hotfix 브랜치 등은 예외)
- **리뷰 없이 main 직행**: 최소한 CI 통과 + self-review
