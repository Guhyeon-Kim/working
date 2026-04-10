# 에이전트에게 작업 위임

위임 요청: $ARGUMENTS

## 사용법

```
/project:delegate [에이전트] [작업 설명]
```

예시:
- `/project:delegate pm 사용자 인증 기능 요건 정의`
- `/project:delegate research 국내 로보어드바이저 시장 분석`
- `/project:delegate design 대시보드 화면 설계`
- `/project:delegate security HubWise API 보안 감사`

## 에이전트 라우팅

| 키워드 | 에이전트 | 설명 |
|--------|----------|------|
| pm | pm-agent | 요구사항 → 기술 명세 |
| research | research-agent | Gemini CLI 리서치 |
| design | design-agent | 화면 디자인 명세 |
| data | data-agent | DB 스키마 + API 계약 |
| frontend | frontend-agent | 프론트엔드 구현 |
| backend | backend-agent | 백엔드 구현 |
| qa | qa-agent | 배포 전 검증 |
| security | security-agent | 보안 감사/STRIDE |
| infra | infra-agent | 인프라 비용/성능 |
| context | context-agent | 상태 관리/로깅 |
| marketing | marketing-agent | 그로스/카피 |

## 실행 순서

1. 요청에서 에이전트 이름과 작업 내용 파싱
2. 해당 에이전트의 .md 파일 읽어서 역할/프로토콜 확인
3. delegation_workflow.md 프로토콜에 따라 컨텍스트 준비
4. Agent 도구로 해당 에이전트 실행
5. 결과 요약 보고
