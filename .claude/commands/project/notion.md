# Notion에 산출물 정리

요청: $ARGUMENTS

## 실행 순서

1. **대상 파악**: 어떤 산출물을 Notion에 정리할지 확인
   - 비어있으면: 현재 프로젝트의 모든 산출물 대상
   - 특정 파일 지정 시: 해당 파일만
2. **Notion 검색**: `notion-search`로 기존 관련 페이지 확인
3. **페이지 생성/업데이트**:
   - 기존 페이지 있으면 → `notion-update-page`
   - 없으면 → `notion-create-pages`
4. **구조화**:
   - 프로젝트별 상위 페이지 → 산출물별 하위 페이지
   - 태그: 프로젝트명, 산출물 유형, 상태 (draft/review/confirmed)
5. **결과 보고**: 생성/업데이트된 Notion 페이지 링크 제공

## 산출물 → Notion 매핑

| 산출물 | Notion 위치 |
|--------|-------------|
| requirements.md | [프로젝트명] > 요건 명세 |
| wireframe.md | [프로젝트명] > 와이어프레임 |
| flowchart.md | [프로젝트명] > 서비스 플로우 |
| test-scenarios.md | [프로젝트명] > 테스트 시나리오 |
| 리서치 보고서 | [프로젝트명] > 리서치 |
