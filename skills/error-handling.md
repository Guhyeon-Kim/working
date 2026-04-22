# error-handling

**버전**: v6.0
**주 사용 에이전트**: builder
**연계 스킬**: api-contract, qa-test

---

## 목적

코드의 **모든 실패 경로**를 의식적으로 다루기 위한 패턴·체크리스트. "잘 되겠지"
대신 "망가질 수 있는 모든 방식"을 먼저 열거.

---

## 호출 시점

- builder가 새 기능 구현 시
- 기존 코드의 에러 핸들링 강화 (기술 부채 해소)
- 프로덕션 이슈 원인 분석 후 개선

---

## 입력

- 대상 함수·모듈
- 외부 의존성 목록 (DB·API·파일 I/O 등)

---

## 절차

### 1. 실패 모드 열거
이 코드가 실패할 수 있는 모든 경로:

#### 외부 I/O
- DB 연결 실패 / 쿼리 타임아웃 / 데드락
- API 호출 실패 / 타임아웃 / 비정상 응답
- 파일 읽기·쓰기 실패 / 권한 없음 / 디스크 가득
- 네트워크 끊김

#### 입력
- null / undefined
- 타입 불일치
- 범위 초과
- 특수 문자·인코딩

#### 로직
- 0으로 나누기
- 배열 인덱스 초과
- 재귀 깊이 초과
- 무한 루프

#### 환경
- 환경변수 누락
- 메모리 부족
- 동시성 문제

### 2. 처리 전략 결정
각 실패 모드에 전략:
- **Fail fast**: 즉시 에러 throw, 상위로 전파
- **Recover**: 기본값·대체 경로로 복구
- **Retry**: 지수 백오프로 재시도
- **Circuit break**: 반복 실패 시 일시 차단
- **Log + continue**: 기록만 하고 계속 (비중요)

### 3. 에러 구조화
- Error 클래스 위계 (도메인별)
- 에러 코드 (기계 판독용 문자열)
- 에러 메시지 (사용자 표시용)
- 컨텍스트 (디버깅용 메타데이터)

### 4. 경계 설정
- 서비스 경계 (서버·클라이언트): 에러 직렬화 포맷 고정
- 모듈 경계: 외부에 노출할 에러 vs 내부만
- 사용자 경계: 기술 상세 숨기고 친화적 메시지

### 5. 로깅 전략
- 레벨: debug·info·warn·error·fatal
- 포함 정보: 타임스탬프, 에러 코드, 사용자 ID (PII 주의), 스택
- 민감 정보: 비밀번호·토큰 마스킹

---

## 출력·패턴

### TypeScript Result 패턴
```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

async function calculateBiasScore(
  userId: string
): Promise<Result<BiasScores, BiasError>> {
  try {
    const trades = await fetchTrades(userId);
    if (trades.length < 5) {
      return {
        ok: false,
        error: { code: 'INSUFFICIENT_DATA', message: '매매 기록 부족' },
      };
    }
    const scores = compute(trades);
    return { ok: true, value: scores };
  } catch (e) {
    return {
      ok: false,
      error: { code: 'INTERNAL', message: '계산 실패', cause: e },
    };
  }
}
```

### 커스텀 에러 클래스
```typescript
class BiasError extends Error {
  constructor(
    public code: string,
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'BiasError';
  }
}

// 사용
throw new BiasError('INACTIVE_ACCOUNT', '비활성 계정입니다');
```

### Next.js API 라우트 에러
```typescript
export async function POST(req: Request) {
  try {
    // ... logic
    return Response.json({ data });
  } catch (e) {
    if (e instanceof BiasError) {
      return Response.json(
        { error: { code: e.code, message: e.message } },
        { status: mapErrorToStatus(e.code) }
      );
    }
    // 예상치 못한 에러
    console.error('[api/bias/score] unexpected', e);
    return Response.json(
      { error: { code: 'INTERNAL', message: '일시적 오류' } },
      { status: 500 }
    );
  }
}
```

### React 에러 바운더리
```tsx
<ErrorBoundary fallback={<ErrorFallback />}>
  <BiasScoreWidget />
</ErrorBoundary>
```

### 재시도 (exponential backoff)
```typescript
async function retryable<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === maxAttempts - 1) throw e;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
  throw new Error('unreachable');
}
```

---

## 체크리스트

- [ ] 모든 외부 I/O에 try/catch 또는 Result
- [ ] 모든 `throw`에 에러 코드
- [ ] 사용자 표시 메시지는 기술 상세 숨김
- [ ] 로그에 디버깅 컨텍스트 (사용자 ID·요청 ID)
- [ ] 민감 정보(비밀번호·토큰) 로그 금지
- [ ] 예상하지 못한 에러도 처리 (catch 최후 보루)
- [ ] 재시도 가능한 에러만 재시도 (400은 재시도 금물)
- [ ] 타임아웃 명시

---

## 금지

- **catch 후 무시**: `catch (e) {}` → 최소 로그
- **에러 메시지만으로 분기**: `e.message.includes('...')` → 에러 코드 사용
- **any 에러 throw**: `throw 'something'` → Error 클래스 사용
- **민감 정보 노출**: 스택 트레이스에 비밀번호·토큰
- **에러 삼키기**: 상위로 안 올리고 몰래 무시

---

## 예시 사용

**builder가 구현 중**:
편향 지수 계산 함수를 만들고 있다. 호출 소스는 API 라우트, 의존성은 Supabase.

**체크**:
- Supabase 호출 실패 → `BiasError('DB_ERROR', ...)` throw
- 매매 기록 없음 → `BiasError('NO_DATA', ...)` 반환 (204 매핑)
- 계산 중 NaN 발견 → `BiasError('CALC_ERROR', ...)` throw
- 사용자 비활성 → `BiasError('INACTIVE_ACCOUNT', ...)` throw (403 매핑)
- API 라우트: 모든 BiasError를 상태코드로 매핑, 그 외는 500
