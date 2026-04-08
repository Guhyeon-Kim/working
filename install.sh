#!/bin/bash

# === 1. CLI 도구 설치 ===
npm i -g @anthropic-ai/claude-code
npm i -g @google/gemini-cli
npm i -g @openai/codex

# === 2. 공유 설정 동기화 ===
if [ -d ~/.claude-config ]; then
  cd ~/.claude-config && git pull
else
  git clone https://github.com/Guhyeon-Kim/dotfiles.git ~/.claude-config
fi

# === 3. 디렉토리 링크 (plugins 제외 — 플러그인은 환경별로 직접 설치) ===
mkdir -p ~/.claude

link_dir() {
  local target="$1" link="$2"
  # 기존 디렉토리/링크 제거
  if [ -d "$link" ] || [ -L "$link" ]; then
    rm -rf "$link" 2>/dev/null
  fi
  # OS별 링크 생성
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OS" == "Windows_NT" ]]; then
    # Windows: junction (관리자 권한 불필요)
    local win_target win_link
    win_target=$(cygpath -w "$target" 2>/dev/null || echo "$target")
    win_link=$(cygpath -w "$link" 2>/dev/null || echo "$link")
    cmd //c "mklink /J \"${win_link}\" \"${win_target}\"" > /dev/null 2>&1 \
      || powershell -Command "New-Item -ItemType Junction -Path '${win_link}' -Target '${win_target}'" > /dev/null 2>&1
  else
    # Linux/macOS: symlink
    ln -sf "$target" "$link"
  fi
}

link_dir ~/.claude-config/agents ~/.claude/agents
link_dir ~/.claude-config/skills ~/.claude/skills
link_dir ~/.claude-config/hooks ~/.claude/hooks
link_dir ~/.claude-config/scripts ~/.claude/scripts

# === 4. settings.json 경로 변환 (플레이스홀더 치환) ===
# settings.json 내 플레이스홀더:
#   __HOME__     → OS 네이티브 홈 경로 (C:\Users\xxx 또는 /home/xxx)
#   __HOME_POSIX__ → POSIX 스타일 홈 경로 (//c/Users/xxx 또는 /home/xxx)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OS" == "Windows_NT" ]]; then
  WIN_HOME=$(cygpath -w "$HOME" 2>/dev/null || echo "$HOME")
  POSIX_HOME=$(cygpath -u "$HOME" 2>/dev/null || echo "$HOME")
  # //c/Users/xxx 형식으로 변환
  POSIX_HOME_DOUBLE="/$(echo "$POSIX_HOME" | sed 's|^/||')"
  sed "s|__HOME__|${WIN_HOME//\\/\/}|g; s|__HOME_POSIX__|${POSIX_HOME_DOUBLE}|g" \
    ~/.claude-config/settings.json > ~/.claude/settings.json
  # Windows 백슬래시 경로도 처리 (additionalDirectories 등)
  sed -i "s|__HOME__\\\\\\\\|${WIN_HOME//\\/\\\\}\\\\|g" ~/.claude/settings.json 2>/dev/null || true
else
  sed "s|__HOME__|${HOME}|g; s|__HOME_POSIX__|${HOME}|g" \
    ~/.claude-config/settings.json > ~/.claude/settings.json
fi

# === 5. GitHub Private Repo 접근 설정 ===
# Codespaces Secret GH_PAT가 있으면 자동으로 git + gh 설정
if [ -n "$GH_PAT" ]; then
  # git: URL rewrite로 Codespaces 기본 credential helper 우회
  git config --global url."https://Guhyeon-Kim:${GH_PAT}@github.com/".insteadOf "https://github.com/"

  # gh CLI: GITHUB_TOKEN 환경변수를 우회하는 래퍼 스크립트
  mkdir -p ~/bin
  cat > ~/bin/gha << GHASCRIPT
#!/bin/bash
GITHUB_TOKEN=${GH_PAT} gh "\$@"
GHASCRIPT
  chmod +x ~/bin/gha
  grep -q 'HOME/bin' ~/.bashrc 2>/dev/null || echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc

  echo "[설정 완료] git + gha: private repo 접근 가능"
else
  echo "[스킵] GH_PAT 환경변수 없음 — private repo 접근 불가"
  echo "  설정: https://github.com/settings/codespaces → Secrets → GH_PAT 추가"
fi

# === 6. 플러그인 설치 (환경별 캐시 자동 생성) ===
claude plugin marketplace add openai-codex --source github --repo openai/codex-plugin-cc 2>/dev/null || true

for plugin in hookify security-guidance pr-review-toolkit code-review commit-commands code-simplifier feature-dev telegram; do
  claude plugin install "${plugin}@claude-plugins-official" 2>/dev/null || true
done

claude plugin install "codex@openai-codex" 2>/dev/null || true

echo "=== Claude Code 환경 설정 완료 ==="
