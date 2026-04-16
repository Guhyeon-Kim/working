#!/bin/bash
# Claude Code 환경 초기 셋업 (신규 머신용)
# - 이 스크립트는 CLI 설치 + bootstrap 호출만 담당
# - 실제 훅·스킬·settings.json 배포는 scripts/bootstrap.mjs + sync-user-scope.mjs가 수행

set -e

# 1. CLI 도구 설치
npm i -g @anthropic-ai/claude-code
npm i -g @google/gemini-cli
npm i -g @openai/codex

# 2. dotfiles 최신화
if [ -d ~/.claude-config ]; then
  cd ~/.claude-config && git pull
else
  git clone https://github.com/Guhyeon-Kim/dotfiles.git ~/.claude-config
fi

# 3. 하네스 셋업 (훅·스킬 user-scope 배포 + 플러그인 설치)
node ~/.claude-config/scripts/bootstrap.mjs --apply

echo "=== Claude Code 환경 설정 완료 ==="
echo "이후 working repo를 clone해 실제 작업을 시작하세요:"
echo "  git clone https://github.com/Guhyeon-Kim/working.git"
