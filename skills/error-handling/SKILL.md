---
name: error-handling
description: 에러 처리 코드 작성이 필요할 때 자동 로드. API 오류, 네트워크 오류, 유효성 검사 실패 처리 시 사용.
---

# Error Handling 스킬

## 핵심 원칙

> 에러는 사용자의 잘못이 아니다. 에러 메시지는 사용자를 탓하지 않고 해결 방법을 안내한다.
> 모든 에러는 세 가지를 알려줘야 한다: 무슨 일이 생겼는가, 왜 생겼는가, 어떻게 하면 되는가.
> 콘솔에는 디버깅용 상세 정보, UI에는 사용자 친화적 메시지.

---

## 에러 계층 설계

```
앱 전체
└── app/error.tsx (예상치 못한 전체 오류)
    ├── 페이지별
    │   └── [page]/error.tsx (페이지 수준 오류)
    └── 컴포넌트별
        └── try/catch + fallback UI (비즈니스 로직 오류)
```

---

## HTTP 상태 코드별 메시지

| 상태 | 사용자 메시지 | 개발자 액션 |
|------|-------------|------------|
| 400 | "입력 정보를 확인해주세요." | 어느 필드가 문제인지 field 단위로 안내 |
| 401 | "로그인이 필요합니다." | 로그인 페이지로 리디렉트 |
| 403 | "접근 권한이 없습니다." | 권한 설명 + 대안 제시 |
| 404 | "요청한 정보를 찾을 수 없습니다." | 목록으로 이동 링크 제공 |
| 429 | "잠시 후 다시 시도해주세요." (N초 후) | 재시도 타이머 표시 |
| 500 | "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요." | Sentry/로그 기록 |
| 503 | "서비스가 일시적으로 중단됐습니다." | retry 버튼 + 상태 페이지 링크 |

---

## 유효성 검사 메시지

```
required:   "[필드명]을 입력해주세요."
format:     "[필드명] 형식이 올바르지 않습니다. 예: [예시]"
length:     "[필드명]은 [N]자 이상 입력해주세요."
maxLength:  "[필드명]은 [N]자 이하로 입력해주세요."
minValue:   "[필드명]은 [N] 이상이어야 합니다."
duplicate:  "이미 사용 중인 [필드명]입니다."
```

---

## 재시도 전략

```typescript
// 지수 백오프 (Exponential Backoff) — 네트워크 일시 장애 시
async function fetchWithRetry(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries - 1) throw error
      // 500ms, 1000ms, 2000ms 대기
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500))
    }
  }
}

// 재시도 금지 케이스 (클라이언트 에러는 재시도해도 의미 없음)
const RETRY_FORBIDDEN = [400, 401, 403, 404, 422]
```

---

## 에러 UI 컴포넌트

```typescript
// 인라인 에러 (폼 필드 등)
<Alert variant="destructive">
  <AlertDescription>{errorMessage}</AlertDescription>
</Alert>

// 로딩 실패 (데이터 없음)
<div className="text-center py-8 space-y-3">
  <p className="text-hw-text-muted">{errorMessage}</p>
  <Button variant="outline" onClick={retry} size="sm">
    다시 시도
  </Button>
</div>

// 전체 페이지 에러
<div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
  <p className="text-lg text-hw-text-secondary">{errorMessage}</p>
  <div className="flex gap-3">
    <Button onClick={retry}>다시 시도</Button>
    <Button variant="outline" onClick={() => router.back()}>이전으로</Button>
  </div>
</div>

// 빈 상태 (에러가 아닌 데이터 없음)
<div className="text-center py-12 space-y-3">
  <p className="text-hw-text-muted">{emptyMessage}</p>
  <Button onClick={onAction}>{actionLabel}</Button>
</div>
```

---

## 백엔드 에러 처리 패턴

```python
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
import logging, json

logger = logging.getLogger("hubwise")

# 전역 에러 핸들러
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # 내부 에러는 로그로만
    logger.error(json.dumps({
        "event": "unhandled_error",
        "path": str(request.url.path),
        "error": type(exc).__name__,
        "detail": str(exc)[:200]
    }))
    # 사용자에게는 안전한 메시지만
    return JSONResponse(
        status_code=500,
        content={"detail": "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요."}
    )

# 비즈니스 로직 에러
def raise_not_found(resource: str):
    raise HTTPException(status_code=404, detail=f"{resource}을(를) 찾을 수 없습니다.")

def raise_forbidden():
    raise HTTPException(status_code=403, detail="접근 권한이 없습니다.")
```

---

## 주의사항

```
□ 콘솔: 기술적 에러 로그 (개발자용)
□ UI: 사용자 친화적 메시지만 (스택 트레이스 절대 노출 금지)
□ 에러 바운더리: 컴포넌트 레벨에서 최대한 처리
□ 재시도: 400/401/403/404는 재시도 의미 없음
□ 빈 상태와 에러 상태 구분: 에러는 retry, 빈 상태는 action CTA
□ 금융 데이터 에러: "데이터를 불러올 수 없습니다" (원인 노출 금지)
```
