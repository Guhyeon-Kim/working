# ui-component

**버전**: v6.0
**주 사용 에이전트**: designer, builder
**연계 스킬**: design-system, design-review

---

## 목적

개별 UI 컴포넌트의 API·variants·상호작용을 설계. 재사용 가능한 단위로 설계.

---

## 호출 시점

- 새 공용 컴포넌트 신설 (FeatureCard, BiasScoreGauge 등)
- 기존 컴포넌트 확장 (새 variant·size 추가)
- 컴포넌트 API 리팩토링 (props 재설계)

---

## 입력

- 컴포넌트 용도
- 사용할 화면·상황
- 기존 유사 컴포넌트 (참조)

---

## 절차

### 1. 책임 정의
- 이 컴포넌트가 하는 일 한 문장
- 하지 않는 일 (경계 명확)

### 2. Props 설계
- 필수 vs 선택
- 타입 (`string`, `enum`, `boolean`)
- 기본값
- 제한 (min·max·정규식)

### 3. Variants·Sizes
- 시각적 변형 (primary/secondary/outline)
- 크기 (sm/md/lg)
- 상태 (default/hover/focus/disabled/loading)

### 4. 컴포지션 전략
- children 허용?
- slots (header·body·footer 구분)?
- asChild 패턴 (Radix UI 방식)?

### 5. 접근성
- 적절한 ARIA role
- 키보드 조작
- focus 관리
- 스크린리더 레이블

### 6. 사용 예시 작성
- 최소 사용
- 일반 사용
- 고급 사용

---

## 출력

```markdown
# Component: BiasScoreGauge

**버전**: 1.0
**프로젝트**: 허브와이즈
**위치**: components/bias/BiasScoreGauge.tsx

---

## 1. 책임
FOMO·군중심리 등의 편향 지수(0~100)를 원형 게이지로 시각화.

## 1-1. 하지 않는 일
- 데이터 fetching (부모가 전달)
- 해석 텍스트 제공 (별도 컴포넌트)

---

## 2. Props

```typescript
interface BiasScoreGaugeProps {
  /** 점수 (0~100) */
  score: number;
  
  /** 게이지 레이블 */
  label: string;
  
  /** 크기 */
  size?: 'sm' | 'md' | 'lg';  // 기본 'md'
  
  /** 색 테마 */
  variant?: 'default' | 'warning' | 'critical';  // 기본 'default'
  
  /** 로딩 상태 */
  loading?: boolean;
  
  /** 클릭 핸들러 (상세 보기 등) */
  onClick?: () => void;
}
```

### Props 설명
- `score`: 0 미만 또는 100 초과 시 clamp (범위 내로 보정)
- `variant`: `default` = blue, `warning` = amber, `critical` = red
- `loading`: true 시 스켈레톤 표시

---

## 3. Variants·Sizes

### Sizes
| size | 크기 | 용도 |
|---|---|---|
| sm | 60x60px | 리스트·카드 내 |
| md | 120x120px | 기본 (대시보드) |
| lg | 200x200px | 결과 페이지 히어로 |

### Variants
- default: 일반 점수
- warning: 주의 구간 (60~80)
- critical: 경고 구간 (80+)

자동 variant 결정을 컴포넌트에 내장하지 않음 (부모 결정).

---

## 4. 컴포지션
- children 없음 (self-contained)
- 추가 컨텐츠 필요 시 부모 레이아웃에서

---

## 5. 접근성
- `role="progressbar"`
- `aria-valuenow`, `aria-valuemin=0`, `aria-valuemax=100`
- `aria-label={label}`
- onClick 제공 시 `<button>` 요소로 렌더
- 키보드 focus 링

---

## 6. 사용 예시

### 최소
```tsx
<BiasScoreGauge score={67} label="FOMO" />
```

### 로딩 상태
```tsx
<BiasScoreGauge score={0} label="FOMO" loading />
```

### 클릭 가능
```tsx
<BiasScoreGauge
  score={85}
  label="군중심리"
  size="lg"
  variant="critical"
  onClick={() => router.push('/bias/herding')}
/>
```

---

## 7. 테스트 체크 (tester용)
- [ ] score 0·50·100에서 렌더
- [ ] score -10·150 clamp 동작
- [ ] loading 시 스켈레톤
- [ ] variant 별 색 적용
- [ ] 접근성 (aria-valuenow)
- [ ] onClick 있으면 button, 없으면 div
- [ ] 키보드 focus (onClick 있을 때)

---

## 8. 변경 이력
| 버전 | 날짜 | 변경 |
```

---

## 체크리스트

- [ ] 책임과 비책임 명확
- [ ] Props 모두 타입·기본값 표기
- [ ] Variants·Sizes 표
- [ ] 접근성 명세
- [ ] 최소·일반·고급 사용 예 최소 3개
- [ ] tester용 체크 리스트

---

## 금지

- **Props 과다**: 10개 이상이면 컴포지션 재설계 필요
- **상호 배타적 props**: `disabled`와 `onClick` 같이 있어서 안 됨
- **내부 fetching**: 컴포넌트 내에서 API 호출 (재사용성 저해)
- **접근성 생략**: ARIA·키보드 최소한은 필수
