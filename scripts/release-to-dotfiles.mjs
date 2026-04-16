#!/usr/bin/env node
/**
 * release-to-dotfiles.mjs — working repo의 안정화된 하네스를 dotfiles repo로 릴리즈.
 *
 * 역할:
 *   - working = 살아있는 개발·전파 hub. 기존 머신은 `git pull`의 post-merge 훅으로 자동 sync.
 *   - dotfiles = 신규 머신·프로젝트 초기 셋업 템플릿. working 안정화 시에만 릴리즈 푸시.
 *
 * 동작:
 *   1. dotfiles repo 존재·clean 확인 (uncommitted 있으면 abort, --force-reset 있으면 reset --hard)
 *   2. MANIFEST에 정의된 파일/폴더를 working → dotfiles로 atomic 복사
 *   3. --commit 있으면 커밋 / --push 있으면 커밋+푸시
 *
 * 실행:
 *   미리보기:   node scripts/release-to-dotfiles.mjs
 *   커밋:       node scripts/release-to-dotfiles.mjs --commit
 *   커밋+푸시:  node scripts/release-to-dotfiles.mjs --push
 *   로컬 리셋:  node scripts/release-to-dotfiles.mjs --push --force-reset
 */

import { existsSync, readdirSync, statSync, rmSync, cpSync, mkdirSync, renameSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { spawnSync } from 'child_process';
import { homedir, platform } from 'os';
import { fileURLToPath } from 'url';

const IS_WIN = platform() === 'win32';
const args = process.argv.slice(2);
const COMMIT = args.includes('--commit') || args.includes('--push');
const PUSH = args.includes('--push');
const FORCE_RESET = args.includes('--force-reset');

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKING = dirname(SCRIPT_DIR);
const DOTFILES = join(homedir(), '.claude-config');

const log = (...a) => console.log('[release]', ...a);
const warn = (...a) => console.warn('[release][경고]', ...a);
const err = (...a) => console.error('[release][에러]', ...a);

// MANIFEST: working → dotfiles로 릴리즈할 대상.
// dotfiles는 "신규 셋업용 최소 템플릿"이므로 agents/, .claude/, docs/, .githooks/ 등은 제외.
const MANIFEST = [
  { src: 'hooks', dst: 'hooks', kind: 'dir' },
  { src: 'skills', dst: 'skills', kind: 'dir' },
  { src: 'scripts/bootstrap.mjs', dst: 'scripts/bootstrap.mjs', kind: 'file' },
  { src: 'scripts/sync-user-scope.mjs', dst: 'scripts/sync-user-scope.mjs', kind: 'file' },
  { src: 'scripts/sync-shared-agents.mjs', dst: 'scripts/sync-shared-agents.mjs', kind: 'file' },
  { src: 'scripts/setup-plugins.mjs', dst: 'scripts/setup-plugins.mjs', kind: 'file' },
  { src: 'scripts/delegate.mjs', dst: 'scripts/delegate.mjs', kind: 'file' },
  { src: 'scripts/cleanup-repo-hooks.mjs', dst: 'scripts/cleanup-repo-hooks.mjs', kind: 'file' },
  { src: 'settings.json', dst: 'settings.json', kind: 'file' },
];

// Windows는 `shell:true`에서 공백 있는 인자(예: -m "멀티워드 커밋 메시지")가
// 재분할되는 문제가 있어 `cmd.exe /d /s /c`로 명시 래핑한다.
function git(args, opts = {}) {
  const spawnCmd = IS_WIN ? 'cmd.exe' : 'git';
  const spawnArgs = IS_WIN ? ['/d', '/s', '/c', 'git', ...args] : args;
  return spawnSync(spawnCmd, spawnArgs, {
    cwd: opts.cwd || DOTFILES,
    encoding: 'utf8',
    stdio: opts.silent ? 'pipe' : 'inherit',
  });
}

function gitCapture(args, cwd = DOTFILES) {
  const spawnCmd = IS_WIN ? 'cmd.exe' : 'git';
  const spawnArgs = IS_WIN ? ['/d', '/s', '/c', 'git', ...args] : args;
  const r = spawnSync(spawnCmd, spawnArgs, { cwd, encoding: 'utf8' });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

// Windows+한글 경로에서 cpSync(recursive)가 `\\?\...release-TIMESTAMP` 임시 경로에
// EIO Access denied로 실패하는 케이스용 fallback. atomic 보장은 포기하되 제자리 덮어쓰기.
function copyDirInPlace(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const sPath = join(src, entry.name);
    const dPath = join(dst, entry.name);
    if (entry.isDirectory()) copyDirInPlace(sPath, dPath);
    else copyFileSync(sPath, dPath);
  }
}

function atomicCopyDir(src, dst) {
  const stamp = Date.now();
  const tmpDst = `${dst}.release-${stamp}`;
  const bakDst = `${dst}.bak-${stamp}`;
  mkdirSync(dirname(dst), { recursive: true });
  try {
    cpSync(src, tmpDst, { recursive: true, force: true, errorOnExist: false });
    const hadExisting = existsSync(dst);
    if (hadExisting) renameSync(dst, bakDst);
    try {
      renameSync(tmpDst, dst);
    } catch (e) {
      if (hadExisting && existsSync(bakDst)) renameSync(bakDst, dst);
      throw e;
    }
    if (hadExisting) rmSync(bakDst, { recursive: true, force: true });
  } catch (e) {
    if (existsSync(tmpDst)) {
      try { rmSync(tmpDst, { recursive: true, force: true }); } catch {}
    }
    warn(`atomic 복사 실패 (${e.message}) — 개별 파일 복사 fallback`);
    copyDirInPlace(src, dst);
  }
}

function atomicCopyFile(src, dst) {
  mkdirSync(dirname(dst), { recursive: true });
  const tmpDst = `${dst}.release-${Date.now()}`;
  copyFileSync(src, tmpDst);
  renameSync(tmpDst, dst);
}

// ─── 1. dotfiles 존재 확인 ───
if (!existsSync(DOTFILES)) {
  err(`dotfiles repo 없음: ${DOTFILES}`);
  err('먼저 `node scripts/bootstrap.mjs --apply`로 clone 필요.');
  process.exit(1);
}
if (!existsSync(join(DOTFILES, '.git'))) {
  err(`${DOTFILES}는 git repo가 아님`);
  process.exit(1);
}

log(`working: ${WORKING}`);
log(`dotfiles: ${DOTFILES}`);
log(`모드: ${PUSH ? '커밋+푸시' : COMMIT ? '커밋만' : '미리보기'}`);

// ─── 2. dotfiles clean 상태 확인 ───
const status = gitCapture(['status', '--porcelain']);
if (status.stdout.length > 0) {
  if (FORCE_RESET) {
    warn('uncommitted 변경 감지 — --force-reset으로 정리');
    git(['reset', '--hard', 'HEAD']);
    git(['clean', '-fd']);
  } else {
    warn('dotfiles에 uncommitted 변경 있음:');
    console.warn(status.stdout);
    warn('정리 후 재시도하거나 --force-reset 추가 (기존 변경 버림)');
    if (COMMIT) process.exit(1);
  }
}

// ─── 3. MANIFEST 복사 ───
let copied = 0;
for (const item of MANIFEST) {
  const src = join(WORKING, item.src);
  const dst = join(DOTFILES, item.dst);
  if (!existsSync(src)) {
    warn(`source 없음 스킵: ${item.src}`);
    continue;
  }
  if (item.kind === 'dir') {
    atomicCopyDir(src, dst);
    log(`dir  복사: ${item.src} → ${item.dst}`);
  } else {
    atomicCopyFile(src, dst);
    log(`file 복사: ${item.src} → ${item.dst}`);
  }
  copied++;
}
log(`총 ${copied}개 항목 복사`);

// ─── 4. install.sh 업데이트 (구방식 심볼릭 링크 → 신방식 bootstrap 호출) ───
const newInstallSh = `#!/bin/bash
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
`;

writeFileSync(join(DOTFILES, 'install.sh'), newInstallSh, { mode: 0o755 });
log('install.sh 갱신 (심볼릭 링크 방식 → bootstrap 방식)');

// ─── 5. 커밋 / 푸시 ───
if (!COMMIT) {
  log('\n미리보기만 완료. 커밋하려면 --commit, 푸시까지 원하면 --push');
  process.exit(0);
}

const diff = gitCapture(['status', '--porcelain']);
if (diff.stdout.length === 0) {
  log('변경사항 없음 — 커밋 스킵');
  process.exit(0);
}

// CLAUDE.md에서 버전 추출 (없으면 date 사용)
let version = '';
try {
  const claudeMd = readFileSync(join(WORKING, 'CLAUDE.md'), 'utf8');
  const m = claudeMd.match(/Dotfiles v([\d.]+)/);
  if (m) version = `v${m[1]}`;
} catch {}
if (!version) version = new Date().toISOString().slice(0, 10);

const msg = `release: working → dotfiles ${version}

- hooks, skills, settings.json 최신화
- bootstrap/sync-user-scope/cleanup-repo-hooks 스크립트 반영
- install.sh: 구방식 심볼릭 링크 → bootstrap 호출 방식 전환`;

git(['add', '-A']);
const commit = git(['commit', '-m', msg]);
if (commit.status !== 0) {
  err('커밋 실패');
  process.exit(1);
}
log(`dotfiles 커밋 완료 (${version})`);

if (PUSH) {
  const push = git(['push']);
  if (push.status !== 0) {
    warn('push 실패 — 수동 확인 필요 (권한·충돌 등)');
    process.exit(1);
  }
  log('dotfiles 원격 푸시 완료');
}
