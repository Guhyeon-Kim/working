/**
 * UserPromptSubmit 훅: 작업 기록 + 위험 감지 (v4.0 — Node.js 재작성)
 *
 * on-prompt.sh를 Node.js로 전환: Windows 한글 인코딩 문제 근본 해결
 * - 금융 안전 표현 감지
 * - 파괴적/비가역적 작업 감지
 * - 보안 위험 패턴 감지
 * - 광고/레이아웃 변경 감지
 * - 작업 기록 (activity-log.md, project-log.md, current-task.tmp)
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

const cwd = process.cwd();
const NOW = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }).replace(/\./g, '-').slice(0, 16);
const TIMESTAMP = Math.floor(Date.now() / 1000);
const LOG = join(cwd, '.claude', 'activity-log.md');
const TMP = join(cwd, '.claude', 'current-task.tmp');
const PLOG = join(cwd, '.claude', 'project-log.md');

// ── stdin 읽기 ──────────────────────────────────────────────────────────────
let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { stdinData += chunk; });
process.stdin.on('end', () => { main(stdinData); });
process.stdin.resume();

function main(input) {
  // 프롬프트 텍스트 추출
  let taskName = '';
  try {
    const data = JSON.parse(input);
    taskName = data.prompt || data.message || '';
  } catch {
    taskName = input || '';
  }
  taskName = String(taskName).split('\n')[0].slice(0, 80).trim();

  if (taskName.length < 5) {
    process.exit(0);
  }

  // ── 1. 금융 안전 표현 감지 ──────────────────────────────────────────────────
  const banned = ['무조건', '확실히 오른', '수익 보장', '틀림없이', '반드시 상승', '원금 보장', '손실 없이'];
  const found = banned.filter(w => taskName.includes(w));
  if (found.length > 0) {
    process.stderr.write(`⚠️  [금융 안전 정책] 금지 표현 감지: ${found.join(' / ')}\n`);
    process.stderr.write(`    허용: '가능성' '경향' '과거 데이터 기준' '리스크'\n`);
  }

  // ── 2. 파괴적·비가역적 작업 감지 ────────────────────────────────────────────
  const dangerPattern = /drop\s+table|delete\s+from|truncate|force.?push|--force|rm\s+-rf|reset\s+--hard|drop\s+database|purge/i;
  if (dangerPattern.test(taskName)) {
    process.stderr.write(`🚨 [위험 작업] 비가역적 작업 감지: ${taskName}\n`);
    process.stderr.write(`    CTO 리스크 분석 및 백업 계획 수립 후 진행.\n`);
  }

  // ── 3. 보안 위험 패턴 감지 ──────────────────────────────────────────────────
  const securityPattern = /service_role|anon_key|\.env|하드코딩.*key|api.key.*코드/i;
  if (securityPattern.test(taskName)) {
    process.stderr.write(`🔒 [보안] 민감 정보 관련 작업: ${taskName}\n`);
    process.stderr.write(`    .env 수정 금지. Vercel/Cloud Run 대시보드에서만 설정.\n`);
  }

  // ── 4. 이전 작업 재시작 감지 ────────────────────────────────────────────────
  if (existsSync(TMP)) {
    try {
      const lines = readFileSync(TMP, 'utf8').split('\n');
      const oldTask = lines[0] || '';
      const oldStarted = parseInt(lines[1], 10);
      if (oldStarted && (TIMESTAMP - oldStarted) > 1800) {
        appendToLog(LOG, `- [재시작] ${oldTask} (${NOW})`);
      }
    } catch { /* ignore */ }
  }

  // ── 5. 현재 작업 기록 ──────────────────────────────────────────────────────
  writeFileSync(TMP, `${taskName}\n${TIMESTAMP}\n${NOW}\n`, 'utf8');

  if (!existsSync(LOG)) {
    writeFileSync(LOG, '# Activity Log\n\n---\n\n', 'utf8');
  }
  appendToLog(LOG, `- [시작] ${taskName} (${NOW})`);

  // ── 5-b. project-log.md 자동 기록 ──────────────────────────────────────────
  if (existsSync(PLOG)) {
    try {
      const content = readFileSync(PLOG, 'utf8');
      if (!content.includes('## 🤖 자동 세션 로그')) {
        appendToLog(PLOG, '\n---\n\n## 🤖 자동 세션 로그\n');
      }
      appendToLog(PLOG, `- [▶ 시작] ${taskName} — ${NOW}`);
    } catch { /* ignore */ }
  }

  // ── 6. 광고/사이드바/레이아웃 변경 감지 ────────────────────────────────────
  const adPattern = /광고|사이드바|sidebar|AdBanner|adfit|레이아웃|layout|banner|배너/i;
  if (adPattern.test(taskName)) {
    process.stderr.write(`📋 [디자인 가이드 체크 필수] 광고/레이아웃 작업 감지: ${taskName}\n`);
    process.stderr.write(`    → .claude/docs/design-guide-v2.md Section 7 (광고 배치 가이드) 먼저 읽을 것\n`);
    process.stderr.write(`    → 기존 구조(사이드바 등) 제거 시 CEO 확인 필수\n`);
  }

  process.exit(0);
}

function appendToLog(filePath, line) {
  try {
    appendFileSync(filePath, line + '\n', 'utf8');
  } catch { /* ignore */ }
}
