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
import { existsSync, mkdirSync, readdirSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform } from 'os';
import { fileURLToPath } from 'url';

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
// Windows는 `shell:true` 대신 `cmd.exe /d /s /c` 래핑으로 호출 — DEP0190 경고 회피 +
// shell 모드에서 인자 이스케이프 안 되는 인젝션 위험 회피.
function run(cmd, args, { capture = false, cwd } = {}) {
  const opts = {
    encoding: 'utf8',
    ...(cwd ? { cwd } : {}),
    ...(capture ? {} : { stdio: 'inherit' }),
  };
  const spawnCmd = IS_WIN ? 'cmd.exe' : cmd;
  const spawnArgs = IS_WIN ? ['/d', '/s', '/c', cmd, ...args] : args;
  const res = spawnSync(spawnCmd, spawnArgs, opts);
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
  python: available('python3') || available('python') || available('py'),
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
// "디렉토리 존재"만 체크하면 공동화된(빈) 디렉토리를 정상으로 오판한다.
// 파일 개수까지 봐야 과거 sync 중단·삭제로 훅이 사라진 상태를 감지.
function isHealthyDir(dir) {
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

const state = {
  dotfilesExists: existsSync(DOTFILES_DIR),
  claudeDirExists: existsSync(CLAUDE_DIR),
  hooksHealthy: isHealthyDir(join(CLAUDE_DIR, 'hooks')),
  skillsHealthy: isHealthyDir(join(CLAUDE_DIR, 'skills')),
  settingsExists: existsSync(join(CLAUDE_DIR, 'settings.json')),
};

let gptakuInstalled = false;
if (checks.claude) {
  const pl = run('claude', ['plugin', 'list'], { capture: true });
  gptakuInstalled = pl.stdout?.includes('gptaku-plugins') ?? false;
}
state.gptakuInstalled = gptakuInstalled;

log('현재 상태:', state);

// git hooks가 활성화돼 있는지도 확인 (working repo 기준)
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKING_REPO = dirname(SCRIPT_DIR);
const hooksPathOk = existsSync(join(WORKING_REPO, '.git'))
  && run('git', ['config', '--get', 'core.hooksPath'], { capture: true, cwd: WORKING_REPO }).stdout?.trim() === '.githooks';

const needsDotfiles = !state.dotfilesExists;
const needsSync = !state.hooksHealthy || !state.skillsHealthy || !state.settingsExists;
const needsPlugins = !gptakuInstalled;
const needsGitHooks = existsSync(join(WORKING_REPO, '.githooks')) && !hooksPathOk;
const clean = !needsDotfiles && !needsSync && !needsPlugins && !needsGitHooks;

if (clean) {
  log('모든 항목 정상. 추가 작업 불필요.');
  process.exit(0);
}

log('필요 작업:');
if (needsDotfiles) log('  • dotfiles 레포 clone');
if (needsSync) log('  • user-scope 동기화 (훅·스킬·settings.json)');
if (needsPlugins) log('  • gptaku 플러그인 3개 + Python 의존성 설치');
if (needsGitHooks) log('  • git hooks 활성화 (git pull 후 자동 sync)');

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

// ─── 6. Git hooks 설치 (git pull 후 자동 sync) ───
// 사용자가 Windows/Codespace에서 `git pull` 하면 post-merge 훅이 자동으로
// sync-user-scope를 호출해 user-scope를 최신 상태로 유지한다.
function setupGitHooks(repoDir) {
  const githooks = join(repoDir, '.githooks');
  if (!existsSync(githooks)) return false;

  // core.hooksPath 설정 (이미 올바르면 skip)
  const curr = run('git', ['config', '--get', 'core.hooksPath'], { capture: true, cwd: repoDir });
  if (curr.stdout?.trim() !== '.githooks') {
    const r = run('git', ['config', 'core.hooksPath', '.githooks'], { cwd: repoDir });
    if (r.status === 0) log(`${repoDir}: core.hooksPath = .githooks 설정`);
    else warn(`${repoDir}: core.hooksPath 설정 실패`);
  }

  // 실행 권한 부여 (Linux/macOS). Windows Git Bash는 실행 비트 없어도 hook 실행.
  if (!IS_WIN) {
    for (const name of ['post-merge', 'post-checkout']) {
      const p = join(githooks, name);
      if (existsSync(p)) {
        try { chmodSync(p, 0o755); } catch (e) { warn(`chmod 실패: ${p} (${e.message})`); }
      }
    }
  }
  return true;
}

if (APPLY) {
  if (setupGitHooks(WORKING_REPO)) log('working repo git hooks 활성화');
  if (existsSync(DOTFILES_DIR) && setupGitHooks(DOTFILES_DIR)) log('dotfiles git hooks 활성화');
}

// ─── 7. 마무리 ───
log('');
log('✔ 셋업 완료. Claude Code를 재시작하면 모든 기능이 활성화됩니다.');
log('ℹ 이후 `git pull` 시 user-scope 자동 동기화됩니다.');
if (IS_WIN) {
  log('Windows: Claude Code 자체는 WSL2 실행 권장 (공식 안내).');
}
