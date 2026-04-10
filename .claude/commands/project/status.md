# 현재 프로젝트 상태 확인

대상: $ARGUMENTS (비어있으면 전체 현황)

## 실행 순서

1. **프로젝트 상태 수집**:
   - `.claude/activity-log.md` 최근 활동
   - `.claude/gc-state.json` GC 상태
   - `.claude/cli-status.json` CLI 가용성
   - `agents/memory/` 학습 현황 (failure-cases, success-patterns 건수)
   - `.claude/agents/memory/evolving-rules.json` 반복 에러 패턴
2. **진행중 작업 확인**: project-log.md에서 [in-progress] 항목 추출
3. **대기중 항목 확인**: pending-hookify.json, post-push-pending.md 확인
4. **헬스 대시보드 출력**: 간결한 현황 요약

## 출력 형식

```
📊 Working Hub 현황
━━━━━━━━━━━━━━━━━━━━
CLI: Claude ✅ | Gemini ✅ | Codex ✅
진행중: [작업 목록]
대기중: [대기 항목]
학습: 실패 N건 | 성공 N건 | 진화규칙 N건
최근 활동: [최근 3개]
```
