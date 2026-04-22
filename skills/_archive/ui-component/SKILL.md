---
name: ui-component
description: UI 컴포넌트 설계 및 구현이 필요할 때 자동 로드. shadcn/ui + Tailwind CSS 기반 컴포넌트 작성, 디자인 시스템 정의 시 사용.
---

# UI Component 스킬

## 시니어 원칙

> 컴포넌트는 "재사용 가능한 코드 덩어리"가 아니다. "사용자 인터랙션의 단위"다. 인터랙션 없이 묶이는 것들은 컴포넌트가 아니라 레이아웃이다.
> Props 5개 이상이면 설계가 잘못된 것이다. Context나 Composition으로 해결하라.
> 컴포넌트를 만들기 전에 shadcn/ui에 이미 있는지 확인하라. 없으면 shadcn 위에 조합하라. 그래도 없을 때만 처음부터 만들라.

---

## 기술 스택

- UI 라이브러리: shadcn/ui (Context7 MCP로 최신 API 확인 후 구현)
- 스타일링: Tailwind CSS + 프로젝트 디자인 시스템 CSS 변수
- 아이콘: Lucide React
- 차트: Recharts (항상 dynamic import)
- 애니메이션: Framer Motion (복잡한 경우만 — 기본 transition은 Tailwind)

---

## 프로젝트 디자인 시스템

> **단일 소스**: `.claude/docs/design-system.md`
> 이 파일이 없으면 design-system 스킬로 먼저 생성해야 한다.
> 아래는 CSS 변수 사용 패턴 예시이며, 실제 변수명과 값은 design-system.md를 따른다.

### 컬러 토큰 (CSS 변수 필수 — 하드코딩 절대 금지)

프로젝트 디자인 시스템에 정의된 CSS 변수를 사용한다. 일반적으로 다음과 같은 범주의 변수가 필요하다:

```css
/* 배경 */
--bg              /* 앱 기본 배경 */
--surface         /* 카드/패널 배경 */
--surface-2       /* 중첩 카드 배경 */

/* 브랜드 */
--primary         /* 주 브랜드 색상 */
--secondary       /* 보조 브랜드 색상 */

/* 텍스트 */
--text            /* 본문 */
--text-secondary  /* 보조 텍스트 */
--text-muted      /* 비활성/설명 */

/* 경계 */
--border          /* 기본 경계선 */
--card-shadow     /* 카드 그림자 */

/* 상태 */
--success         /* 수익/긍정 */
--danger          /* 손실/위험 */
--warning         /* 주의 */
```

### 레이아웃 기준

```
maxWidth: 프로젝트 레이아웃 기준 참조

간격: 8px grid (8/12/16/20/24/32/48/64/80/96px)
반응형: mobile-first
  - sm: 640px / md: 768px / lg: 1024px / xl: 1280px
터치 영역: 최소 44×44px (모바일)
```

### 타이포그래피

```
본문: 프로젝트 지정 폰트
폰트 스케일: text-xs(12) / text-sm(14) / text-base(16) / text-lg(18) / text-xl(20) / text-2xl(24) / text-3xl(30)
```

---

## 컴포넌트 설계 의사결정 트리

```
1. shadcn/ui에 있는가?
   YES → 그대로 사용 (커스터마이징은 className prop으로)
   NO  ↓

2. shadcn 컴포넌트 조합으로 만들 수 있는가?
   YES → Composition 패턴으로 구현
   NO  ↓

3. 처음부터 구현 (아래 패턴 준수)
```

---

## 컴포넌트 구현 패턴

### 기본 패턴

```typescript
// 1. Props는 최소화 (5개 이하 원칙)
// 2. 변형은 variant prop으로 (className 오버로딩 금지)
// 3. forwardRef 사용 (외부에서 ref 접근 가능하게)
// 4. aria 속성 필수

interface ComponentProps {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  className?: string
  children: React.ReactNode
}

export const ComponentName = React.forwardRef<HTMLDivElement, ComponentProps>(
  ({ variant = 'default', size = 'md', isLoading, className, children }, ref) => {
    return (
      <div
        ref={ref}
        role="[적절한 ARIA 역할]"
        aria-label="[컴포넌트 설명]"
        aria-busy={isLoading}
        className={cn(
          'rounded-lg border border-[--border] bg-[--surface]',
          variant === 'outline' && 'border-2',
          size === 'sm' && 'p-3',
          size === 'md' && 'p-4',
          size === 'lg' && 'p-6',
          isLoading && 'opacity-60 pointer-events-none',
          className
        )}
      >
        {isLoading ? <Skeleton className="h-full w-full" /> : children}
      </div>
    )
  }
)
ComponentName.displayName = 'ComponentName'
```

### 금융 데이터 표시 패턴

```typescript
// 수익/손실 색상 — 하드코딩 금지
const PriceChange = ({ value }: { value: number }) => (
  <span className={cn(
    'font-medium tabular-nums',
    value > 0 ? 'text-[--success]' : value < 0 ? 'text-[--danger]' : 'text-[--text-muted]'
  )}>
    {value > 0 ? '+' : ''}{value.toFixed(2)}%
  </span>
)

// 숫자 포맷 — 천 단위 구분자 + tabular-nums
const formatNumber = (n: number) =>
  n.toLocaleString('ko-KR', { maximumFractionDigits: 0 })
```

### 5-State 컴포넌트 패턴

```typescript
// 모든 데이터 컴포넌트는 5가지 상태를 처리해야 한다
interface DataCardProps<T> {
  data: T | null
  isLoading: boolean
  error: Error | null
  isEmpty: boolean
  onRetry: () => void
  emptyMessage: string
  emptyAction?: { label: string; onClick: () => void }
  children: (data: T) => React.ReactNode
}

export function DataCard<T>({
  data, isLoading, error, isEmpty, onRetry,
  emptyMessage, emptyAction, children
}: DataCardProps<T>) {
  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />

  if (error) return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p className="text-sm text-[--text-muted]">데이터를 불러올 수 없습니다</p>
      <Button variant="outline" size="sm" onClick={onRetry}>다시 시도</Button>
    </div>
  )

  if (isEmpty || !data) return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm text-[--text-muted]">{emptyMessage}</p>
      {emptyAction && (
        <Button size="sm" onClick={emptyAction.onClick}>{emptyAction.label}</Button>
      )}
    </div>
  )

  return <>{children(data)}</>
}
```

---

## 성능 기준

```
□ 불필요한 리렌더링 방지:
  - props가 객체/배열이면 useMemo로 안정화
  - 콜백은 useCallback (deps 배열 정확히)
  - 단순 변수는 useMemo 금지 — 오버엔지니어링
□ 이미지: next/image 필수 (HTML img 금지)
□ Recharts 등 차트: 항상 dynamic import (lazy load)
□ 컴포넌트 번들 > 10kb gzip → 분리 검토 → CTO 승인
```

---

## 접근성 (Accessibility) 체크리스트

```
□ 인터랙티브 요소에 aria-label 또는 aria-labelledby
□ 로딩 상태: aria-busy="true"
□ 에러 상태: role="alert" (스크린 리더 즉시 읽음)
□ 모달/드로어: focus trap + ESC 닫기
□ 색상만으로 상태 구분 금지 → 아이콘/텍스트 병행
□ 터치 영역: 최소 44×44px
□ 키보드 탐색: Tab 순서 논리적
```

---

## 금지 패턴

```
❌ 인라인 style 속성 — className 사용
❌ 하드코딩 색상 (#1A1A2E 등) — CSS 변수 사용
❌ Props 5개 초과 설계 — Context 또는 Composition 패턴
❌ 데이터 없음 시 null 반환 — Empty State 필수
❌ 에러 시 null 반환 — 에러 UI + 재시도 버튼 필수
❌ Recharts 직접 import — dynamic import 필수
```

---

## 컴포넌트 완료 체크리스트

```
□ shadcn/ui 우선 확인 후 필요 시만 커스텀 구현
□ 프로젝트 디자인 시스템 CSS 변수 사용
□ 5-State 모두 구현 (기본/로딩/빈/에러/부분실패)
□ aria 속성 완비
□ 모바일 44px 터치 영역 확보
□ Props ≤ 5개 (초과 시 설계 재검토)
□ 불필요한 useMemo/useCallback 없음
□ Context7 MCP로 shadcn/ui 최신 API 확인 완료
```
