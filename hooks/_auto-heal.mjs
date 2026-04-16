#!/usr/bin/env node
/**
 * _auto-heal.mjs — SessionStart 최상단 방어선
 *
 * 역할: ~/.claude/hooks/가 비거나 훼손된 상태를 감지하면 bootstrap을 자동 실행해 복구.
 *       "자기 감지 불가" 구조 문제(훅이 없으면 훅이 경보를 못 냄)를 깨는 최초 probe.
 *
 * 동작:
 *   1. ~/.claude/hooks/*.mjs 파일 수 체크
 *   2. 임계(MIN_HOOKS) 미만이면 ~/.claude-config/scripts/bootstrap.mjs --apply 실행
 *   3. dotfiles도 없으면 수동 복구 커맨드 안내
 *
 * 불변:
 *   - 세션을 차단하지 않는다. 어떤 경우에도 exit 0.
 *   - stderr로만 로그 (stdout에 쓰면 Claude가 혼동할 수 있음)
 *   - 정상 상태면 완전히 조용히 종료 (체감 지연 <10ms)
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import { spawnSync } from 'child_process';

const HOME = homedir();
const HOOKS_DIR = join(HOME, '.claude', 'hooks');
const DOTFILES = join(HOME, '.claude-config');
const BOOTSTRAP = join(DOTFILES, 'scripts', 'bootstrap.mjs');
const IS_WIN = platform() === 'win32';

const MIN_HOOKS = 5;

function countHooks(dir) {
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter(f => f.endsWith('.mjs')).length;
  } catch {
    return 0;
  }
}

const count = countHooks(HOOKS_DIR);

if (count >= MIN_HOOKS) {
  process.exit(0);
}

console.error(`[auto-heal] ~/.claude/hooks/ 훅 ${count}개 감지 (임계 ${MIN_HOOKS} 미만). 자동 복구 시작.`);

if (!existsSync(BOOTSTRAP)) {
  console.error('[auto-heal] dotfiles 미설치. 수동 복구:');
  console.error('  git clone https://github.com/Guhyeon-Kim/dotfiles.git ~/.claude-config');
  console.error('  node ~/.claude-config/scripts/bootstrap.mjs --apply');
  process.exit(0);
}

const res = spawnSync('node', [BOOTSTRAP, '--apply'], {
  stdio: 'inherit',
  shell: IS_WIN,
  timeout: 120_000,
});

if (res.status === 0) {
  console.error('[auto-heal] 복구 완료. Claude Code 재시작 후 전체 훅 활성화.');
} else {
  console.error('[auto-heal] bootstrap 실패 (exit=' + res.status + '). 수동 확인 필요.');
}

process.exit(0);
