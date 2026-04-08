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

# === 4. settings.json 경로 변환 ===
CLAUDE_HOME="$HOME/.claude"
sed "s|C:/Users/김구현/.claude|${CLAUDE_HOME}|g; s|C:\\\\\\\\Users\\\\\\\\김구현\\\\\\\\.claude|${CLAUDE_HOME}|g; s|C:\\\\Users\\\\김구현\\\\.claude|${CLAUDE_HOME}|g" \
  ~/.claude-config/settings.json > ~/.claude/settings.json

# === 5. 플러그인 설치 (환경별 캐시 자동 생성) ===
claude plugin marketplace add openai-codex --source github --repo openai/codex-plugin-cc 2>/dev/null || true

for plugin in hookify security-guidance pr-review-toolkit code-review commit-commands code-simplifier feature-dev telegram; do
  claude plugin install "${plugin}@claude-plugins-official" 2>/dev/null || true
done

claude plugin install "codex@openai-codex" 2>/dev/null || true

echo "=== Claude Code 환경 설정 완료 ==="
