import fs from 'fs';
import path from 'path';

/**
 * evolving-guardrails.mjs — Stop 훅 (v5.2)
 *
 * 자기 성장 시스템의 핵심:
 *   1. acl-state.json + quality-gate-log.md + activity-log.md에서 실패 패턴 수집
 *   2. evolving-rules.json에 패턴별 카운트 축적
 *   3. count >= 2: 경고 (hookify 권장)
 *   4. count >= 3: 긴급 경고 (반복 버그 레지스트리 등재 + hookify 시급)
 *   5. count >= 5: failure-cases.md 자동 등재 권고 + CLAUDE.md 반영 권고
 *   6. 30일 이상 미발생 패턴 자동 아카이브 (GC)
 *
 * v5.2 변경:
 *   - activity-log.md에서 [재시작] 패턴 수집 (타임아웃/중단 반복 감지)
 *   - 30일 미발생 패턴 자동 아카이브 (archived: true)
 *   - count >= 5 시 failure-cases.md 자동 등재 권고
 *   - 세션 통계 요약 출력
 */

let stdinData = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdinData += chunk;
});
process.stdin.resume();
process.stdin.on('end', () => {
  handleStop();
});

function collectAclFailures(value, failures) {
  if (typeof value === 'string') {
    failures.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectAclFailures(item, failures);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  const failureKeys = ['error', 'lastError', 'message', 'reason', 'failure', 'failures', 'history'];
  for (const key of failureKeys) {
    if (key in value) {
      collectAclFailures(value[key], failures);
    }
  }
}

function sanitizeFailure(input) {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolvePatternId(message) {
  if (message.includes('error TS')) return 'typescript-error';
  if (message.includes('async params')) return 'async-params';
  if (/broken|깨진|인코딩|encoding/i.test(message)) return 'encoding-broken';
  if (message.includes('Module not found')) return 'module-not-found';
  if (message.includes('Hydration')) return 'hydration-mismatch';
  if (/ENOENT|파일.*없/.test(message)) return 'file-not-found';
  if (/timeout|타임아웃/i.test(message)) return 'timeout';
  if (/permission|권한|EACCES/i.test(message)) return 'permission-denied';
  if (/재시작/.test(message)) return 'task-restart';
  if (/lint|eslint/i.test(message)) return 'lint-error';
  if (/build.*fail|빌드.*실패/i.test(message)) return 'build-failure';
  return message.slice(0, 50);
}

function normalizePattern(pattern) {
  if (!pattern || typeof pattern !== 'object') {
    return null;
  }

  const id = typeof pattern.id === 'string' && pattern.id ? pattern.id : 'unknown';
  const message = sanitizeFailure(pattern.pattern || pattern.lastError || id);
  const today = new Date().toISOString().slice(0, 10);

  return {
    id,
    pattern: message,
    count: Number.isFinite(pattern.count) ? pattern.count : 1,
    firstSeen: typeof pattern.firstSeen === 'string' && pattern.firstSeen ? pattern.firstSeen : today,
    lastSeen: typeof pattern.lastSeen === 'string' && pattern.lastSeen ? pattern.lastSeen : today,
    hookified: Boolean(pattern.hookified),
    archived: Boolean(pattern.archived),
    lastError: sanitizeFailure(pattern.lastError || message),
  };
}

function daysBetween(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  return Math.floor(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
}

function handleStop() {
  const cwd = process.cwd();
  const aclStatePath = path.join(cwd, '.claude', 'acl-state.json');
  const qualityGateLogPath = path.join(cwd, '.claude', 'quality-gate-log.md');
  const activityLogPath = path.join(cwd, '.claude', 'activity-log.md');
  const rulesDir = path.join(cwd, '.claude', 'agents', 'memory');
  const rulesPath = path.join(rulesDir, 'evolving-rules.json');
  const today = new Date().toISOString().slice(0, 10);

  const failures = [];

  // 소스 1: acl-state.json
  try {
    const raw = fs.readFileSync(aclStatePath, 'utf8');
    const parsed = JSON.parse(raw);
    collectAclFailures(parsed, failures);
  } catch {
    // Missing or invalid acl-state.json is ignored.
  }

  // 소스 2: quality-gate-log.md (실패 항목)
  try {
    const raw = fs.readFileSync(qualityGateLogPath, 'utf8');
    const lines = raw.split('\n').filter(l => l.includes('\u274C'));
    for (const line of lines) {
      const categoryMatch = line.match(/\u274C\s*([^)\]]+)/);
      if (categoryMatch) {
        failures.push(categoryMatch[1].trim());
      } else {
        failures.push(line);
      }
    }
  } catch {
    // Missing quality-gate-log.md is ignored.
  }

  // 소스 3: activity-log.md (재시작 패턴 — 작업 중단/타임아웃 반복 감지)
  try {
    const raw = fs.readFileSync(activityLogPath, 'utf8');
    const restartLines = raw.split('\n').filter(l => l.includes('[재시작]'));
    for (const line of restartLines) {
      failures.push(line.replace(/^-\s*/, '').trim());
    }
  } catch {
    // Missing activity-log.md is ignored.
  }

  // 규칙 파일 로드
  fs.mkdirSync(rulesDir, { recursive: true });

  let rules = { version: 2, patterns: [] };

  try {
    const raw = fs.readFileSync(rulesPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.patterns)) {
      rules = {
        version: 2,
        patterns: parsed.patterns.map(normalizePattern).filter(Boolean),
      };
    }
  } catch {
    rules = { version: 2, patterns: [] };
  }

  // 실패 패턴 축적
  let newPatterns = 0;
  let updatedPatterns = 0;

  for (const failure of failures) {
    const message = sanitizeFailure(failure);
    if (!message) continue;

    const id = resolvePatternId(message);
    const existing = rules.patterns.find((p) => p.id === id && !p.archived);

    if (existing) {
      existing.count += 1;
      existing.lastSeen = today;
      existing.lastError = message;
      existing.archived = false;
      if (!existing.pattern) existing.pattern = message;
      updatedPatterns++;
    } else {
      rules.patterns.push({
        id,
        pattern: message,
        count: 1,
        firstSeen: today,
        lastSeen: today,
        hookified: false,
        archived: false,
        lastError: message,
      });
      newPatterns++;
    }
  }

  // GC: 30일 이상 미발생 패턴 자동 아카이브
  let archivedCount = 0;
  for (const rule of rules.patterns) {
    if (!rule.archived && daysBetween(rule.lastSeen, today) >= 30) {
      rule.archived = true;
      archivedCount++;
    }
  }

  // 활성 패턴만 정렬 (아카이브는 끝에)
  rules.patterns.sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    return a.lastSeen < b.lastSeen ? -1 : a.lastSeen > b.lastSeen ? 1 : 0;
  });

  // 최대 100개 유지 (아카이브 포함)
  if (rules.patterns.length > 100) {
    rules.patterns = rules.patterns.slice(0, 100);
  }

  // pending-hookify.json: count >= 3 패턴 자동 등재 (다음 세션에서 hookify 강제 프롬프트)
  const hookifyCandidates = rules.patterns.filter(r => !r.archived && !r.hookified && r.count >= 3);
  if (hookifyCandidates.length > 0) {
    const pendingPath = path.join(cwd, '.claude', 'pending-hookify.json');
    const pending = [];
    for (const c of hookifyCandidates) {
      pending.push({
        id: c.id,
        pattern: c.pattern,
        count: c.count,
        firstSeen: c.firstSeen,
        suggestedRule: `${c.id} 패턴 반복 ${c.count}회 — PreToolUse 차단 규칙 필요`,
      });
    }
    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2) + '\n', 'utf8');
  }

  // 저장
  fs.writeFileSync(
    rulesPath,
    JSON.stringify({ version: 2, patterns: rules.patterns, lastUpdated: today }, null, 2) + '\n',
    'utf8'
  );

  // 경고 출력
  const activeRules = rules.patterns.filter((r) => !r.archived && !r.hookified);

  for (const rule of activeRules) {
    if (rule.count >= 5) {
      process.stderr.write(
        `\u{1F6A8}\u{1F6A8} [\uc9c4\ud654 \uaddc\uce59] \uc2ec\uac01\ud55c \ubc18\ubcf5 \uc5d0\ub7ec: "${rule.pattern}" (${rule.count}\ud68c, ${rule.firstSeen}\ubd80\ud130)\n` +
          '\u2192 failure-cases.md\uc5d0 \uc7a5\uc560 \uc0ac\ub840\ub85c \ub4f1\uc7ac\ud558\uc138\uc694.\n' +
          '\u2192 CLAUDE.md\uc5d0 \ubc18\ubcf5 \ubc84\uadf8 \ucc28\ub2e8 \uaddc\uce59\uc744 \ucd94\uac00\ud558\uc138\uc694.\n' +
          '\u2192 /hookify:hookify \ub85c PreToolUse \uc790\ub3d9 \ucc28\ub2e8 \uaddc\uce59 \uc0dd\uc131\uc774 \uc2dc\uae09\ud569\ub2c8\ub2e4.\n'
      );
      continue;
    }
    if (rule.count >= 3) {
      process.stderr.write(
        `\u{1F6A8} [\uc9c4\ud654 \uaddc\uce59] \ube48\ubc1c \uc5d0\ub7ec: "${rule.pattern}" (${rule.count}\ud68c)\n` +
          '\u2192 \ubc18\ubcf5 \ubc84\uadf8 \ub808\uc9c0\uc2a4\ud2b8\ub9ac(agents/memory/failure-cases.md)\uc5d0 \ub4f1\uc7ac\ud558\uc138\uc694.\n' +
          '\u2192 /hookify:hookify \uaddc\uce59 \uc0dd\uc131\uc774 \uc2dc\uae09\ud569\ub2c8\ub2e4.\n'
      );
      continue;
    }
    if (rule.count >= 2) {
      process.stderr.write(
        `\u{1F4CB} [\uc9c4\ud654 \uaddc\uce59] \ubc18\ubcf5 \uc5d0\ub7ec \uac10\uc9c0: "${rule.pattern}" (${rule.count}\ud68c, \ucd5c\ucd08: ${rule.firstSeen})\n` +
          '\u2192 /hookify:hookify \ub85c PreToolUse \ucc28\ub2e8 \uaddc\uce59 \uc0dd\uc131\uc744 \uad8c\uc7a5\ud569\ub2c8\ub2e4.\n'
      );
    }
  }

  // 세션 통계 요약
  if (failures.length > 0 || archivedCount > 0) {
    process.stderr.write(
      `\n\u{1F4CA} [\uc9c4\ud654 \uaddc\uce59 \ud1b5\uacc4] \uc2e0\uaddc: ${newPatterns} | \uc5c5\ub370\uc774\ud2b8: ${updatedPatterns} | \uc544\uce74\uc774\ube0c(30\uc77c+): ${archivedCount} | \ud65c\uc131 \uaddc\uce59: ${activeRules.length}\n`
    );
  }

  process.exit(0);
}
