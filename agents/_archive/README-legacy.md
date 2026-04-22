# Legacy 에이전트 — v6.5 이후 동적 팀 방식으로 전환

아래 에이전트들은 v6.5(2026-04-16)부터 **동적 팀 방식**에서 스킬·프롬프트·Codex 위임으로 대체됨.
보관 이유: 기존 워크플로우가 여전히 참조하거나 레퍼런스 가치.
삭제 금지.

| 에이전트 | 대체 방식 |
|---|---|
| context-agent | `project-log` + `context-summary` 스킬로 대체 |
| design-agent | `design-system` + `ui-component` + `wireframe` 스킬 + Gemini 리서치 |
| frontend-agent | 동적 팀 + Codex CLI 위임 (30줄 이상 or 다중 파일 시) |
| backend-agent | 동적 팀 + Codex CLI 위임 |

필요하면 `agents/legacy/<이름>.md`를 참조하거나 복원 가능.
