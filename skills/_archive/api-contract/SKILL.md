---
name: api-contract
description: data-agent가 API 명세 작성 시 자동 로드. frontend와 backend가 같은 계약서를 기반으로 구현하도록 계약 형식을 제공한다.
allowed-tools: Read, Write
---

# API Contract

frontend-agent와 backend-agent가 동일한 계약서를 보고 구현하게 하는 것이 목표.
필드명 불일치는 이 프로젝트의 반복 버그였다.

## 필드명 표준 (변경 금지)

| 항목 | 표준 필드명 | 금지 필드명 |
|------|------------|-----------|
| 현재가 | `price` | current_price, currentPrice |
| 등락률 | `change_rate` | change_pct, changePct, changeRate |
| 종목명 | `name` | stock_name, stockName |
| 종목코드 | `ticker` | code, symbol |
| 공개여부 | `visibility` | is_public (하위호환 유지) |
| 날짜 | `trade_date` | traded_at |

모든 필드: snake_case 사용

## API 응답 표준 구조

```typescript
// 성공 (단일)
{ data: T }

// 성공 (목록)
{ data: T[], total: number }

// 에러
{ error: string, code?: string }
```

## 에러 코드 표준

| HTTP | 의미 | 사용자 메시지 |
|------|------|-------------|
| 400 | 잘못된 요청 | "입력 정보를 확인해주세요." |
| 401 | 인증 필요 | "로그인이 필요합니다." |
| 403 | 권한 없음 | "접근 권한이 없습니다." |
| 404 | 없음 | "정보를 찾을 수 없습니다." |
| 500 | 서버 오류 | "일시적인 오류입니다. 잠시 후 다시 시도해주세요." |

## API Spec 작성 형식

```markdown
## [GET/POST/PUT/DELETE] /api/경로

**설명**: 무엇을 하는 API
**인증**: Bearer Token 필요 / 불필요
**Admin 전용**: 예 / 아니오

### Request

Query Parameters (GET)
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| ticker | string | Y | 종목코드 |

Body (POST/PUT)
```json
{
  "field": "type — 설명"
}
```

### Response 200
```json
{
  "price": "number — 현재가",
  "change_rate": "number — 등락률(%)"
}
```

### 에러 케이스
| 상황 | 상태코드 | 응답 |
|------|---------|------|
| 종목 없음 | 404 | { "error": "종목을 찾을 수 없습니다." } |
| KIS API 실패 | 200 | yfinance fallback 데이터 반환 |
```

## 계약 완료 체크

```
□ 모든 엔드포인트가 정의됐는가?
□ Request/Response 필드명이 필드명 표준을 따르는가?
□ 에러 케이스가 모두 정의됐는가?
□ 인증 필요 여부가 명시됐는가?
□ fallback 동작이 명시됐는가?
```
