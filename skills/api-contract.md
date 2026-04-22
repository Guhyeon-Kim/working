# api-contract

**버전**: v6.0
**주 사용 에이전트**: builder, planner
**연계 스킬**: requirements-spec, error-handling

---

## 목적

API 엔드포인트의 입력·출력·에러 스키마를 코드 구현 **전**에 고정.
Frontend·Backend·Tester가 같은 계약을 참조하여 병행 작업 가능하게 함.

---

## 호출 시점

- 새 API 엔드포인트 설계
- 기존 API 변경 (breaking change 감지·호환성 분석)
- Frontend·Backend 분리 개발 시
- 외부 API 통합 (상대 API 문서를 자체 계약으로 재정의)

---

## 입력

- 요건서 (수용 기준 포함)
- API 경로 (예: `POST /api/bias/score`)
- 기존 API가 있으면 그 스키마

---

## 절차

### 1. 엔드포인트 기본 정보
- 경로 + HTTP 메서드
- 목적 (1~2문장)
- 인증·권한 요구 (공개 / 로그인 / 특정 role)
- Rate limit (있으면)

### 2. 입력 스키마
- Path parameters
- Query parameters
- Request body (Zod 또는 TypeScript 타입)
- Headers (Content-Type, Authorization 등)

### 3. 출력 스키마
- 성공 응답 (상태코드·body)
- 에러 응답 (상태코드·body)
- 응답 헤더 (Cache-Control, rate limit 등)

### 4. 에러 카탈로그
각 가능한 에러 케이스:
- 상태코드
- 에러 코드 (문자열, 기계 판독용)
- 메시지 (사용자 표시용)
- 발생 조건

### 5. 예시 호출
- curl 또는 fetch 예시 (성공·실패 각각)

### 6. 비기능 명세
- 예상 응답 시간
- 처리량 (QPS)
- 캐싱 정책

---

## 출력

```markdown
# API 계약: POST /api/bias/score

**버전**: 1.0
**프로젝트**: 허브와이즈
**상태**: draft | stable | deprecated

---

## 1. 기본 정보
- **경로**: `/api/bias/score`
- **메서드**: POST
- **목적**: 사용자의 매매 기록을 기반으로 편향 지수(FOMO 등) 계산
- **인증**: 로그인 필수 (Supabase JWT)
- **Rate limit**: 10회/일 (사용자당)

---

## 2. 입력

### Headers
```
Authorization: Bearer <supabase-jwt>
Content-Type: application/json
```

### Body (Zod)
```typescript
z.object({
  period: z.enum(['1m', '3m', '6m', '1y']),  // 집계 기간
  include_inactive: z.boolean().default(false),  // 비활성 종목 포함
})
```

---

## 3. 출력

### 성공: 200 OK
```typescript
{
  fomo: number,           // 0~100
  herding: number,        // 0~100
  loss_aversion: number,  // 0~100
  overconfidence: number, // 0~100
  calculated_at: string,  // ISO 8601
  based_on: {
    trade_count: number,
    period: string,
  },
}
```

### 빈 데이터: 204 No Content
- body 없음
- 매매 기록 부족 시 (<5건)

---

## 4. 에러 카탈로그

| 상태 | 에러 코드 | 메시지 | 조건 |
|---|---|---|---|
| 400 | INVALID_PERIOD | 유효하지 않은 기간입니다 | period 값 오류 |
| 401 | UNAUTHORIZED | 로그인이 필요합니다 | JWT 없음·만료 |
| 403 | ACCOUNT_INACTIVE | 비활성 계정입니다 | 계정 상태 inactive |
| 429 | RATE_LIMIT_EXCEEDED | 일일 한도를 초과했습니다 | 10회 초과 |
| 500 | INTERNAL_ERROR | 일시적 오류입니다 | 서버 예외 |

### 에러 응답 포맷
```json
{
  "error": {
    "code": "ACCOUNT_INACTIVE",
    "message": "비활성 계정입니다"
  }
}
```

---

## 5. 예시

### 성공
```bash
curl -X POST https://hubwise.com/api/bias/score \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"period": "3m"}'

# 200 OK
# { "fomo": 67, "herding": 42, ... }
```

### 실패 (Rate limit)
```bash
# 429 Too Many Requests
# { "error": { "code": "RATE_LIMIT_EXCEEDED", ... } }
```

---

## 6. 비기능 명세
- **응답 시간**: p95 < 3초, p99 < 5초
- **처리량**: 예상 QPS 10 이하
- **캐싱**: 응답은 1시간 ISR 캐시 (동일 사용자·period)

---

## 7. 변경 이력
| 버전 | 날짜 | 변경 |
```

---

## 체크리스트

- [ ] 성공·모든 에러 케이스 명시
- [ ] 에러 코드(문자열) + 상태코드 둘 다 있음
- [ ] 입력 스키마 타입 명시 (Zod·TypeScript)
- [ ] 인증·권한 요구사항 명확
- [ ] Rate limit (해당 시)
- [ ] 성공·실패 예시 호출
- [ ] 응답 시간·QPS 등 비기능 명세

---

## 금지

- **스키마 없는 API**: "적절히 반환" 같은 모호함
- **에러 누락**: happy path만 명세
- **에러 코드 재사용**: 같은 코드가 여러 의미를 가지면 혼란
- **breaking change를 조용히**: 버전 올리고 이력 남길 것
