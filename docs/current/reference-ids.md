# 레퍼런스 ID 모음 (Notion·Figma·GitHub)

**양식**: reference-ids v1.0
**작성일**: 2026-04-22
**용도**: Claude Code가 MCP 호출·relation 설정 시 즉시 참조할 ID·URL 모음

---

## 1. Notion DB — 데이터 소스 ID

### 1-1. 💻 개발 노트 (primary devlog)
- **DB URL**: https://www.notion.so/cbb9883990a344d0a70b832b6d02c104
- **Data source ID**: `collection://1212c0d1-40ed-425e-915f-eedca3577add`
- **양식 버전**: v2.0 (2026-04-22부터)
- **용도**: 모든 세션 종료 devlog 엔트리 저장
- **주요 필드**: 이름, 상태, 카테고리, 담당, 프로젝트, 내용, 작업시간, 소요시간, 결과, 회고, 양식버전, 관련 기획·디자인·리서치, 페이지

### 1-2. 📁 프로젝트
- **DB URL**: https://www.notion.so/aa50afa7fa984b26848386ed5e2788db
- **Data source ID**: `collection://01f317d5-3b1e-4f49-9e2a-e8a73747ca47`
- **용도**: 💻 개발 노트의 `프로젝트` relation 대상
- **레코드 4개**:

| 프로젝트 | Page ID | 상태 |
|---|---|---|
| 허브와이즈 | `34ac9134-4e44-81fa-a168-f5ed6af29e08` | active |
| B무거나 | `34ac9134-4e44-81f9-b0f7-c04fae5edb5d` | dormant (검증 후 release candidate 판단) |
| 컨텐츠 자동화 | `34ac9134-4e44-81a2-881a-d2c8ecdd049f` | active |
| 하네스 | `34ac9134-4e44-81dd-a34d-c1b5b0950225` | active (현재 v6.0 검증 중) |

### 1-3. 🔑 서비스/환경변수 목록
- **DB URL**: https://www.notion.so/cdd0200bf9784d28a09ee81b403e255e
- **Data source ID**: `collection://df78cece-2c1a-43b8-bde6-435ab74e14db`
- **용도**: API 키·환경변수 primary 저장소
- **원칙**: 페이지 본문 코드블록에 실제 값 그대로 (상세: `docs/current/key-management.md`)
- **속성**: 변수명, 상태, 연결 서비스, 사용 위치, 사용 프로젝트, 환경, 용도, 재발급 위치

### 1-4. 기타 연계 DB

| DB | URL | Data source ID | 용도 |
|---|---|---|---|
| 🔍 리서치 | https://www.notion.so/9c56f720c7bc4d23ba045f8b3bd5e619 | `collection://4473ce41-60f4-447b-ac80-b5c233a867ec` | researcher 산출물 |
| 📋 기획 | https://www.notion.so/1997d248c6d343a48c7e1825b9df04f7 | `collection://034e225f-0d34-48ff-8c39-7b51fbbd0cef` | planner 요건서 |
| 🎨 디자인 | https://www.notion.so/901783fc31c64d86a5a9b3a03588b7ae | `collection://ed07de07-5646-4846-8d14-e02968f96af8` | designer 산출물 |
| 📝 히스토리 | https://www.notion.so/68627fdc14984fdc9fab2c491e252ce2 | `collection://2505fdf6-73c6-46dd-acef-5beffeef7765` | 장기 이력 |
| 🌐 외부 서비스 현황 | https://www.notion.so/b851e663aca94d30b78152c62a011015 | `collection://29fe9dcb-e3ca-4fa3-8f4b-8fde87b4e53e` | 외부 서비스 계정·구독 |
| 🚀 배포 이력 | https://www.notion.so/ed64fc54afaa486db233f09fb4592d56 | `collection://1dcf25bb-fb0f-46a0-bc2a-aa7384809227` | 배포 이벤트 로그 |

---

## 2. Notion 주요 페이지

| 페이지 | URL | Page ID |
|---|---|---|
| 🧠 구현's Command Center (최상위) | https://www.notion.so/339c91344e44811c966bcdeff42e0a47 | `339c9134-4e44-811c-966b-cdeff42e0a47` |
| 업무 | https://www.notion.so/344c91344e44812eb8f2d1430932151b | `344c9134-4e44-812e-b8f2-d1430932151b` |
| 🎯 개인 프로젝트 (메인 허브) | https://www.notion.so/330c91344e4481d39ed1d1880f31cf65 | `330c9134-4e44-81d3-9ed1-d1880f31cf65` |
| 📚 문서 아카이브 | https://www.notion.so/330c91344e44818299e7f8e1e44e2dc6 | `330c9134-4e44-8182-99e7-f8e1e44e2dc6` |

---

## 3. Figma

### 3-1. 화면설계서 템플릿
- **파일 키**: `FlmjhAVz1V85K6K1Lcp0iM`
- **스타일 2종**: PPT 스타일(슬라이드 단위), 페이지 스타일(캔버스 단위)
- **주 사용 프로젝트**: 허브와이즈
- **제약**: Starter 플랜 MCP 호출 한도 월 6회 (Pro $20/월 업그레이드 검토 중)

---

## 4. GitHub

### 4-1. 레포 (주요)
- working (하네스 본체) — 현재 세션에서 v6.0 구축 대상
- hubwise-invest — 허브와이즈 프로덕트
- blevels — 블레벨
- contents-auto — 컨텐츠 자동화

### 4-2. Codespaces 사용 현황 (2026-04-22 기준)
- 플랜: GitHub Pro ($4/월)
- 월 한도: compute 180 core-hours + storage 20GB
- 소진: 85.12 / 90 compute hours (94.6%)
- **적용 원칙**: `CLAUDE.md §2-7` 참조

---

## 5. 사용 규칙

### 5-1. devlog 엔트리 생성 시
```
parent: data_source_id = 1212c0d1-40ed-425e-915f-eedca3577add

properties:
  이름: "<작업 타이틀>"
  상태: "완료" | "진행중" | "계획"
  카테고리: "기능" | "버그수정" | ...
  담당: "Claude" | "CEO" | "Gemini" | "Codex" | "수동" | "시스템"
  프로젝트: [해당 프로젝트 page ID] — 위 §1-2의 4개 중 하나
  결과: "성공" | "부분성공" | "실패" | "판단보류"
  양식버전: "v2.0"
  date:작업시간:start: "YYYY-MM-DDTHH:MM:00+09:00"
  date:작업시간:end: "YYYY-MM-DDTHH:MM:00+09:00"
  date:작업시간:is_datetime: 1
```

### 5-2. 키 조회 시
```
data_source_url: collection://df78cece-2c1a-43b8-bde6-435ab74e14db
필터: 사용 프로젝트 = <프로젝트명>, 상태 = 활성
→ 각 엔트리 페이지 본문 첫 코드블록이 실제 값
```

### 5-3. ID 변경·추가 시
- 이 파일을 진실의 원천으로 유지
- 변경 시 `docs/current/reference-ids.md` 업데이트 + 변경 이력 추가

---

## 6. 변경 이력

| 버전 | 날짜 | 변경 |
|---|---|---|
| v1.0 | 2026-04-22 | 초안. v6.0 구축 시점 모든 ID·URL 통합 정리 |
