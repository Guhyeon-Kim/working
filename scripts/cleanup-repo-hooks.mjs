#!/usr/bin/env node
/**
 * cleanup-repo-hooks.mjs — v6.3 이전 하네스로 패치된 repo에서
 * 레거시 `hooks/`·`skills/` 디렉토리를 제거하는 migration helper.
 *
 * v6.4부터는 훅·스킬을 user-scope(`~/.claude/`) 한 곳에서만 관리하므로
 * repo-local 복사본은 불필요 + 업데이트 전파 비용의 원인.
 *
 * 실행:
 *   진단:   node scripts/cleanup-repo-hooks.mjs <repo-path>
 *   적용:   node scripts/cleanup-repo-hooks.mjs <repo-path> --apply
 *
 * 규칙:
 *   - Working Hub 자체(이 repo)는 대상에서 제외 (source of truth)
 *   - git 추적 파일이면 `git rm -r` 후 커밋 제안, 미추적이면 그냥 rmSync
 *   - 제거 전 각 repo의 git 상태를 확인하여 uncommitted 변경 있으면 경고
 */

import { existsSync, readdirSync, statSync, rmSync } from 'fs';
import { join, resolve, basename } from 'path';
import { spawnSync } from 'child_process';
import { platform } from 'os';

const IS_WIN = platform() === 'win32';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const target = args.find(a => !a.startsWith('--'));

if (!target) {
  console.error('사용법: node scripts/cleanup-repo-hooks.mjs <repo-path> [--apply]');
  process.exit(1);
}

const repo = resolve(target);
if (!existsSync(repo)) {
  console.error(`[cleanup] 경로 없음: ${repo}`);
  process.exit(1);
}

if (basename(repo) === 'working' && existsSync(join(repo, 'agents/delegation_workflow.md'))) {
  console.error(`[cleanup] ${repo}는 Working Hub 자체 — source of truth이므로 정리 대상 아님`);
  process.exit(1);
}

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: IS_WIN,
  });
}

function isGitRepo(dir) {
  return existsSync(join(dir, '.git'));
}

function hasUncommitted(dir) {
  const r = run('git', ['status', '--porcelain'], dir);
  return r.status === 0 && r.stdout.trim().length > 0;
}

function countFiles(dir) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) n += countFiles(p);
    else n++;
  }
  return n;
}

const targets = [
  join(repo, 'hooks'),
  join(repo, 'skills'),
  join(repo, '.claude', 'hooks'),
  join(repo, '.claude', 'skills'),
];

const found = targets.filter(existsSync).map(p => ({ path: p, files: countFiles(p) }));

console.log(`[cleanup] 대상 repo: ${repo}`);
console.log(`[cleanup] 모드: ${APPLY ? '적용(--apply)' : '진단만'}`);

if (found.length === 0) {
  console.log('[cleanup] 레거시 hooks/·skills/ 없음 — 정리 불필요. user-scope가 master입니다.');
  process.exit(0);
}

console.log('[cleanup] 발견된 레거시 디렉토리:');
for (const f of found) {
  console.log(`  - ${f.path} (${f.files}개 파일)`);
}

const gitManaged = isGitRepo(repo);
if (gitManaged && hasUncommitted(repo)) {
  console.warn('[cleanup][경고] uncommitted 변경이 있습니다. 먼저 커밋/스태시 후 재시도 권장.');
}

if (!APPLY) {
  console.log('\n[cleanup] 실제 제거하려면: --apply 추가');
  process.exit(0);
}

for (const f of found) {
  try {
    if (gitManaged) {
      const r = run('git', ['rm', '-rf', '--quiet', f.path], repo);
      if (r.status === 0) {
        console.log(`[cleanup] git rm: ${f.path}`);
        continue;
      }
    }
    rmSync(f.path, { recursive: true, force: true });
    console.log(`[cleanup] rm: ${f.path}`);
  } catch (e) {
    console.error(`[cleanup][에러] ${f.path}: ${e.message}`);
  }
}

console.log('\n[cleanup] 완료. 커밋 제안:');
console.log('  git -C ' + repo + ' commit -m "chore: remove legacy repo-local hooks/skills (v6.4 migration)"');
console.log('\n이후 이 repo는 user-scope ~/.claude/hooks/·skills/ 만 사용합니다.');
