---
name: library-docs
description: Context7 MCP로 최신 라이브러리 문서를 주입해 코드 생성 품질을 높이는 가이드. 새 라이브러리 사용 전·Codex 위임 전 자동 로드.
---

# Library Docs — Context7 MCP 활용

## 사용 시점 (Context7 서버 공식 지침 기반)

**✅ 사용해야 할 때**
- 라이브러리·프레임워크·SDK·CLI·클라우드 서비스 관련 질문/작업
- API 문법, 설정, 버전 마이그레이션, 라이브러리 특화 디버깅, 셋업·CLI 사용법
- **이미 안다고 생각되는 유명한 라이브러리(React, Next.js, Prisma 등)도 사용 권장** — 학습 데이터가 최신 변경을 반영 못 함
- Codex CLI 위임 전 `delegate.mjs codex` 패킷에 관련 문서 주입

**❌ 사용 금지**
- 리팩터링, 스크립트를 처음부터 작성, 비즈니스 로직 디버깅
- 코드 리뷰, 일반 프로그래밍 개념(디자인 패턴 등)
- 웹 검색으로 충분한 비기술 주제

## 도구 체인 (2단계)

```
1) resolve-library-id(libraryName)
   → 후보 목록 반환 (신뢰도·버전별)
   → 가장 적합한 libraryId 선택

2) query-docs(libraryId, query, topic?)
   → 최신 문서 발췌 반환
```

## 패턴 — 올바른 흐름

### 예시 1: Next.js 15 App Router 데이터 패칭
```
Q: "Next.js 15에서 서버 컴포넌트 데이터 캐싱 어떻게?"

[잘못된 접근] Claude 내부 지식으로 답 → 버전 차이 반영 못 함
[올바른 접근]
  1. resolve-library-id("next.js") → /vercel/next.js 선택
  2. query-docs("/vercel/next.js", "server component cache revalidate", topic="data-fetching")
  3. 반환된 최신 API(`revalidateTag`, `cache` 옵션 등) 기반 답변
```

### 예시 2: Codex 위임 전 문서 주입
```
작업: "Supabase 클라이언트 코드 작성 위임"

[흐름]
  1. library-docs로 Supabase 최신 SDK 문서 확보
  2. delegate.mjs codex backend "..." 실행 시 패킷에 포함:
     - [Supabase SDK 최신 API] resolve-library-id 결과 + query-docs 발췌
  3. Codex가 할루시네이션 없이 최신 API로 구현
```

## 주의 사항

- **libraryId 형태**: `/{owner}/{repo}` 관례 (예: `/vercel/next.js`). resolve 결과 그대로 사용.
- **topic 활용**: `query-docs` 호출 시 `topic`(hooks/routing/auth/deployment 등)을 주면 결과가 좁혀져 토큰 절약.
- **버전 명시**: 특정 버전 필요 시 query에 명시 (예: "React 19 useOptimistic").
- **신뢰도 낮은 라이브러리**: resolve에서 여러 후보가 유사 점수면 가장 star 수·최신 업데이트 기준 선택.
- **캐시하지 말 것**: 라이브러리 문서는 시시각각 변할 수 있음. 중요한 작업은 그 시점에 재조회.

## 위임 패킷에 포함시키는 규칙

`scripts/delegate.mjs`가 codex 위임 시 자동으로 library-docs를 주입하진 않는다.
따라서 Claude가 위임 전에 **수동으로** Context7 호출 → 결과를 task 본문에 포함시켜야 한다.

```
// 좋은 예
task = `
Next.js 15 App Router로 /dashboard 페이지 구현.

[Context7 주입]
- revalidateTag API: (query-docs 결과)
- generateMetadata: (query-docs 결과)

[요구사항]
...
`;
delegate.mjs codex frontend "$task"
```

## 반복 작업 절약

한 세션에서 같은 라이브러리를 여러 번 참조하면 매번 query-docs 할 필요 없음. 첫 결과를 메모하거나 `/tmp/context7-cache/{lib}-{topic}.md`에 저장 후 재사용.
