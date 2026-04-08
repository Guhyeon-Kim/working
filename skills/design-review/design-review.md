---
name: design-review
description: design-agent 완료 전, qa-agent UI 검토 시 자동 로드. HubWise 디자인 품질 기준으로 평가한다.
allowed-tools: Read
---

# Design Review

디자인 결과물이 HubWise 품질 기준을 충족하는지 평가한다.
"그럴듯해 보임"이 아니라 구체적 기준으로 판단한다.

> 상세 기준: `.claude/docs/design-guide.md` (Design System v1.0)
> 시각 검증: Puppeteer MCP로 스크린샷 확인 가능

## 품질 체크리스트

### 레이아웃 / maxWidth
```
□ Reading 페이지 (뉴스상세, 전략상세, 마이페이지, 일지상세): maxWidth 720px
□ Standard 페이지 (검색, 일반 목록): maxWidth 800px 또는 content-area
□ Wide 페이지 (대시보드, 포트폴리오): content-area (1040px)
□ 페이지 간 width 일관성이 있는가?
```

### 여백과 리듬
```
□ 섹션 간격이 48~72px 범위인가?
□ 카드 내부 패딩이 20~28px인가? (1.25rem~1.75rem)
□ 요소 간격이 8/12/16/24px 배수인가? (임의값 없는가)
□ 줄 간격이 1.5~1.7인가?
```

### 타이포그래피 계층
```
□ 랜딩 히어로: Plus Jakarta Sans + clamp(1.875rem, 7vw, 4.5rem)
□ 페이지 제목: 28~32px / weight 700
□ 섹션 제목: 18~20px / weight 600
□ 본문: 14~15px / weight 400
□ 보조 텍스트: 12~13px / var(--hw-muted) or var(--hw-muted-2)
□ 한국어 텍스트: word-break: keep-all 적용됐는가?
```

### 컬러 사용 (Design System v1.0)
```
□ CSS 변수 사용 (하드코딩 없는가)
□ --hw-* 변수 사용 (레거시 --navy, --surface 없는가)
□ 브랜드 그린 var(--hw-green) #00D48A 일관성 있게 사용
□ 코랄 var(--hw-coral) #FF7E5F — 편향/포인트 강조용으로만 사용
□ 상승 var(--hw-rise) #F04452 / 하락 var(--hw-fall) #1D6FEB 올바르게 사용
□ 다크 섹션: var(--hw-navy) #0F172A — Hero/CTA 전용
□ 배경: var(--hw-bg) #F8FAFC / 카드: var(--hw-surface) #FFFFFF
□ 배경-텍스트 대비비 4.5:1 이상 (WCAG AA)
```

### 상태 처리 (5가지 모두 필수)
```
□ 기본(default): 정상 데이터 있을 때
□ 호버(hover): transition 정의됐는가
□ 로딩(loading): skeleton 또는 spinner
□ 에러(error): 메시지 + 재시도 버튼
□ 빈 데이터(empty): 안내 문구 + 행동 유도
```

### 반응형
```
□ 모바일(< 768px): 1열 또는 스택 레이아웃
□ 터치 영역 최소 44px
□ 텍스트 잘림 없는가 (overflow 처리)
```

### Koyfin/Stripe 기준 비교
```
□ 데이터가 밀도 있게 배치됐는가? (Koyfin)
□ 여백이 숨쉬는 느낌인가? (Stripe)
□ 정보 계층이 한눈에 파악되는가?
□ 불필요한 장식 요소가 없는가?
```

### 시각 검증 (Puppeteer MCP)
```
□ 실제 배포 URL에서 스크린샷 확인
□ 모바일(390px viewport) 레이아웃 깨짐 없는가?
□ 텍스트 줄바꿈이 자연스러운가?
□ 다른 페이지들과 width 일관성이 있는가?
```

## 평가 결과 형식

```
[디자인 리뷰] 화면명

충족
✅ [항목]: [확인 내용]

미충족
❌ [항목]: [구체적으로 무엇이 부족한가]
   수정 방향: [어떻게 수정해야 하는가]

판정: PASS / FAIL
```

## FAIL 기준

다음 중 하나라도 해당하면 FAIL:
- 상태 처리 5가지 중 하나라도 누락
- 임의 간격 값 사용 (8의 배수 아닌 것)
- 하드코딩된 컬러 값
- 타이포그래피 계층 없음 (모든 텍스트 같은 크기)
