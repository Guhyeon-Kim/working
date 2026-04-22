# 신규 환경 셋업 가이드

**버전**: v6.0 기준
**최종 업데이트**: 2026-04-22

새 머신(회사 PC, 집 PC, GitHub Codespaces)에서 Working Hub를 처음 셋업할 때의 단계별 가이드.

---

## 0. 환경 판단

사용자의 실행 환경 3종:

| 환경 | OS | 권장 경로 |
|---|---|---|
| 회사 PC (최초 셋업) | Windows | **수동 경로** — 이 문서 §2~§6 |
| 집 PC (두 번째 환경) | Windows | **`bootstrap.mjs` 경로** — [home-pc-sync.md](home-pc-sync.md) |
| GitHub Codespaces | Linux | **자동 경로** — 루트 `README.md`의 install.sh 한 줄 |

즉 **로컬 PC 2대는 모두 Windows**, 회사 PC는 이 문서를 따라 수동으로 한 번 조립하고, 집 PC(및 이후 모든 두 번째 환경)는 [home-pc-sync.md](home-pc-sync.md) 의 `bootstrap.mjs --apply` 한 줄로 회사 PC 상태를 재현한다. Codespaces만 Linux 자동 플로우. Windows에서 `bash <(curl ...)`는 지원하지 않는다.

---

## 1. 자동 경로 (Codespaces 전용)

```bash
bash <(curl -sL https://raw.githubusercontent.com/Guhyeon-Kim/dotfiles/main/install.sh)
```

Codespaces Linux에서만 검증됨. 이후 §5(Notion MCP)와 §6(훅 활성화)은 수동으로 한 번 더 확인할 것. install.sh가 모든 인증/토큰 단계를 자동화하지는 않는다.

---

## 2. 전제 조건 확인

필요 도구:

| 도구 | 확인 명령 | 최소 버전 |
|---|---|---|
| Node.js | `node --version` | v20+ (권장 v22+) |
| git | `git --version` | 2.40+ |
| npm | `npm --version` | 10+ |

Windows에선 [Git for Windows](https://git-scm.com/download/win) + [Node.js LTS](https://nodejs.org/en/download/) 설치로 해결.

---

## 3. CLI 3종 설치

모두 npm 전역 설치.

```bash
npm install -g @anthropic-ai/claude-code
npm install -g @google/gemini-cli
npm install -g @openai/codex
```

설치 확인:

```bash
claude --version       # 2.1.x (Claude Code)
gemini --version       # 0.38.x
codex --version        # codex-cli 0.122.x
```

PATH에 `~/AppData/Roaming/npm` (Windows) 또는 `~/.npm-global/bin` (Linux/macOS)이 잡혀야 한다. 새 터미널을 열어 PATH 반영 확인.

---

## 4. 레포 clone + git 설정

```bash
# 작업 디렉토리로 이동 후
git clone https://github.com/Guhyeon-Kim/working.git
cd working

# 개인 계정 식별 (회사 이메일이 global에 있어도 이 레포는 개인용)
git config user.email "hako6632@gmail.com"
git config user.name "Guhyeonkim"

# 확인
git config --local user.email  # → hako6632@gmail.com
```

**주의**: `~/.claude/settings.local.json`·`~/.claude/settings.json`은 이미 `.gitignore`에 포함돼 있다. 로컬 권한 설정이 실수로 커밋되지 않는다.

---

## 5. Notion MCP (user-scope) 설정

### 5-1. Integration 토큰 획득

1. https://www.notion.so/profile/integrations 접속
2. 기존 "Claude Code (Working Hub)" integration이 있으면 재사용, 없으면 `New integration` 클릭해서 생성
3. `Configuration` 탭 → `Internal Integration Secret` → `Show` → `ntn_...` 복사

### 5-2. Notion DB에 integration 연결

필요한 DB 2개에 `Connections`으로 추가:

- 💻 개발 노트: `cbb9883990a344d0a70b832b6d02c104`
- 🔑 서비스/환경변수: `df78cece-2c1a-43b8-bde6-435ab74e14db`

(기존 integration을 재사용하는 경우 이미 연결돼 있을 수 있음. `•••` → `Connections`에서 확인.)

### 5-3. Claude Code에 MCP 서버 등록

```bash
claude mcp add notion --scope user \
  --env 'OPENAPI_MCP_HEADERS={"Authorization": "Bearer ntn_YOUR_TOKEN", "Notion-Version": "2022-06-28"}' \
  -- npx -y @notionhq/notion-mcp-server
```

`ntn_YOUR_TOKEN` 부분만 §5-1에서 복사한 값으로 치환.

확인:

```bash
claude mcp list
# notion: npx -y @notionhq/notion-mcp-server - ✓ Connected
```

**보안 메모**: 토큰은 `~/.claude.json`에 평문 저장된다. 이 파일은 git 추적 밖(home). 공유 금지.

### 5-4. Claude.ai 커넥터 (선택)

Notion/Figma/Supabase/Vercel/Make/Gmail/Google Calendar는 claude.ai에서 OAuth 커넥터로 연결해두면 Claude Code 세션에도 자동 로드된다. 이번 세션에선 user-scope Notion MCP와 커넥터 Notion이 둘 다 존재한다 — 둘 다 동작, 중복 OK.

---

## 6. 훅 활성화

repo 루트에서:

```bash
# 1. 미리보기 (쓰기 없음)
node scripts/install-hooks.mjs --dry-run

# 2. 실제 설치
node scripts/install-hooks.mjs
```

`install-hooks.mjs`가 수행하는 것:
- `<repo>/settings.json` 템플릿의 `hooks` 필드를 `~/.claude/settings.json`에 **머지** (기존 `mcpServers`·`permissions` 보존)
- `<repo>/hooks/*.mjs` 10개를 `~/.claude/hooks/`에 복사
- `<repo>/scripts/post-push-hook.mjs` 1개를 `~/.claude/scripts/`에 복사
- 기존 `~/.claude/settings.json`이 있으면 `.backup-<timestamp>`로 백업

확인:

```bash
ls ~/.claude/hooks/     # 10개 .mjs
ls ~/.claude/scripts/   # post-push-hook.mjs
```

**다음 세션부터** 훅이 자동 발동한다. 현재 세션엔 반영되지 않는다.

---

## 7. delegate.mjs 동작 검증

repo 루트에서:

```bash
# 라우팅 경로만 검증 (실제 CLI 호출 없음)
DELEGATE_DRY_RUN=1 node scripts/delegate.mjs builder "test"

# 실제 호출 (codex 필요)
node scripts/delegate.mjs builder "Reply with just: OK"
```

정상 출력: `[delegate] 완료. (cli=codex)` 또는 codex 실패 시 `FALLBACK → claude` 후 응답.

---

## 8. 검증 체크리스트

신규 환경 셋업 완료 판단 기준:

- [ ] `claude --version` 정상 출력
- [ ] `gemini --version` 정상 출력
- [ ] `codex --version` 정상 출력
- [ ] `git config --local user.email` = `hako6632@gmail.com` (해당 레포 내)
- [ ] `claude mcp list`에 `notion` 포함, `✓ Connected`
- [ ] `ls ~/.claude/hooks/*.mjs | wc -l` = 10
- [ ] `DELEGATE_DRY_RUN=1 node scripts/delegate.mjs builder "test"` exit 0
- [ ] 새 세션 시작 시 SessionStart 훅 로그 확인 (drift-check, memory 로딩)

---

## 9. 자주 만나는 문제

### 9-1. Windows `claude` 명령이 먹히지 않음
새 터미널을 열어 PATH 반영 확인. Git Bash에서는 `C:\Users\<me>\AppData\Roaming\npm`이 PATH에 있는지 `echo $PATH` 확인.

### 9-2. `claude mcp list`에서 `notion - Needs authentication`
토큰 만료 또는 잘못 복사. §5-3을 다시 실행해 덮어쓰기.

### 9-3. Codespaces에서 훅이 느림
`~/.claude/hooks/` 훅이 SessionStart에서 drift-check를 매번 돌린다. Codespaces에선 mtime 비교가 NFS latency로 느릴 수 있음. Phase 2에서 throttle 검토 예정.

### 9-4. 토큰 노출이 걱정될 때
`~/.claude.json` 권한을 600으로 (Linux/macOS). Windows는 NTFS ACL로 소유자 전용. 노출 의심 시 Notion integration 페이지에서 `Rotate secret` → §5-3 재실행.

---

## 10. 부록: 환경별 차이

- **회사 PC / 집 PC (둘 다 Windows)**: Git Bash + npm global prefix = `%APPDATA%\npm`. `claude`·`codex`·`gemini` binary 모두 여기에 설치됨. PATH에 이 경로가 포함돼야 함.
- **Codespaces (Linux)**: install.sh 자동 경로 유효. compute 한도 주의 (CLAUDE.md §2-7 참조). idle 5분·동시 1개 원칙.
- **Figma / Playwright MCP**: 이 셋업 가이드 외 추가 단계 필요. 해당 프로젝트 합류 시 별도 참조.

---

## 11. 두 번째 환경(집 PC 등)에서 읽을 것

이 문서는 **첫 셋업** 기준이다. 회사 PC에서 이미 조립한 상태를 집 PC에 재현하는 단축 경로는 [home-pc-sync.md](home-pc-sync.md) 를 따른다. 핵심:

- `node scripts/bootstrap.mjs --apply` 한 줄로 dotfiles clone·user-scope sync·플러그인·`core.hooksPath` 설정까지 1회성 완결
- 이후 `git pull` 은 [.githooks/post-merge](../../.githooks/post-merge) 가 자동으로 `sync-user-scope.mjs` 를 돌려 `~/.claude/` 를 동기화. **실행 후 어떤 sentinel·pending 파일도 남기지 않는다** (execute-then-done)
- Notion 토큰, `git config --local user.email`, Codespaces 병행 주의 등 **집 PC 고유 체크리스트**는 해당 문서 §3
