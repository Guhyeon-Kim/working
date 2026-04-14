#!/usr/bin/env node
/**
 * SessionStart 훅: repo hooks/skills와 user-scope 배포본 drift 감지
 *
 * Windows와 Linux 어느 쪽이든 repo 업데이트 후 sync 안 돌리면 경고.
 * 실행 자체는 하지 않고 "sync 명령 실행하세요" 메시지만 stderr로 출력.
 *
 * 성능: diff는 mtime만 비교 → 빠름 (<50ms)
 * Throttling: 세션당 1회 (SessionStart 훅이라 자연 throttled)
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, sep } from 'path';
import { homedir, platform } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function safeMtime(p) {
  try { return statSync(p).mtimeMs; } catch { return 0; }
}

function listFiles(dir, base = '') {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = base ? base + '/' + entry.name : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(abs, rel));
    else out.push({ rel, abs });
  }
  return out;
}

function diff(repoDir, userDir) {
  const repoFiles = listFiles(repoDir);
  const userMap = new Map(listFiles(userDir).map(f => [f.rel, f.abs]));
  let newer = 0, missing = 0;
  for (const f of repoFiles) {
    const userAbs = userMap.get(f.rel);
    if (!userAbs) { missing++; continue; }
    if (safeMtime(f.abs) > safeMtime(userAbs) + 1000) newer++; // 1초 tolerance
  }
  return { newer, missing, total: repoFiles.length };
}

// stdin 소비 (SessionStart 훅 관례)
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { stdinData += c; });
process.stdin.on('end', () => {
  try {
    // 이 훅 파일은 user-scope(~/.claude/hooks)에 복사되어 실행됨.
    // repo 루트는 cwd에서 찾는다: cwd에 hooks/, skills/, scripts/delegate.mjs가 있으면 Working Hub repo.
    const cwd = process.cwd();
    const candidates = [cwd, dirname(cwd), join(cwd, '..')];
    let repoRoot = null;
    for (const c of candidates) {
      if (existsSync(join(c, 'hooks')) && existsSync(join(c, 'skills')) && existsSync(join(c, 'scripts', 'sync-user-scope.mjs'))) {
        repoRoot = c; break;
      }
    }
    if (!repoRoot) process.exit(0); // Working Hub cwd가 아니면 조용히 종료

    const userScope = join(homedir(), '.claude');
    const hooks = diff(join(repoRoot, 'hooks'), join(userScope, 'hooks'));
    const skills = diff(join(repoRoot, 'skills'), join(userScope, 'skills'));

    const drift = hooks.newer + hooks.missing + skills.newer + skills.missing;
    if (drift > 0) {
      const syncCmd = platform() === 'win32'
        ? 'node scripts\\sync-user-scope.mjs'
        : 'node scripts/sync-user-scope.mjs';
      process.stderr.write(
        `[harness drift] repo가 user-scope보다 최신:\n` +
        `  hooks: newer=${hooks.newer} missing=${hooks.missing}\n` +
        `  skills: newer=${skills.newer} missing=${skills.missing}\n` +
        `  → ${syncCmd} 실행하세요.\n`
      );
    }
  } catch {
    // 훅 실패는 세션을 막지 않음
  } finally {
    process.exit(0);
  }
});
process.stdin.resume();
