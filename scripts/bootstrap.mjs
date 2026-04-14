#!/usr/bin/env node
/**
 * bootstrap.mjs — 새 머신에서 working repo 첫 진입 시 전체 셋업 자동화
 *
 * 목적: Windows 집 PC / 새 Codespace / 새 macOS 등에서 working repo를 열면
 *       Claude가 이 스크립트를 실행해 하네스 + 플러그인 + 의존성을 한 방에 복구.
 *
 * 실행:
 *   감지만:      node scripts/bootstrap.mjs
 *   전체 셋업:   node scripts/bootstrap.mjs --apply
 *
 * 절차:
 *   1. 환경 점검 (claude CLI, node, python, pip, git)
 *   2. ~/.claude-config(dotfiles) 존재 확인 → 없으면 clone, 있으면 pull
 *   3. sync-user-scope.mjs 실행 (훅·스킬·settings.json 동기화)
 *   4. setup-plugins.mjs --apply 실행 (플러그인 3개 + Python 의존성)
 *   5. 결과 요약 출력
 *
 * 크로스 플랫폼:
 *   - os.homedir()로 홈 디렉토리 자동 판별
 *   - path.join()으로 OS별 separator 자동 처리
 *   - spawnSync shell:true (Windows cmd) 필요 시 fallback
 */

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';

const APPLY = process.argv.includes('--apply');
const PLATFORM = platform();
const IS_WIN = PLATFORM === 'win32';
const HOME = homedir();
const DOTFILES_URL = 'https://github.com/Guhyeon-Kim/dotfiles.git';
const DOTFILES_DIR = join(HOME, '.claude-config');
const CLAUDE_DIR = join(HOME, '.claude');

const log = (...args) => console.log('[bootstrap]', ...args);
const warn = (...args) => console.warn('[bootstrap][경고]', ...args);
const err = (...args) => console.error('[bootstrap][에러]', ...args);

// ─── 유틸 ───
function run(cmd, args, { capture = false, cwd } = {}) {
  const opts = {
    encoding: 'utf8',
    shell: IS_WIN,
    ...(cwd ? { cwd } : {}),
    ...(capture ? {} : { stdio: 'inherit' }),
  };
  const res = spawnSync(cmd, args, opts);
  return { status: res.status, stdout: res.stdout?.trim() };
}

function available(cmd, flag = '--version') {
  return run(cmd, [flag], { capture: true }).status === 0;
}

// ─── 1. 환경 점검 ───
log(`플랫폼: ${PLATFORM}${IS_WIN ? ' (WSL 권장)' : ''}`);
log(`모드: ${APPLY ? '실제 셋업 (--apply)' : '감지만 (미리보기)'}`);
log(`홈: ${HOME}`);

const checks = {
  claude: available('claude'),
  node: available('node'),
  git: available('git'),
  python: available('python3') || available('python'),
  pip: available('pip3') || available('pip'),
};
log('도구 가용성:', checks);

const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  err(`필수 도구 누락: ${missing.join(', ')}`);
  if (missing.includes('claude')) err('  → npm install -g @anthropic-ai/claude-code');
  if (missing.includes('python')) err('  → https://www.python.org/ (Windows: winget install Python.Python.3.12)');
  if (missing.includes('node')) err('  → https://nodejs.org/ (또는 nvm/fnm 권장)');
  process.exit(1);
}

// ─── 2. 상태 진단 ───
const state = {
  dotfilesExists: existsSync(DOTFILES_DIR),
  claudeDirExists: existsSync(CLAUDE_DIR),
  hooksExists: existsSync(join(CLAUDE_DIR, 'hooks')),
  skillsExists: existsSync(join(CLAUDE_DIR, 'skills')),
  settingsExists: existsSync(join(CLAUDE_DIR, 'settings.json')),
};

let gptakuInstalled = false;
if (checks.claude) {
  const pl = run('claude', ['plugin', 'list'], { capture: true });
  gptakuInstalled = pl.stdout?.includes('gptaku-plugins') ?? false;
}
state.gptakuInstalled = gptakuInstalled;

log('현재 상태:', state);

const needsDotfiles = !state.dotfilesExists;
const needsSync = !state.hooksExists || !state.skillsExists || !state.settingsExists;
const needsPlugins = !gptakuInstalled;
const clean = !needsDotfiles && !needsSync && !needsPlugins;

if (clean) {
  log('모든 항목 정상. 추가 작업 불필요.');
  process.exit(0);
}

log('필요 작업:');
if (needsDotfiles) log('  • dotfiles 레포 clone');
if (needsSync) log('  • user-scope 동기화 (훅·스킬·settings.json)');
if (needsPlugins) log('  • gptaku 플러그인 3개 + Python 의존성 설치');

if (!APPLY) {
  log('');
  log('실제 셋업하려면: node scripts/bootstrap.mjs --apply');
  process.exit(0);
}

// ─── 3. dotfiles clone/pull ───
if (needsDotfiles) {
  log(`dotfiles clone: ${DOTFILES_URL} → ${DOTFILES_DIR}`);
  mkdirSync(HOME, { recursive: true });
  const r = run('git', ['clone', DOTFILES_URL, DOTFILES_DIR]);
  if (r.status !== 0) {
    err('dotfiles clone 실패');
    process.exit(1);
  }
} else {
  log('dotfiles pull (최신 동기화)');
  run('git', ['pull', '--quiet'], { cwd: DOTFILES_DIR });
}

// ─── 4. sync-user-scope 실행 ───
const syncScript = join(DOTFILES_DIR, 'scripts', 'sync-user-scope.mjs');
if (existsSync(syncScript)) {
  log('user-scope 동기화 실행');
  const r = run('node', [syncScript]);
  if (r.status !== 0) warn('sync-user-scope 일부 실패 — 수동 확인 필요');
} else {
  warn(`sync-user-scope.mjs 없음 (${syncScript})`);
}

// ─── 5. setup-plugins 실행 ───
const pluginsScript = join(DOTFILES_DIR, 'scripts', 'setup-plugins.mjs');
if (existsSync(pluginsScript)) {
  log('플러그인·의존성 설치 (setup-plugins --apply)');
  const r = run('node', [pluginsScript, '--apply']);
  if (r.status !== 0) warn('setup-plugins 일부 실패 — 수동 확인 필요');
} else {
  warn(`setup-plugins.mjs 없음 (${pluginsScript})`);
}

// ─── 6. 마무리 ───
log('');
log('✔ 셋업 완료. Claude Code를 재시작하면 모든 기능이 활성화됩니다.');
if (IS_WIN) {
  log('Windows: Claude Code 자체는 WSL2 실행 권장 (공식 안내).');
}
