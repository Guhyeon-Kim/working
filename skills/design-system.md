# design-system

**버전**: v6.0
**주 사용 에이전트**: designer
**연계 스킬**: design-review, ui-component

---

## 목적

프로젝트의 **디자인 토큰·컴포넌트·패턴**을 정의·관리. 일관성을 코드·디자인
양쪽에서 담보.

---

## 호출 시점

- 프로젝트 초기 디자인 시스템 수립
- 기존 시스템 정비 (일관성 깨진 부분 수정)
- 새 컴포넌트·패턴 추가 검토
- 브랜드 리뉴얼

---

## 입력

- 프로젝트 (허브와이즈 / B무거나 / 기타)
- 변경 범위 (토큰 / 컴포넌트 / 패턴)
- 레퍼런스 (있으면)

---

## 절차

### 1. 현황 파악
- 현재 정의된 토큰 (Tailwind config)
- 현재 사용 중인 컴포넌트 (shadcn/ui 계열)
- 현재 패턴 (폼·카드·네비 등)

### 2. 토큰 레이어 정의
- **색**:
  - Primitive (blue-500, red-500 등 원시값)
  - Semantic (primary, destructive, muted 등 의미값)
  - Component (button-bg, input-border 등 컴포넌트별)
- **간격**: 4px 베이스 (Tailwind 기본)
- **타이포그래피**:
  - 패밀리 (Pretendard, 모노 Fira Code)
  - 크기 (text-xs ~ text-6xl)
  - 두께 (font-normal ~ font-bold)
- **그림자·보더·반경**
- **애니메이션**:
  - easing (ease-out, cubic-bezier)
  - duration (150ms, 300ms)

### 3. 컴포넌트 카탈로그
카테고리별:
- **Primitive**: Button, Input, Checkbox, Radio
- **Composite**: Card, Dialog, Dropdown
- **Navigation**: Header, Sidebar, Breadcrumb
- **Data**: Table, List, Pagination
- **Feedback**: Alert, Toast, Progress

각 컴포넌트:
- 원본 소스 (shadcn/ui URL 등)
- 커스터마이징 여부
- 사용 예시

### 4. 패턴 문서화
- 폼 (검증·에러 표시·submit 상태)
- 로딩 상태 (스켈레톤·스피너·프로그레스)
- 빈 상태 (일러스트·CTA)
- 에러 상태 (inline·page level)

### 5. 위반 감지 규칙
- Tailwind 임의 값 사용 (`bg-[#abc]`) 금지
- 정의 안 된 색·간격 사용 금지
- 컴포넌트 복제 (카드 UI를 다시 짜기) 금지

---

## 출력

```markdown
# <프로젝트> 디자인 시스템

**버전**: 1.0
**기술 스택**: Tailwind 4 + shadcn/ui

---

## 1. 토큰

### 1-1. 색
#### Primitive (Tailwind 기본)
blue-*, red-*, neutral-* 등

#### Semantic
- `primary`: blue-600 (CTA, 링크)
- `primary-foreground`: white
- `destructive`: red-600
- `muted`: neutral-100
- `muted-foreground`: neutral-600

#### Component
별도 필요 시.

### 1-2. 간격
4px 베이스. Tailwind 기본 사용 (1=4px, 4=16px, 8=32px...)

### 1-3. 타이포그래피
- 패밀리: Pretendard
- 크기: text-xs(12) ~ text-6xl(60)
- 두께: font-normal(400), font-medium(500), font-semibold(600), font-bold(700)

---

## 2. 컴포넌트 카탈로그

### 2-1. Button
- 원본: shadcn/ui Button
- 커스터마이징: 없음
- Variants: default, destructive, outline, ghost, link
- Sizes: sm, default, lg, icon
- 사용 예:
  ```tsx
  <Button variant="default" size="lg">계산하기</Button>
  ```

### 2-2. Card
- 원본: shadcn/ui Card
- 커스터마이징: `hover:shadow-md` 추가
- 사용 예: ...

### 2-3. <Feature Card>
- 자체 제작
- 위치: components/shared/FeatureCard.tsx
- 사용 예: ...

---

## 3. 패턴

### 3-1. 폼 검증
- Zod + react-hook-form
- 에러 메시지: 필드 하단 빨간색 text-xs
- submit 중: 버튼 disabled + spinner

### 3-2. 로딩 상태
- 컨텐츠 로드: 스켈레톤 (shadcn/ui Skeleton)
- 액션 수행: 버튼 내 스피너
- 페이지 전환: Next.js loading.tsx

### 3-3. 빈 상태
- 일러스트(선택) + 메시지 + CTA

### 3-4. 에러 상태
- Inline: 폼 필드 하단
- Page: shadcn Alert (destructive)

---

## 4. 위반 감지
### 금지 사항
- `className="bg-[#abcdef]"` (임의 색)
- `className="p-[17px]"` (임의 간격)
- 새 컴포넌트 만들기 전 카탈로그 확인

### ESLint 규칙
- `tailwindcss/no-arbitrary-value`: warn
- `tailwindcss/classnames-order`: warn

---

## 5. 변경 이력
| 버전 | 날짜 | 변경 |
```

---

## 체크리스트

- [ ] 색 3층(primitive·semantic·component) 구분
- [ ] 모든 공용 컴포넌트가 카탈로그에 있음
- [ ] 4개 상태 패턴(로딩·빈·에러·성공) 정의
- [ ] 위반 감지 규칙 명시
- [ ] 사용 예시 코드 포함

---

## 금지

- **토큰 난립**: 10가지 파랑·빨강 색 만들기 → semantic 재사용
- **문서 없이 컴포넌트 추가**: 카탈로그 없으면 재사용 불가
- **강제 일괄 변경**: 기존 코드 일괄 교체는 builder 영역, 팀 합의 필요
