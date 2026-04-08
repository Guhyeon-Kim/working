#!/usr/bin/env node
/**
 * Stop hook — 완료 기록 + 자동 품질 게이트 (v4.0 — Node.js 전환)
 *
 * on-stop.sh를 Node.js로 전환: Windows 한글 인코딩 문제 근본 해결
 * - 소요시간 계산 + activity-log 기록
 * - project-log.md 자동 기록
 * - 인코딩 게이트 (frontend 코드 변경 시)
 * - 설정 파일 변경 경고
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

const cwd = process.cwd();
const NOW = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }).replace(/\./g, '-').slice(0, 16);
const TIMESTAMP = Math.floor(Date.now() / 1000);
const LOG = join(cwd, '.claude', 'activity-log.md');
const TMP = join(cwd, '.claude', 'current-task.tmp');
const QLOG = join(cwd, '.claude', 'quality-gate-log.md');
const PLOG = join(cwd, '.claude', 'project-log.md');

// stdin 소비
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { stdinData += chunk; });
process.stdin.on('end', () => { main(); });
process.stdin.resume();

function appendToFile(filePath, line) {
  try { appendFileSync(filePath, line + '\n', 'utf8'); } catch { /* ignore */ }
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}\uCD08`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}\uBD84 ${seconds % 60}\uCD08`;
  return `${Math.floor(seconds / 3600)}\uC2DC\uAC04 ${Math.floor((seconds % 3600) / 60)}\uBD84`;
}

function gitDiffNames() {
  try {
    return execFileSync('git', ['diff', '--name-only', 'HEAD'], {
      cwd, encoding: 'utf8', timeout: 5000
    }).split('\n').filter(Boolean);
  } catch { return []; }
}

function countBrokenFiles(dir) {
  let count = 0;
  const exts = new Set(['.tsx', '.ts', '.js', '.jsx', '.css']);
  const skip = new Set(['node_modules', '.next']);

  function walk(d) {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const ext = full.slice(full.lastIndexOf('.'));
      if (!exts.has(ext)) continue;
      try {
        const buf = readFileSync(full);
        for (let i = 0; i < buf.length; i++) {
          if (buf[i] >= 0x80 && buf[i] <= 0x9f) { count++; break; }
        }
      } catch { /* ignore */ }
    }
  }
  walk(dir);
  return count;
}

function main() {
  if (!existsSync(TMP)) process.exit(0);

  let task = '', started = 0;
  try {
    const lines = readFileSync(TMP, 'utf8').split('\n');
    task = lines[0] || '';
    started = parseInt(lines[1], 10) || TIMESTAMP;
  } catch { process.exit(0); }

  if (!task) {
    try { unlinkSync(TMP); } catch {}
    process.exit(0);
  }

  const elapsed = TIMESTAMP - started;
  const duration = formatDuration(elapsed);

  // 1. activity-log.md
  if (!existsSync(LOG)) {
    writeFileSync(LOG, '# Activity Log\n\n---\n\n', 'utf8');
  }
  appendToFile(LOG, `- [\uC644\uB8CC] ${task} (${NOW} \u2014 ${duration})`);

  // 1-b. project-log.md
  if (existsSync(PLOG)) {
    try {
      const content = readFileSync(PLOG, 'utf8');
      if (!content.includes('## \uD83E\uDD16 \uC790\uB3D9 \uC138\uC158 \uB85C\uADF8')) {
        appendToFile(PLOG, '\n---\n\n## \uD83E\uDD16 \uC790\uB3D9 \uC138\uC158 \uB85C\uADF8\n');
      }
      appendToFile(PLOG, `- [\u25A0 \uC885\uB8CC] ${task} \u2014 ${NOW} (\uC18C\uC694: ${duration})`);
    } catch { /* ignore */ }
  }

  // 2. 인코딩 게이트
  const diffFiles = gitDiffNames();
  const changedFrontend = diffFiles.some(l => l.startsWith('src'));

  if (changedFrontend) {
    if (!existsSync(QLOG)) {
      writeFileSync(QLOG, '# Quality Gate Log\n\n', 'utf8');
    }
    let brokenCount = 0;
    const srcDir = join(cwd, 'src');
    if (existsSync(srcDir)) {
      brokenCount = countBrokenFiles(srcDir);
    }
    if (brokenCount > 0) {
      process.stderr.write(`\u26A0\uFE0F  [\uC778\uCF54\uB529 FAIL] ${brokenCount}\uAC1C \uD30C\uC77C \uC624\uC5FC \u2014 \uCEE4\uBC0B \uC804 \uC218\uC815 \uD544\uC694\n`);
      appendToFile(QLOG, `- [\u274C \uC778\uCF54\uB529] ${task} \u2014 ${brokenCount}\uAC1C \uC624\uC5FC (${NOW})`);
    } else {
      appendToFile(QLOG, `- [\u2705 \uC778\uCF54\uB529] ${task} \u2014 PASS (${NOW})`);
    }
  }

  // 3. 설정 파일 변경 경고
  const configChanged = diffFiles.filter(l =>
    /next\.config|tailwind\.config|tsconfig|supabase\/migrations/.test(l)
  );
  if (configChanged.length > 0) {
    process.stderr.write(`\uD83D\uDCCB [\uC124\uC815 \uBCC0\uACBD] \uC601\uD5A5 \uBC94\uC704 \uAC80\uD1A0 \uD544\uC694:\n`);
    configChanged.forEach(f => process.stderr.write(`    - ${f}\n`));
  }

  try { unlinkSync(TMP); } catch {}
  process.exit(0);
}
