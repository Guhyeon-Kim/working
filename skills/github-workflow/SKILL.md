---
name: github-workflow
description: GitHub MCP(공식 Copilot Remote)의 40+ 도구로 PR·issue·repo 관리. commit은 commit-commands 플러그인이 담당, 이후 흐름을 커버한다.
---

# GitHub Workflow — 공식 GitHub MCP

## 역할 분담

| 단계 | 도구 |
|-----|------|
| 코드 수정 → 커밋 | Edit/Write + `commit-commands` 플러그인 (`/commit`, `/commit-push-pr`) |
| **브랜치/PR/이슈/리뷰/검색** | **GitHub MCP (이 스킬)** |
| PR 리뷰 | `pr-review-toolkit` 플러그인 (review-pr) |

## 주요 도구 맵 (40+개 중 자주 쓰는 것)

### 📂 저장소·파일
- `get_file_contents(owner, repo, path, ref?)` — 파일 내용 가져오기
- `create_or_update_file` / `push_files` / `delete_file`
- `list_branches`, `create_branch(from)`, `list_commits`, `get_commit`

### 🔀 PR
- `list_pull_requests(owner, repo, state, head?, base?)`
- `create_pull_request(owner, repo, title, head, base, body, draft?)`
- `pull_request_read(pull_number)` — PR 메타·diff·conversation
- `pull_request_review_write(event: "APPROVE"|"REQUEST_CHANGES"|"COMMENT", body)`
- `add_comment_to_pending_review`, `add_reply_to_pull_request_comment`
- `update_pull_request`, `update_pull_request_branch`, `merge_pull_request(merge_method)`
- `request_copilot_review(pull_number)` — Copilot 자동 리뷰 트리거

### 🐛 이슈
- `list_issues(state, labels?, assignee?)`, `search_issues(q)`, `issue_read(number)`
- `issue_write({action: "create"|"update"|"close", ...})`
- `add_issue_comment`, `sub_issue_write` — sub-issue 관리

### 🔍 검색
- `search_code(q)`, `search_repositories(q)`, `search_users(q)`, `search_pull_requests(q)`
- `run_secret_scanning(owner, repo)` — secret 유출 스캔

### 🏷️ 릴리즈·태그·라벨
- `list_releases`, `get_latest_release`, `get_release_by_tag`
- `list_tags`, `get_tag`, `get_label`, `list_issue_types`

### 👥 조직·팀
- `get_me()` — 현재 인증된 사용자 정보
- `get_teams`, `get_team_members`

## 표준 워크플로

### ① Feature → PR → Review → Merge
```
1. create_branch(from: "main", name: "feature/xyz")
2. (로컬에서 작업, commit-commands로 push)
3. create_pull_request(title, head: "feature/xyz", base: "main", body)
4. request_copilot_review(pull_number)        # 1차 AI 리뷰
5. pull_request_read(pull_number)             # 리뷰 의견 확인
6. (수정 반영 push)
7. pull_request_review_write(event: "APPROVE") # 사람 리뷰
8. merge_pull_request(merge_method: "squash")
```

### ② Bug Triage
```
1. search_issues("is:open label:bug")
2. issue_read(number) → 재현 정보 수집
3. create_branch("fix/issue-N")
4. (수정 후 PR 생성)
5. issue_write({action:"update", body:"Fixed in #PR_NUMBER"})
6. merge 후 issue_write({action:"close"})
```

### ③ 보안 감사
```
1. run_secret_scanning(owner, repo) → 노출된 secret 확인
2. search_code("AKIA") / ("ghp_") 등 → 추가 스캔
3. 발견 시 → 즉시 해당 secret revoke + 커밋 히스토리에서 제거(git filter-repo)
```

## 금지 사항

- ❌ `main`/`master` 브랜치에 직접 push (보호 브랜치 원칙)
- ❌ PR 없이 force push
- ❌ PAT/secret을 commit body·PR description에 노출
- ❌ 대용량 binary를 create_or_update_file로 (git-lfs 권장)
- ❌ 보호된 브랜치 삭제 시도

## PR 본문 표준 템플릿

```markdown
## 변경 개요
- (핵심 변경 1~3줄)

## 변경 이유
(왜 이 변경이 필요한가, Linear/이슈 번호 연결)

## 테스트
- [ ] 단위 테스트 통과
- [ ] E2E (qa-test 스킬 기반) 통과
- [ ] 접근성 회귀 확인

## 롤백 계획
- (이 PR이 문제 시 되돌리는 방법)
```

## 인증 모델

- **공식 Remote MCP**: `https://api.githubcopilot.com/mcp/` + Bearer PAT(fine-grained)
- **PAT 저장**: `~/.claude.json`의 github 서버 headers에 직접 저장
- **Codespace Secrets** (권장):
  - `GH_MCP_TOKEN` — 실제 토큰 값
  - `GH_MCP_TOKEN_EXPIRES` — 만료일 ISO 형식 (예: `2027-04-13`). 만료일은 GitHub API 헤더로 감지 불가능하므로 사용자가 직접 등록해야 `cli-health-check.mjs`가 daysLeft 계산 + 30일 이내 경고 발송
- **갱신**: PAT 만료 임박 시 `cli-health-check.mjs`가 세션 시작 경고 → Codespace Secret 두 개 모두 갱신 후 `claude mcp remove github -s user && claude mcp add github https://api.githubcopilot.com/mcp/ --scope user --transport http --header "Authorization: Bearer $GH_MCP_TOKEN"` 재실행
