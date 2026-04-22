#!/usr/bin/env node
/**
 * Stop hook — 세션 종료 기록 + devlog payload 준비 (v5.0 — v6.0 하네스)
 *
 * 기존 기능 (v4.0 계승):
 * - 소요시간 계산 + activity-log 기록
 * - project-log.md 자동 기록
 * - 인코딩 게이트 (frontend 코드 변경 시)
 * - 설정 파일 변경 경고
 *
 * 신규 (v5.0):
 * - .claude/pending-devlog.json 자동 작성 (CLAUDE.md §1-6 자동화)
 * - git log/diff 기반 commits·files_changed 수집
 * - files_changed 경로로 pattern(δ/α/β/γ) 추론 + confidence
 * - project·category·result 후보값 제시 (Claude가 MCP 등록 시 참고)
 * - 10분 이내 = requires_registration: false (CLAUDE.md §1-6)
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, unlinkSync, readdirSync } from 'fs';
import { join, basename } from 'path';
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

// ─── v5.0 pending-devlog 지원 ───

function gitCommitsSince(sinceUnixTs) {
  try {
    const out = execFileSync('git', ['log', `--since=@${sinceUnixTs}`, '--format=%h'], {
      cwd, encoding: 'utf8', timeout: 5000,
    });
    return out.split('\n').filter(Boolean);
  } catch { return []; }
}

function gitDiffStatusFromCommit(oldestHash) {
  // oldestHash^..HEAD 범위의 name-status를 A/M/D로 분류
  const out = { added: [], modified: [], deleted: [] };
  if (!oldestHash) return out;
  try {
    const raw = execFileSync('git', ['diff', '--name-status', `${oldestHash}^..HEAD`], {
      cwd, encoding: 'utf8', timeout: 5000,
    });
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split(/\s+/);
      const code = parts[0];
      const path = parts.slice(1).join(' ');
      if (!path) continue;
      if (code.startsWith('A')) out.added.push(path);
      else if (code.startsWith('D')) out.deleted.push(path);
      else out.modified.push(path); // M, R, C 등은 modified 취급
    }
  } catch { /* ignore */ }
  return out;
}

function gitStatusShort() {
  try {
    return execFileSync('git', ['status', '--short'], {
      cwd, encoding: 'utf8', timeout: 5000,
    }).split('\n').filter(Boolean);
  } catch { return []; }
}

function gitExitStatus() {
  const lines = gitStatusShort();
  return lines.length === 0 ? 'clean' : 'dirty';
}

// ─── 패턴·프로젝트·카테고리 추론 ───

const HARNESS_PATH_PATTERNS = [
  /^agents\//, /^hooks\//, /^scripts\//, /^skills\//, /^docs\/current\//,
  /^docs\/asis\//, /^docs\/logs\//, /^CLAUDE\.md$/, /^settings\.json$/,
  /^README\.md$/, /^\.gitignore$/, /^\.claudeignore$/,
];

const CONTENTS_PATH_PATTERNS = [
  /^posts\//, /^contents\//, /^tistory\//, /^blog\//,
];

function isHarnessPath(p) {
  return HARNESS_PATH_PATTERNS.some(re => re.test(p));
}

function isContentsPath(p) {
  return CONTENTS_PATH_PATTERNS.some(re => re.test(p));
}

function inferPattern(filesChanged, elapsedSec) {
  const all = [...filesChanged.added, ...filesChanged.modified, ...filesChanged.deleted];
  const total = all.length;

  if (total === 0) {
    return { pattern: 'unknown', confidence: 'low' };
  }

  const harnessCount = all.filter(isHarnessPath).length;
  const contentsCount = all.filter(isContentsPath).length;
  const harnessRatio = harnessCount / total;
  const contentsRatio = contentsCount / total;

  if (harnessRatio >= 0.8) return { pattern: 'δ', confidence: 'high' };
  if (harnessRatio >= 0.5) return { pattern: 'δ', confidence: 'medium' };
  if (contentsRatio >= 0.5) return { pattern: 'γ', confidence: 'medium' };
  if (total === 1 && elapsedSec < 1800) return { pattern: 'α', confidence: 'low' };
  if (total >= 3) return { pattern: 'β', confidence: 'medium' };

  return { pattern: 'unknown', confidence: 'low' };
}

function inferProject(cwdPath, filesChanged) {
  const base = basename(cwdPath);
  const baseMap = {
    'working': '하네스',
    'hubwise-invest': '허브와이즈',
    'blevels': '블레벨',
    'contents-auto': '컨텐츠자동화',
    'contents-automation': '컨텐츠자동화',
  };
  if (baseMap[base]) return baseMap[base];

  // 파일 경로에서 contents 징후
  const all = [...filesChanged.added, ...filesChanged.modified];
  if (all.some(isContentsPath)) return '컨텐츠자동화';
  if (all.some(isHarnessPath)) return '하네스';

  return 'unknown';
}

function inferCategory(taskName, pattern) {
  const t = (taskName || '').toLowerCase();
  if (pattern === 'δ') return '인프라';
  if (/\b(fix|bug)\b|버그|버그수정/.test(t)) return '버그수정';
  if (/refactor|리팩터|리팩토/.test(t)) return '리팩토링';
  if (/\btest\b|테스트|qa/.test(t)) return 'QA';
  if (/security|보안/.test(t)) return '보안';
  return '기능';
}

function inferResult(exitStatus, brokenCount) {
  if (brokenCount > 0) return '부분성공';
  return exitStatus === 'clean' ? '성공' : '부분성공';
}

function writePendingDevlog(payload) {
  const path = join(cwd, '.claude', 'pending-devlog.json');
  try {
    writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    return path;
  } catch { return null; }
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

  // 4. pending-devlog.json 작성 (CLAUDE.md §1-6 자동화)
  try {
    const startedISO = new Date(started * 1000).toISOString();
    const endedISO = new Date(TIMESTAMP * 1000).toISOString();
    const elapsedMin = Math.max(0, Math.round(elapsed / 60));
    const commits = gitCommitsSince(started);
    const filesChanged = commits.length > 0
      ? gitDiffStatusFromCommit(commits[commits.length - 1])
      : { added: [], modified: diffFiles, deleted: [] };

    const brokenForResult = (changedFrontend && existsSync(join(cwd, 'src')))
      ? countBrokenFiles(join(cwd, 'src'))
      : 0;

    const { pattern, confidence } = inferPattern(filesChanged, elapsed);
    const projectCandidate = inferProject(cwd, filesChanged);
    const categoryCandidate = inferCategory(task, pattern);
    const exitStatus = gitExitStatus();
    const resultCandidate = inferResult(exitStatus, brokenForResult);
    const requiresRegistration = elapsed >= 600; // 10분 이상만 필수

    const payload = {
      version: '1',
      session: {
        started: startedISO,
        ended: endedISO,
        elapsed_minutes: elapsedMin,
      },
      task: {
        name: task,
        source: 'current-task.tmp',
      },
      hints: {
        pattern,
        pattern_confidence: confidence,
        project_candidate: projectCandidate,
        category_candidate: categoryCandidate,
        result_candidate: resultCandidate,
      },
      evidence: {
        commits,
        files_changed: filesChanged,
        exit_status: exitStatus,
      },
      requires_registration: requiresRegistration,
    };

    const writtenPath = writePendingDevlog(payload);
    if (writtenPath) {
      process.stderr.write(`\u{1F4CC} [devlog 대기] pending-devlog.json 작성 — 다음 세션 시작 시 Notion 등록 요청됨\n`);
    }
  } catch { /* pending-devlog 실패는 silent (기존 기능 보호) */ }

  try { unlinkSync(TMP); } catch {}
  process.exit(0);
}
