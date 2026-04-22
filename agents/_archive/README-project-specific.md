# 프로젝트 특화 에이전트

Working Hub는 **공통 인프라**를 담당한다. 아래 에이전트들은 **특정 프로젝트에서만 쓰는 특화 지식**을 보유하므로,
원칙적으로 해당 프로젝트 repo의 `.claude/agents/`에 이관되어야 한다.

| 에이전트 | 대상 프로젝트 |
|---|---|
| invest-content-agent | 허브와이즈 (devlog, 재테크 콘텐츠) |
| invest-education-agent | 허브와이즈 (행동재무학 교육) |
| invest-trading-agent | 허브와이즈 (종목/ETF 분석, Admin 전용) |

**이관 방법**: 해당 프로젝트 repo에서 `node /workspaces/working/scripts/bootstrap.mjs` 후 수동 복사.
이관 완료되면 이 폴더에서 삭제.
