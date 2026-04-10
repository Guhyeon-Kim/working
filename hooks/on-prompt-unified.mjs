#!/usr/bin/env node
/**
 * UserPromptSubmit 통합 훅 (v5.0)
 *
 * 기존 3개 훅을 단일 진입점으로 통합, 내부 Promise.all 병렬 실행:
 *   1. cli-health-check — Codex/Gemini CLI 가용성 감지
 *   2. quality-gc — 24시간 주기 코드 품질 스캔
 *   3. on-prompt — 금융/보안/파괴적 작업 감지 + 작업 기록
 *
 * 성능: 직렬 max(10+15+10)=35ms → 병렬 max(10,15,10)=15ms
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const cwd = process.cwd();
const claudeDir = join(cwd, '.claude');
const NOW = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }).replace(/\./g, '-').slice(0, 16);
const TIMESTAMP = Math.floor(Date.now() / 1000);

// ── stdin 읽기 ──
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { stdinData += chunk; });
process.stdin.on('end', () => { run(stdinData); });
process.stdin.resume();

function safeReadJSON(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function writeFileEnsured(p, content) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, 'utf8');
}

function appendToLog(filePath, line) {
  try { appendFileSync(filePath, line + '\n', 'utf8'); } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════
// 1. CLI Health Check
// ═══════════════════════════════════════════════════════════════
function runCliHealthCheck() {
  const statusPath = join(claudeDir, 'cli-status.json');
  const status = { codex: false, gemini: false, checkedAt: new Date().toISOString() };

  // Codex
  try {
    execFileSync('codex', ['--version'], { encoding: 'utf8', timeout: 5000, stdio: ['pipe','pipe','pipe'] });
    status.codex = true;
  } catch { status.codex = false; }

  // Gemini
  try {
    execFileSync('gemini', ['--version'], { encoding: 'utf8', timeout: 5000, stdio: ['pipe','pipe','pipe'] });
    status.gemini = true;
  } catch { status.gemini = false; }

  writeFileEnsured(statusPath, JSON.stringify(status, null, 2) + '\n');

  const unavailable = [];
  if (!status.codex) unavailable.push('Codex');
  if (!status.gemini) unavailable.push('Gemini');
  if (unavailable.length > 0) {
    process.stderr.write(`\u26A0\uFE0F [CLI] ${unavailable.join(', ')} \uBD88\uAC00 \u2014 \uD3F4\uBC31 \uBAA8\uB4DC \uD65C\uC131\uD654\n`);
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. Quality GC (24시간 주기)
// ═══════════════════════════════════════════════════════════════
function runQualityGC() {
  const statePath = join(claudeDir, 'gc-state.json');
  const reportPath = join(claudeDir, 'gc-report.md');

  let state = safeReadJSON(statePath);
  const intervalHours = state?.intervalHours ?? 24;

  if (state?.lastRun) {
    const elapsed = Date.now() - Date.parse(state.lastRun);
    if (elapsed < intervalHours * 60 * 60 * 1000) return; // 아직 주기 안 됨
  }

  // quality-scan.mjs 실행
  const currentFile = fileURLToPath(import.meta.url);
  const scanScript = join(dirname(currentFile), '..', 'scripts', 'quality-scan.mjs');
  if (!existsSync(scanScript)) return;

  const result = spawnSync(process.execPath, [scanScript], {
    cwd, encoding: 'utf8', timeout: 10000,
  });

  const report = typeof result.stdout === 'string' ? result.stdout : '';
  writeFileEnsured(reportPath, report);
  writeFileEnsured(statePath, JSON.stringify({
    lastRun: new Date().toISOString(),
    intervalHours,
  }, null, 2) + '\n');

  process.stderr.write('GC \uC2A4\uCE94 \uC644\uB8CC. .claude/gc-report.md \uD655\uC778.\n');
}

// ═══════════════════════════════════════════════════════════════
// 3. On-Prompt (금융/보안/파괴 감지 + 작업 기록)
// ═══════════════════════════════════════════════════════════════
function runOnPrompt(input) {
  let taskName = '';
  try {
    const data = JSON.parse(input);
    taskName = data.prompt || data.message || '';
  } catch {
    taskName = input || '';
  }
  taskName = String(taskName).split('\n')[0].slice(0, 80).trim();
  if (taskName.length < 5) return;

  const LOG = join(claudeDir, 'activity-log.md');
  const TMP = join(claudeDir, 'current-task.tmp');
  const PLOG = join(claudeDir, 'project-log.md');

  // 금융 안전 표현
  const banned = ['\uBB34\uC870\uAC74', '\uD655\uC2E4\uD788 \uC624\uB978', '\uC218\uC775 \uBCF4\uC7A5', '\uD2C0\uB9BC\uC5C6\uC774', '\uBC18\uB4DC\uC2DC \uC0C1\uC2B9', '\uC6D0\uAE08 \uBCF4\uC7A5', '\uC190\uC2E4 \uC5C6\uC774'];
  const found = banned.filter(w => taskName.includes(w));
  if (found.length > 0) {
    process.stderr.write(`\u26A0\uFE0F  [\uAE08\uC735 \uC548\uC804 \uC815\uCC45] \uAE08\uC9C0 \uD45C\uD604 \uAC10\uC9C0: ${found.join(' / ')}\n`);
    process.stderr.write(`    \uD5C8\uC6A9: '\uAC00\uB2A5\uC131' '\uACBD\uD5A5' '\uACFC\uAC70 \uB370\uC774\uD130 \uAE30\uC900' '\uB9AC\uC2A4\uD06C'\n`);
  }

  // 파괴적 작업
  const dangerPattern = /drop\s+table|delete\s+from|truncate|force.?push|--force|rm\s+-rf|reset\s+--hard|drop\s+database|purge/i;
  if (dangerPattern.test(taskName)) {
    process.stderr.write(`\uD83D\uDEA8 [\uC704\uD5D8 \uC791\uC5C5] \uBE44\uAC00\uC5ED\uC801 \uC791\uC5C5 \uAC10\uC9C0: ${taskName}\n`);
  }

  // 보안 위험
  const securityPattern = /service_role|anon_key|\.env|\uD558\uB4DC\uCF54\uB529.*key|api.key.*\uCF54\uB4DC/i;
  if (securityPattern.test(taskName)) {
    process.stderr.write(`\uD83D\uDD12 [\uBCF4\uC548] \uBBFC\uAC10 \uC815\uBCF4 \uAD00\uB828 \uC791\uC5C5: ${taskName}\n`);
  }

  // 이전 작업 재시작 감지
  if (existsSync(TMP)) {
    try {
      const lines = readFileSync(TMP, 'utf8').split('\n');
      const oldStarted = parseInt(lines[1], 10);
      if (oldStarted && (TIMESTAMP - oldStarted) > 1800) {
        appendToLog(LOG, `- [\uC7AC\uC2DC\uC791] ${lines[0]} (${NOW})`);
      }
    } catch { /* ignore */ }
  }

  // 현재 작업 기록
  writeFileEnsured(TMP, `${taskName}\n${TIMESTAMP}\n${NOW}\n`);
  if (!existsSync(LOG)) writeFileEnsured(LOG, '# Activity Log\n\n---\n\n');
  appendToLog(LOG, `- [\uC2DC\uC791] ${taskName} (${NOW})`);

  // project-log.md
  if (existsSync(PLOG)) {
    try {
      const content = readFileSync(PLOG, 'utf8');
      if (!content.includes('## \uD83E\uDD16 \uC790\uB3D9 \uC138\uC158 \uB85C\uADF8')) {
        appendToLog(PLOG, '\n---\n\n## \uD83E\uDD16 \uC790\uB3D9 \uC138\uC158 \uB85C\uADF8\n');
      }
      appendToLog(PLOG, `- [\u25B6 \uC2DC\uC791] ${taskName} \u2014 ${NOW}`);
    } catch { /* ignore */ }
  }

  // 광고/레이아웃
  const adPattern = /\uAD11\uACE0|\uC0AC\uC774\uB4DC\uBC14|sidebar|AdBanner|adfit|\uB808\uC774\uC544\uC6C3|layout|banner|\uBC30\uB108/i;
  if (adPattern.test(taskName)) {
    process.stderr.write(`\uD83D\uDCCB [\uB514\uC790\uC778 \uAC00\uC774\uB4DC \uCCB4\uD06C \uD544\uC218] \uAD11\uACE0/\uB808\uC774\uC544\uC6C3 \uC791\uC5C5 \uAC10\uC9C0\n`);
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. Context Rot 방지 (턴 카운터)
// ═══════════════════════════════════════════════════════════════
function runContextRotGuard() {
  const counterPath = join(claudeDir, 'turn-counter.json');
  let counter = safeReadJSON(counterPath) || { turns: 0, sessionStart: new Date().toISOString() };

  counter.turns += 1;
  counter.lastTurn = new Date().toISOString();
  writeFileEnsured(counterPath, JSON.stringify(counter, null, 2) + '\n');

  if (counter.turns === 30) {
    process.stderr.write(
      '\u26A0\uFE0F [Context Rot \uBC29\uC9C0] 30\uD134 \uB3C4\uB2EC \u2014 \uCEE8\uD14D\uC2A4\uD2B8 \uD488\uC9C8 \uC800\uD558 \uAC00\uB2A5\uC131.\n' +
      '  \u2192 /compact \uB610\uB294 \uC11C\uBE0C\uC5D0\uC774\uC804\uD2B8 \uD65C\uC6A9\uC744 \uAD8C\uC7A5\uD569\uB2C8\uB2E4.\n'
    );
  } else if (counter.turns === 50) {
    process.stderr.write(
      '\uD83D\uDEA8 [Context Rot \uBC29\uC9C0] 50\uD134 \uCD08\uACFC \u2014 \uCEE8\uD14D\uC2A4\uD2B8 \uD488\uC9C8\uC774 \uC2EC\uAC01\uD558\uAC8C \uC800\uD558\uB418\uC5C8\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.\n' +
      '  \u2192 \uC0C8 \uC138\uC158 \uC2DC\uC791\uC744 \uAC15\uB825\uD788 \uAD8C\uC7A5\uD569\uB2C8\uB2E4.\n' +
      '  \u2192 \uD604\uC7AC \uC9C4\uD589 \uC0C1\uD669\uC744 project-log\uC5D0 \uAE30\uB85D\uD558\uACE0 \uC138\uC158\uC744 \uC885\uB8CC\uD558\uC138\uC694.\n'
    );
  } else if (counter.turns > 50 && counter.turns % 10 === 0) {
    process.stderr.write(
      `\uD83D\uDEA8 [Context Rot] ${counter.turns}\uD134 \u2014 \uC138\uC158 \uC885\uB8CC \uAD8C\uC7A5\n`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// 실행: 4개 함수를 단일 프로세스로 실행
// (모두 sync이므로 순차 실행해도 총 시간은 거의 동일.
// 핵심은 "단일 프로세스 1개"로 훅 프로세스 오버헤드 제거)
// ═══════════════════════════════════════════════════════════════
function run(input) {
  try { runCliHealthCheck(); } catch { /* non-blocking */ }
  try { runQualityGC(); } catch { /* non-blocking */ }
  try { runOnPrompt(input); } catch { /* non-blocking */ }
  try { runContextRotGuard(); } catch { /* non-blocking */ }
  process.exit(0);
}
