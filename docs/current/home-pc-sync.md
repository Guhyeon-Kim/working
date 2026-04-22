# 집 PC 동기화 가이드 (두 번째 환경)

**버전**: v6.0 기준
**최종 업데이트**: 2026-04-22
**선행 문서**: [setup.md](setup.md) (회사 PC 기준 최초 셋업)

회사 PC에서 이미 working repo 셋업을 마친 뒤, **집 PC(또는 다른 두 번째 Windows 환경)** 에서 같은 하네스를 쓸 때의 가이드. `setup.md`와 중복되는 부분은 생략하고 **집 PC에서만 다른 것**·**자동화 원리**·**트러블슈팅**에 집중한다.

---

## 1. 최초 1회 (bootstrap)

회사 PC와 동일하게 [setup.md §2~§5](setup.md#2-전제-조건-확인) 를 따른다. 단, **§6(훅 활성화) 대신 `bootstrap.mjs`** 를 쓰는 것이 권장 경로다.

```bash
# 전제: Node 20+, git, npm 설치 완료
git clone https://github.com/Guhyeon-Kim/working.git
cd working
git config --local user.email "hako6632@gmail.com"
git config --local user.name "Guhyeonkim"

# 한 줄 bootstrap (회사 PC와 다른 핵심)
node scripts/bootstrap.mjs --apply
```

`bootstrap.mjs --apply`가 하는 일:

1. 환경 점검 (claude·node·git·python 가용성)
2. `~/.claude-config/` dotfiles repo clone (없을 때만)
3. `sync-user-scope.mjs` 실행 → `~/.claude/hooks/`·`~/.claude/skills/`·`settings.json` 배치
4. `setup-plugins.mjs --apply` 실행 → gptaku 플러그인 + Python 의존성
5. **`git config core.hooksPath .githooks`** 설정 ← 이후 자동 sync의 핵심

`install-hooks.mjs`와의 차이: `install-hooks.mjs`는 working repo의 `hooks/*.mjs`를 `~/.claude/hooks/`로 복사하는 **단일 목적** 스크립트고, `bootstrap.mjs`는 dotfiles·플러그인·`core.hooksPath`까지 **전체 머신 상태**를 세팅한다. 집 PC 첫 방문에는 `bootstrap.mjs`가 맞다.

---

## 2. 이후 `git pull` 시 자동 동작

`core.hooksPath = .githooks`가 설정된 뒤부터, `git pull`·`git merge` 완료 시 [.githooks/post-merge](../../.githooks/post-merge) 가 자동 발동한다.

**자동 sync 흐름**:

```
git pull
  └─ post-merge (.githooks/post-merge)
       └─ node scripts/sync-user-scope.mjs
            ├─ hooks/ → ~/.claude/hooks/ 재복사
            ├─ skills/ → ~/.claude/skills/ 재복사
            ├─ settings.json → ~/.claude/settings.json (경로만 이 OS로 재작성)
            └─ 완료 (stderr 로그 1줄, 임시 파일·sentinel 없음)
```

브랜치 전환 시는 [.githooks/post-checkout](../../.githooks/post-checkout) 이 `hooks/`·`skills/`·`settings.json` 변경 유무를 diff로 확인한 뒤 변경 있을 때만 sync를 돌린다 (과잉 발동 방지).

**실행-후-삭제 원칙**: 훅은 sync를 돌리고 나면 어떤 sentinel·marker·pending 파일도 남기지 않는다. 재현 상태는 오직 `~/.claude/` 실존과 mtime으로 판정한다. 따라서:

- 중간에 훅이 중단돼도 다음 pull이 자연스럽게 복구
- 수동으로 `node scripts/sync-user-scope.mjs`를 언제든 재실행해도 무해 (idempotent)
- 훅이 "실행됐다"는 흔적을 따로 남기지 않음 — CI 아티팩트 오염 우려 없음

`bootstrap.mjs` 자체도 같은 원칙이다. 한 번 실행한 뒤 `~/.claude-config/`·`~/.claude/hooks/` 가 건강하면 다음 실행 때 `모든 항목 정상. 추가 작업 불필요.` 로 즉시 종료한다. 사실상 **1회성 스크립트**로 동작하되, 파일 자체를 삭제할 필요 없이 "재실행해도 no-op"이 되는 구조다.

---

## 3. 회사 PC와 다른 점 (체크리스트)

| 항목 | 회사 PC | 집 PC |
|---|---|---|
| Notion integration 토큰 | 최초 발급·DB 연결 | **기존 토큰 재사용 가능** — `claude mcp add notion ...` 명령만 복사해서 실행. Rotate 할 필요 없지만 보안 기준 상향이면 Rotate 후 양쪽 재입력 |
| `git config user.email` | global이면 무관 | **반드시 `--local`로 `hako6632@gmail.com` 오버라이드** — 집 PC가 타 프로젝트에서 회사 이메일을 global에 쓸 수 있음 |
| Codespaces 병행 | 한 쪽만 사용 | **이전 머신의 Codespace는 stop이 아닌 delete** ([CLAUDE.md §2-7](../../CLAUDE.md)). 양쪽 다 idle이면 compute 이중 소진 |
| 훅 활성화 | `install-hooks.mjs` 또는 `bootstrap.mjs` | **`bootstrap.mjs --apply` 권장** — `core.hooksPath` 까지 한 번에 세팅 |
| PATH 확인 | — | Git Bash에서 `echo $PATH`에 `C:\Users\<me>\AppData\Roaming\npm` 포함돼 있는지 확인 |

**Notion 토큰 공유 주의**: `~/.claude.json`은 평문 저장이다. 토큰을 회사 PC → 집 PC로 옮길 때 Slack·메신저 같은 클라우드 싱크 채널에 남지 않게 할 것. 가장 안전한 방식은:

1. 집 PC에서 [Notion Integrations](https://www.notion.so/profile/integrations) 에 직접 로그인해서 기존 "Claude Code (Working Hub)" integration의 secret을 본다
2. 그대로 `claude mcp add` 커맨드에 붙여넣는다
3. 회사 PC에 다시 접근할 때 `Rotate secret`으로 갱신, 양쪽 재등록

---

## 4. 트러블슈팅

### 4-1. `git pull` 했는데 훅이 안 돈다

원인: `core.hooksPath`가 설정 안 됐음.

```bash
# 확인
git config --get core.hooksPath
# 출력이 .githooks가 아니면:
node scripts/bootstrap.mjs --apply
```

### 4-2. 훅이 돌긴 하는데 `~/.claude/hooks/` 가 갱신 안 됨

원인: `sync-user-scope.mjs` 내부 실패 (경로·권한).

```bash
# 수동 재실행 + 로그 확인
node scripts/sync-user-scope.mjs
```

Windows 한글 경로(`d:\프로젝트\working`)에서 간혹 `cpSync` 실패가 보고됨. 그 경우 루트를 영문 경로로 옮기는 것이 가장 확실.

### 4-3. `bootstrap.mjs --apply` 가 `claude` CLI 못 찾음

PATH 반영 전. 새 터미널 세션을 열고 재실행.

```bash
# 새 Git Bash에서
echo $PATH | tr ':' '\n' | grep -i npm
# AppData/Roaming/npm 이 있는지 확인
```

### 4-4. 전체 리셋 (최후의 수단)

```bash
# ~/.claude/hooks·skills 모두 날리고 재구성
rm -rf ~/.claude/hooks ~/.claude/skills
node scripts/bootstrap.mjs --apply
```

`~/.claude.json`(토큰 저장소)은 건드리지 않음. MCP 재등록 불필요.

---

## 5. 자주 하는 실수

1. **`git pull` 후 `install-hooks.mjs`를 추가로 돌린다** — 필요 없음. post-merge가 이미 `sync-user-scope.mjs`로 처리. 이중 실행은 백업 파일만 쌓이게 함
2. **회사 이메일로 커밋** — `git config --local user.email`을 까먹으면 global 회사 이메일이 붙음. PR 올린 뒤 발견하면 `git rebase`로 저자 수정 필요
3. **Codespace 여러 개 동시 오픈** — 월 compute 한도 급속 소진 ([CLAUDE.md §2-7](../../CLAUDE.md))
4. **Notion token을 `.env`에 넣는다** — `~/.claude.json` 이 저장소고, `.env`는 Claude Code가 읽지 않는다. `claude mcp add` 가 정식 경로

---

## 6. 관련 파일 색인

| 경로 | 역할 |
|---|---|
| [scripts/bootstrap.mjs](../../scripts/bootstrap.mjs) | 첫 방문 전체 셋업 (idempotent) |
| [scripts/sync-user-scope.mjs](../../scripts/sync-user-scope.mjs) | repo → `~/.claude/` 동기화 코어 |
| [scripts/install-hooks.mjs](../../scripts/install-hooks.mjs) | 훅만 빠르게 재배치 (대안 진입점) |
| [.githooks/post-merge](../../.githooks/post-merge) | pull 후 자동 sync |
| [.githooks/post-checkout](../../.githooks/post-checkout) | 브랜치 전환 후 조건부 sync |
| [docs/current/setup.md](setup.md) | 회사 PC 기준 최초 셋업 (이 문서의 선행) |
