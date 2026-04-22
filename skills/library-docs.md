# library-docs

**버전**: v6.0
**주 사용 에이전트**: builder, researcher
**연계 스킬**: dependency-check

---

## 목적

라이브러리 사용 시 **최신·공식 문서**를 기반으로 구현. LLM 학습 데이터에
의존하면 outdated 패턴·사라진 API를 쓰게 됨. Context7 MCP가 이 문제를 해결.

---

## 호출 시점

- 빠르게 변하는 라이브러리 사용 시
  - Next.js (15.x App Router, Server Actions 등)
  - Tailwind CSS (v4 변경)
  - React (v19 변경)
  - Supabase (Auth, RLS)
  - shadcn/ui
  - Prisma
- 새로 도입하는 라이브러리
- "이 API 맞나?" 의심 들 때

---

## 입력

- 라이브러리 이름
- 버전 (가능하면 명시)
- 찾으려는 주제 (예: "Next.js 15 Server Actions form validation")

---

## 절차

### 1. Context7 MCP 사용
```
Context7 MCP에 다음 쿼리:
- Library: Next.js
- Version: 15.x
- Topic: Server Actions with form validation

Context7가 공식 문서의 관련 섹션을 반환.
```

### 2. 공식 문서 페이지 확인
- 공식 사이트 URL
- 해당 섹션
- 마지막 업데이트 날짜

### 3. 버전 일치 확인
- 프로젝트의 package.json 버전
- Context7가 제공한 문서의 대상 버전
- 차이 있으면 명시적 버전 조회

### 4. 예제 코드 추출
- 공식 예제 그대로
- 또는 공식 패턴을 따르는 예제

### 5. 구버전과의 차이 기록
마이그레이션 작업이면 before/after 대비.

### 6. builder에 전달
코드 조각 + 문서 링크.

---

## 출력

### 문서 참조 결과

```markdown
# Library Docs: <라이브러리>

**조회일**: YYYY-MM-DD
**대상**: <라이브러리>@<버전>
**주제**: <찾으려는 것>

---

## 1. 공식 문서 링크
<URL>

## 2. 핵심 패턴

### 2-1. Server Actions with form validation (Next.js 15)

```typescript
'use server'

import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function login(formData: FormData) {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten() };
  }

  // ... 처리
  return { success: true };
}
```

### 2-2. 클라이언트 측
```tsx
'use client'

import { useActionState } from 'react';
import { login } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action}>
      <input name="email" />
      <input name="password" type="password" />
      {state?.error && <p>{JSON.stringify(state.error)}</p>}
      <button disabled={pending}>Login</button>
    </form>
  );
}
```

---

## 3. 버전별 차이

### v14 → v15
- `useFormState` → `useActionState`
- 서버 액션 return 타입은 Serializable
- `revalidatePath` / `revalidateTag` 사용 권장

---

## 4. 주의사항
- 폼 필드 누락 시 FormData.get은 null 반환 → Zod로 체크
- 민감 정보 return 금지 (client로 흘러감)

---

## 5. 관련 문서
- <공식 문서 URL 1>
- <블로그·튜토리얼 URL>
```

---

## 빠르게 변하는 라이브러리 주의 목록

| 라이브러리 | 버전 | 주의 |
|---|---|---|
| Next.js | 15.x | App Router, Server Actions, `useActionState` |
| React | 19 | `use` hook, `useActionState`, `useOptimistic` |
| Tailwind | 4 | `@theme` directive, CSS 변수 체계 |
| shadcn/ui | 최신 | tailwind-merge, radix 버전 |
| Supabase | 최신 | Auth SSR, `@supabase/ssr` 패키지 |
| Zod | 3.x | 최신 정밀 타입 |
| Prisma | 6.x | accelerate, pulse |

---

## 체크리스트

- [ ] Context7 MCP로 최신 문서 조회 (학습 데이터 의존 X)
- [ ] 프로젝트 버전과 문서 대상 버전 일치
- [ ] 공식 예제 기반 (블로그·AI 생성물 X)
- [ ] breaking change 있을 시 before/after 비교
- [ ] 관련 문서 링크 제공

---

## 금지

- **학습 데이터 기반 추측**: "Next.js는 보통 이렇게..."
- **스택 오버플로 맹신**: 오래된 답변 가능성, 공식 우선
- **AI 생성 예제 신뢰**: 최신성 불확실
- **버전 불일치 무시**: v14 문서를 v15 프로젝트에 적용
- **"동작하면 됨" 태도**: 이유 모르고 쓰면 업그레이드 때 깨짐

---

## 예시

**상황**: 허브와이즈 로그인 폼을 Next.js 15로 구현.

**실패 패턴 (학습 데이터)**:
```tsx
import { useFormState } from 'react-dom'; // v14 API
```
→ Next.js 15에서는 `useActionState`로 변경됐음. Context7 조회 안 하면 놓침.

**정답**:
Context7 → Next.js 15 문서 → `useActionState` 확인 후 구현.
