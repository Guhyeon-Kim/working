#!/usr/bin/env node
/**
 * SessionStart 훅: 세션 시작 시 메모리 시스템 로딩 (v5.2)
 *
 * 자기 성장 시스템의 핵심 — 이전 세션의 학습 결과를 새 세션에 주입.
 *
 * 로딩 대상:
 *   1. evolving-rules.json — 반복 에러 패턴 (count >= 2 경고, >= 3 차단 권고)
 *   2. failure-cases.md — 과거 장애 사례 요약
 *   3. success-patterns.md — 성공 패턴 요약
 *   4. cli-status.json — CLI 가용 상태 (있으면)
 *
 * 출력: stderr로 요약 경고/알림 → 에이전트가 세션 초반에 인지
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.resume();
  });
}

function safeReadJSON(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function safeReadText(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function countPatterns(text, marker) {
  if (!text) return 0;
  return (text.match(new RegExp(marker, 'g')) || []).length;
}

async function main() {
  await readStdin();

  const cwd = process.cwd();
  const claudeDir = join(cwd, '.claude');
  const agentsMemory = join(cwd, '.claude', 'agents', 'memory');
  const messages = [];

  // 1. evolving-rules.json — 반복 에러 패턴 로딩
  const rulesPath = join(agentsMemory, 'evolving-rules.json');
  const rules = safeReadJSON(rulesPath);
  if (rules && Array.isArray(rules.patterns) && rules.patterns.length > 0) {
    const critical = rules.patterns.filter((p) => p.count >= 3);
    const warning = rules.patterns.filter((p) => p.count >= 2 && p.count < 3);

    if (critical.length > 0) {
      messages.push(`\u{1F6A8} [진화 규칙] 빈발 에러 ${critical.length}건 (3회+):`);
      for (const rule of critical.slice(0, 5)) {
        messages.push(`  - "${rule.id}" (${rule.count}회, 최근: ${rule.lastSeen})`);
      }
      messages.push('  \u2192 PreToolUse \ucc28\ub2e8 \uaddc\uce59 \uc0dd\uc131 \uad8c\uc7a5. /hookify:hookify \uc0ac\uc6a9.');
    }

    if (warning.length > 0) {
      messages.push(`\u{1F4CB} [\uc9c4\ud654 \uaddc\uce59] \ubc18\ubcf5 \uc5d0\ub7ec ${warning.length}\uac74 (2\ud68c):`);
      for (const rule of warning.slice(0, 3)) {
        messages.push(`  - "${rule.id}" (${rule.count}회)`);
      }
    }
  }

  // 2. failure-cases.md — 최근 장애 사례 수
  const failurePath = join(agentsMemory, 'failure-cases.md');
  const failureText = safeReadText(failurePath);
  if (failureText) {
    const caseCount = countPatterns(failureText, '### \\[\\d{4}-');
    if (caseCount > 0) {
      messages.push(`\u{1F4D6} [\uba54\ubaa8\ub9ac] failure-cases.md: ${caseCount}\uac74 \uc7a5\uc560 \uc0ac\ub840 \ub4f1\ub85d\ub428. \uc720\uc0ac \uc791\uc5c5 \uc2dc \ud655\uc778 \ud544\uc218.`);
    }
  }

  // 3. success-patterns.md — 성공 패턴 수
  const successPath = join(agentsMemory, 'success-patterns.md');
  const successText = safeReadText(successPath);
  if (successText) {
    const patternCount = countPatterns(successText, '### \\[SP-');
    if (patternCount > 0) {
      messages.push(`\u2705 [\uba54\ubaa8\ub9ac] success-patterns.md: ${patternCount}\uac74 \uc131\uacf5 \ud328\ud134 \ub4f1\ub85d\ub428. \uc801\uadf9 \ud65c\uc6a9 \uad8c\uc7a5.`);
    }
  }

  // 4. cli-status.json — CLI 가용성 (이전 세션 캐시)
  const cliStatusPath = join(claudeDir, 'cli-status.json');
  const cliStatus = safeReadJSON(cliStatusPath);
  if (cliStatus) {
    const unavailable = [];
    if (cliStatus.codex === false) unavailable.push('Codex');
    if (cliStatus.gemini === false) unavailable.push('Gemini');
    if (unavailable.length > 0) {
      messages.push(`\u26A0\uFE0F [CLI \uc0c1\ud0dc] \uc774\uc804 \uc138\uc158\uc5d0\uc11c ${unavailable.join(', ')} CLI \ubd88\uac00 \uac10\uc9c0\ub428. cli-health-check\uc774 \uc7ac\uac80\uc99d \uc608\uc815.`);
    }
  }

  // 5. acl-state.json — 미해결 빌드 에러
  const aclStatePath = join(claudeDir, 'acl-state.json');
  const aclState = safeReadJSON(aclStatePath);
  if (aclState && aclState.retries > 0 && aclState.lastError) {
    messages.push(`\u{1F527} [ACL] \uc774\uc804 \uc138\uc158 \ubbf8\ud574\uacb0 \ube4c\ub4dc \uc5d0\ub7ec (${aclState.retries}\ud68c \uc2dc\ub3c4):`);
    messages.push(`  ${aclState.lastError.split('\n')[0]}`);
    messages.push('  \u2192 \uc6b0\uc120 \ud574\uacb0 \uad8c\uc7a5.');
  }

  // 출력
  if (messages.length > 0) {
    process.stderr.write('\n=== \uc138\uc158 \uba54\ubaa8\ub9ac \ub85c\ub4dc (v5.2) ===\n');
    for (const msg of messages) {
      process.stderr.write(msg + '\n');
    }
    process.stderr.write('================================\n\n');
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
