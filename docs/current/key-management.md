# 키 관리 지침 (Key Management)

**양식**: key-management v1.0
**작성일**: 2026-04-22

---

## 0. 문제 상황

CEO는 다음 pain을 겪고 있었다:

- API 키가 로컬 `.env` / Vercel 환경변수 / GitHub Secrets / Claude MCP 설정 /
  기억 등 **여러 곳에 분산**
- 어느 키가 어디 있는지, 언제 발급했는지, 만료 임박인지 추적 불가
- 머신 바뀌면(집 ↔ 회사 ↔ Codespace) 키 다시 모아야 함
- 작업 중 "그 키 어디 있더라" 찾는 시간이 실제 작업보다 큼

---

## 1. 해결 원칙

### 1-1. Notion 🔑 서비스/환경변수 DB가 진실의 원천

- **DB URL**: https://www.notion.so/cdd0200bf9784d28a09ee81b403e255e
- **Data source ID**: `collection://df78cece-2c1a-43b8-bde6-435ab74e14db`
- 모든 서비스 키가 여기에 모임
- 다른 곳(로컬 .env, Vercel 등)은 **여기서 복사된 사본**
- 프로젝트 4개의 relation은 `docs/current/reference-ids.md §1-2` 참조

### 1-2. 실제 키 값은 페이지 본문 코드블록

- 속성(properties)은 메타데이터만 (변수명, 상태, 사용 위치 등)
- **실제 키 값은 페이지 본문 내 코드블록**
- 마스킹·편집 금지 (`sk-...xxxx` ❌, 전체 값 그대로 ✅)

**이유**:
- 코드블록의 Copy 버튼으로 한 번에 복사
- 앞뒤 공백·따옴표 없이 값만
- 멀티라인 키(JSON 서비스 계정 등)도 자연스럽게 표현

### 1-3. Just-in-time 등록

- 일괄 이관 불가능 (CEO가 모든 키 값을 지금 알지 못함)
- **만지는 순간 등록**: 그 키를 쓰기 위해 어디 있던 걸 꺼낸 순간 Notion에 신규 엔트리
- 30초 투자로 반영구적 수익

### 1-4. 보안 허용 범위

**Notion에 보관 OK**:
- 3rd-party API 키 (OpenAI, Anthropic, Supabase, Vercel 등)
- 개인 계정 토큰
- 개발 DB 접속 정보

**Notion에 보관 금지**:
- AWS root 계정 키
- 결제 처리사 secret
- 사용자 PII 관련 암호화 키
- 프로덕션 DB의 admin 권한 secret

**지킬 가이드**:
- Notion 계정 2FA 필수
- 가능하면 scoped token 사용 (owner 권한 X)
- 만료 예정일 관리로 로테이션 강제
- 공유 설정 확인 (비공개 유지)

---

## 2. DB 스키마

### 2-1. 속성 (Properties)

| 필드 | 타입 | 필수 | 용도 |
|---|---|---|---|
| 변수명 | title | ✅ | `OPENAI_API_KEY` 같은 식 |
| 상태 | select | ✅ | 활성 / 미사용 / 만료예정 |
| 연결 서비스 | select | ✅ | OpenAI / Anthropic / Supabase / Vercel / Cloud Run / 기타 |
| 사용 위치 | multi-select | ✅ | Vercel / Cloud Run / GitHub Secrets / 로컬 개발 |
| 사용 프로젝트 | relation → 📁 프로젝트 | ✅ | 프로젝트별 필터링 (핵심) |
| 환경 | multi-select | 권장 | dev / staging / prod |
| 용도 | text | 권장 | 한 줄 설명 |
| 재발급 위치 | URL | 권장 | 대시보드 링크 |

### 2-2. 페이지 본문 포맷

각 엔트리의 페이지 본문은 다음 구조:

````markdown
# 키 값

```
<실제 키 값 그대로 붙여넣기>
```

# 메모
- YYYY-MM-DD 발급
- <발급 계정 / 프로젝트 정보>
- <한도 / 스코프 / 제약>
- <기타 특이사항>

# 관련 링크
- 대시보드: <URL>
- 문서: <URL>
- 이슈: <URL>
````

**필수**:
- `# 키 값` 아래 코드블록에 실제 값
- 코드블록은 언어 지정 없이 바로 값 (` ``` `)

**선택**:
- 메모·링크 섹션 (장기 유지보수에 도움)

---

## 3. 운영 워크플로

### 3-1. 신규 키 등록 (Just-in-time)

**트리거**: 다음 상황이 발생하면 30초 투자로 Notion에 등록.

1. 새 프로젝트 셋업 중 `.env.local`에 새 변수 붙여넣을 때
2. Vercel 대시보드에 환경변수 추가할 때
3. GitHub Secrets 등록할 때
4. 터미널에 키 붙여넣을 때
5. 배포 실패 디버깅 중 키 값 확인하러 들어갔을 때

**절차**:
1. Notion → 🔑 서비스/환경변수 목록 → `+ New`
2. 속성 채우기 (변수명, 상태=활성, 연결 서비스, 사용 위치, 사용 프로젝트, 용도)
3. 페이지 열고 본문에 코드블록 + 실제 값
4. 재발급 위치 URL 반드시 채우기 (6개월 뒤 자신이 고마워함)
5. 저장

### 3-2. 작업 중 키 조회

**Claude Code 사용 시 프롬프트 예**:
```
허브와이즈 dev 환경에서 필요한 키들을 Notion 🔑 서비스/환경변수 목록 DB에서
조회해줘.

조건:
- 사용 프로젝트 = 허브와이즈
- 환경에 dev 포함
- 상태 = 활성

각 키마다:
1. 변수명
2. 페이지 본문 첫 번째 코드블록의 실제 값
3. 용도

.env.local 형식으로 출력:
VARIABLE_NAME=actual_value
```

Claude가 Notion MCP로 조회 → 화면에 출력 → `.env.local`에 복사.

### 3-3. 키 로테이션

**트리거**: 다음 상황에서 만료예정 처리 + 재발급.

- 의심스러운 커밋에 키 노출 (git 히스토리 포함)
- 대시보드에서 만료 경고
- 90일 경과 (주요 키에만 적용)
- 퇴사·협업자 변경

**절차**:
1. Notion DB에서 해당 엔트리 → 상태를 `만료예정`으로
2. 재발급 위치 URL 클릭 → 새 키 발급
3. 엔트리 복제 (duplicate) → 새 엔트리의 페이지 본문 키 값 교체
4. 기존 엔트리는 상태 `미사용`으로 (삭제 금지, 이력 보존)
5. 사용 위치에 반영:
   - 로컬 `.env.local` 업데이트
   - Vercel 대시보드 업데이트
   - GitHub Secrets 업데이트 (수동)
6. 다음 배포 시 `.env` 조회 트리거되어 새 키 사용 확인

### 3-4. 키 폐기

**트리거**: 서비스 해지, 프로젝트 종료.

**절차**:
1. Notion DB 엔트리 → 상태 `미사용`
2. 사용 위치에서 제거:
   - `.env` 파일에서 삭제
   - Vercel 환경변수 삭제
   - GitHub Secrets 삭제
3. 실제 서비스 측 키 무효화 (대시보드에서 revoke)
4. 엔트리 본문 상단에 `# 폐기 이력` 섹션 추가, 날짜·사유 기록

**엔트리 자체 삭제 금지**. 이력 보존용.

---

## 4. Claude Code 통합 규칙

Claude Code는 프로젝트 작업 중 환경변수·API 키가 필요한 상황에서 다음 규칙을
따른다.

### 4-1. 조회 우선 원칙

키가 필요한 상황 인지 시:

1. **먼저 Notion 🔑 DB 조회** (MCP 사용)
   - 필터: `사용 프로젝트` = 현재 프로젝트, `상태` = 활성
   - 매칭 시: 페이지 본문 첫 번째 코드블록 추출 → 제시
2. **Notion에 없을 경우 CEO에 알림**
   ```
   이 작업에 <VAR_NAME> 키가 필요합니다.
   Notion DB에 등록되어 있지 않습니다.
   지금 값을 입력해주시면 .env.local에 반영하고 Notion에도 등록하겠습니다.
   (또는 'skip'이라고 답하면 TODO만 남기고 진행합니다)
   ```
3. **CEO 응답 처리**
   - 값 제공 시 → `.env.local` + Notion 동시 등록
   - `skip` 시 → `.env.local`에 `# TODO: <VAR_NAME> required, register in Notion`
     주석 남기고 진행

### 4-2. 자동 업로드 금지

- 로컬 `.env`에서 발견한 키를 Notion에 **자동 업로드 금지**
- CEO 명시 승인 필요 (보안 책임 문제)
- 이유: 누가 왜 뭘 추가했는지 명확해야 함

### 4-3. 키 교체 시 주의

Claude가 임의로 키 교체하지 않음:

- 오래된 키로 판단돼도(401 에러 등) 교체는 CEO 확인 후
- 재발급은 CEO가 직접 대시보드에서 수행
- Claude는 업데이트된 값 반영만 담당

### 4-4. 커밋 규칙

- `.env`, `.env.local`, `.env.*` 파일은 **git 커밋 금지**
- `.gitignore`에 명시 (v5.3에서 계승)
- 실수로 커밋 시 즉시 `git filter-branch` 또는 BFG로 히스토리 정리 + 해당 키 즉시 로테이션

---

## 5. 배포 타겟별 처리

### 5-1. Vercel

- **읽기**: `vercel env pull .env.local` 가능
- **쓰기**: 대시보드 또는 `vercel env add <name> <env>` CLI
- **Notion ↔ Vercel 동기화**: 수동. Phase 2에서 스크립트화 검토

### 5-2. GitHub Secrets

- **읽기 불가** (보안 설계상 write-only)
- **쓰기**: 저장소 Settings → Secrets and variables → Actions
- **Notion 엔트리**: "있다는 사실"만 기록. 값 확인은 Notion에서
- GitHub Secrets에 추가 시 반드시 Notion에도 엔트리 (그 반대는 자동 안 됨)

### 5-3. Cloud Run

- **읽기/쓰기**: `gcloud run services describe/update` CLI
- **Notion ↔ Cloud Run 동기화**: 수동

### 5-4. 로컬 개발 (.env.local)

- 휘발성. 언제든 Notion에서 다시 생성 가능
- 머신마다 다른 키 쓰고 싶으면 Notion 엔트리 `환경` 필드로 구분

---

## 6. 현재 상태 및 이관 로드맵

### 6-1. 현재 (2026-04-22)

- DB 스키마 완성 (이 문서 §2 기준)
- 실제 엔트리는 Just-in-time으로 점진 등록 중
- 이관률: 미정 (CEO가 작업 중 자연 발견)

### 6-2. 1주일 후 목표

- 3~5개 엔트리 등록 (자주 쓰는 것부터)
- 각 엔트리에 `재발급 위치` URL 채움 (100%)

### 6-3. 1개월 후 목표

- 모든 활성 프로젝트의 주요 키 커버
- `.env.local` 분실 시 Notion에서 30분 이내 복원 가능
- 프로젝트 간 키 중복 발견 시 정리

### 6-4. 3개월 후 목표

- 100% 이관
- `sync-env-from-notion.mjs` 스크립트 도입 검토 (Phase 2)

---

## 7. 예외·엣지 케이스

### 7-1. Notion 자체 접근용 NOTION_TOKEN

**문제**: Notion MCP 인증용 NOTION_TOKEN은 Notion에 넣을 수 없음 (닭-달걀).

**해결**:
- `~/.claude/mcp-config.json` 또는 OS keychain에 저장
- Notion DB에는 "NOTION_TOKEN 존재 사실 + 발급 위치 + 스코프"만 기록
- 값은 수동 관리

### 7-2. 서비스 계정 JSON (멀티라인)

Google Cloud, Firebase 등의 JSON 키:

**절차**:
- Notion 페이지 본문에 코드블록으로 JSON 통째로 붙여넣기
- `사용 위치` = `로컬 개발` + `Cloud Run` 등 복수 선택
- 로컬에서는 파일로 저장 (`.gcp-key.json`, `.gitignore` 포함)
- `GOOGLE_APPLICATION_CREDENTIALS=./.gcp-key.json` 같이 변수명은 경로로

### 7-3. 멀티 환경 같은 키명

예: `DATABASE_URL` 이 dev/staging/prod 다를 때.

**옵션 A** (권장): 엔트리 3개 생성. `환경` 필드로 구분. 변수명 동일 OK.
**옵션 B**: 엔트리 1개. 페이지 본문에 환경별 섹션 분리.

옵션 A가 명확. 단 관리 엔트리 수 증가.

### 7-4. 만료일 모름

**처리**:
- 상태: 활성
- 본문 메모에 "만료일 미확인" 명시
- 월 1회 체크 주간 설정

---

## 8. 금지 사항

- Notion 외부에 키 값 **마스터 저장소 만들기 금지** (Vercel UI 등은 "동기화
  대상"이지 "진실의 원천" 아님)
- **Notion 엔트리 삭제 금지** (상태 변경으로 lifecycle 관리)
- **값 마스킹·일부 가리기 금지** (`sk-...xxxx` 형태는 복사 불가로 무용지물)
- **CEO 승인 없이 자동 키 업로드·교체 금지**
- **프로덕션 secret, 결제 secret 등 민감 정보는 Notion 금지** (§1-4 참조)

---

## 9. 버전 변경 이력

| 버전 | 날짜 | 주요 변경 |
|---|---|---|
| v1.0 | 2026-04-22 | 초안. Notion 중심, Just-in-time, 페이지 본문 코드블록 |
