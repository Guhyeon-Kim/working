#!/usr/bin/env node
/**
 * [글로벌] PreToolUse 훅: v6.0 위임 규칙 강제
 *
 * 참조:
 *   - CLAUDE.md §2-5 (delegate.mjs 경유 필수)
 *   - CLAUDE.md §2-1 (7 에이전트 카탈로그)
 *
 * 차단 규칙:
 *   1. Bash에서 codex/gemini 직접 호출 → delegate.mjs 경유 요구
 *      (단 delegate.mjs 안에서의 호출·--version 확인은 허용)
 *   2. Bash argv에 v5.3 에이전트 이름 감지 → v6.0 7 에이전트로 치환 제안
 *   3. WebSearch 직접 사용 → researcher(gemini) 위임
 *   4. WebFetch 비개발 도메인 → researcher 위임
 *   5. Write/Edit 대형 코드 직접 작성 → builder(codex) 위임
 *
 * 경고만(차단 아님):
 *   6. Write/Edit로 v5.3 agents/_archive/ 파일 수정 시도 → 비권장 경고
 *
 * 폴백:
 *   cli-status.json에서 codex/gemini 불가 감지 시 직접 실행 허용
 *   (delegate.mjs 내부 fallback으로 claude가 대신 처리)
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// v6.0 7 에이전트
const V6_AGENTS = ['researcher', 'planner', 'copywriter', 'designer', 'builder', 'tester', 'curator'];

// v5.3 잔재 — Bash argv나 파일 경로에서 감지되면 차단/경고
// target 이름 (delegate.mjs 구 인터페이스 <cli> <target> <task>) + 에이전트 파일명
const V5_TARGETS = ['frontend', 'backend', 'research', 'design', 'education', 'marketing'];
const V5_AGENT_FILENAMES = [
  'pm-agent', 'qa-agent', 'data-agent', 'infra-agent', 'security-agent',
  'marketing-agent', 'research-agent', 'delegation_workflow',
  'frontend-agent', 'backend-agent', 'design-agent', 'context-agent',
];

// v5.3 → v6.0 매핑 힌트 (안내 메시지용)
const V5_TO_V6_HINT = {
  frontend: 'builder', backend: 'builder',
  research: 'researcher', 'research-agent': 'researcher',
  design: 'designer', 'design-agent': 'designer',
  education: 'copywriter', marketing: 'copywriter', 'marketing-agent': 'copywriter',
  'pm-agent': 'planner',
  'qa-agent': 'tester',
  'data-agent': 'builder',
  'infra-agent': 'builder',
  'security-agent': 'builder',
  'frontend-agent': 'builder', 'backend-agent': 'builder',
  'context-agent': 'curator',
  delegation_workflow: '(삭제됨 — 대신 docs/current/design-decisions.md 참조)',
};

function loadCliStatus() {
  try {
    const statusPath = join(process.cwd(), '.claude', 'cli-status.json');
    return JSON.parse(readFileSync(statusPath, 'utf8'));
  } catch {
    return { codex: true, gemini: true };
  }
}

function formatV6Hint(matched) {
  const lines = matched.map(m => `  ${m.padEnd(20)} → ${V5_TO_V6_HINT[m] || '(매핑 없음 — CLAUDE.md §2-1 확인)'}`);
  return lines.join('\n');
}

let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    process.exit(0); // JSON 파싱 실패 시 차단하지 않음
  }

  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const cliStatus = loadCliStatus();

  // ─── Rule 0: delegate.mjs 경유 호출은 모두 통과 ───
  if (toolName === 'Bash') {
    const cmd = toolInput.command || '';
    if (cmd.includes('delegate.mjs')) {
      process.exit(0);
    }
  }

  // ─── Rule 1: Bash — 직접 codex/gemini 호출 차단 ───
  if (toolName === 'Bash') {
    const cmd = toolInput.command || '';
    const cmdLow = cmd.toLowerCase();
    const isVersion = /--version|\s-v(\s|$)|\sversion(\s|$)/.test(cmdLow);

    if (!isVersion) {
      for (const cli of ['codex', 'gemini']) {
        const re = new RegExp(`\\b${cli}\\b`);
        if (re.test(cmdLow)) {
          if (cliStatus[cli] === false) {
            process.stderr.write(`[폴백 모드] ${cli} CLI 불가 — CTO 직접 실행 허용\n`);
          } else {
            process.stderr.write(
              `[위임 규칙 위반] ${cli} CLI 직접 호출 금지. delegate.mjs 경유 필수.\n` +
              `  대체: node scripts/delegate.mjs <agent> "<task>"\n` +
              `  7 에이전트: ${V6_AGENTS.join(', ')}\n` +
              `  참조: CLAUDE.md §2-5\n`
            );
            process.exit(1);
          }
        }
      }
    }

    // Rule 2: Bash argv에 v5.3 target/에이전트 이름 감지 (delegate.mjs 외)
    const v5Matched = [];
    for (const name of V5_TARGETS) {
      const re = new RegExp(`\\b${name}\\b`);
      if (re.test(cmdLow)) v5Matched.push(name);
    }
    for (const name of V5_AGENT_FILENAMES) {
      if (cmdLow.includes(name)) v5Matched.push(name);
    }
    if (v5Matched.length > 0) {
      process.stderr.write(
        `[위임 규칙 위반] v5.3 이름 사용: ${[...new Set(v5Matched)].join(', ')}\n` +
        `  v6.0 매핑:\n${formatV6Hint([...new Set(v5Matched)])}\n` +
        `  참조: CLAUDE.md §2-1\n`
      );
      process.exit(1);
    }
  }

  // ─── Rule 3: WebSearch 직접 사용 차단 ───
  if (toolName === 'WebSearch') {
    process.stderr.write(
      `[위임 규칙 위반] WebSearch 직접 사용 금지. researcher(gemini)로 위임하세요.\n` +
      `  대체: node scripts/delegate.mjs researcher "<검색 주제>"\n` +
      `  참조: CLAUDE.md §2-5\n`
    );
    process.exit(1);
  }

  // ─── Rule 4: WebFetch 비개발 도메인 차단 ───
  if (toolName === 'WebFetch') {
    const url = (toolInput.url || '').toLowerCase();
    const allowedDomains = [
      'github.com', 'raw.githubusercontent.com',
      'npmjs.com', 'registry.npmjs.org',
      'nextjs.org', 'react.dev', 'tailwindcss.com',
      'supabase.com', 'vercel.com',
      'developer.mozilla.org', 'nodejs.org',
      'typescriptlang.org', 'pypi.org',
      'fastapi.tiangolo.com', 'docs.python.org',
      'notion.com', 'notion.so',
      'claude.com', 'anthropic.com',
    ];
    const isAllowed = allowedDomains.some(d => url.includes(d));
    if (!isAllowed) {
      process.stderr.write(
        `[위임 규칙 위반] WebFetch 리서치 목적 사용 금지. 개발 문서 참조만 허용.\n` +
        `  일반 리서치는 researcher(gemini)로 위임: node scripts/delegate.mjs researcher "<주제>"\n` +
        `  참조: CLAUDE.md §2-5\n`
      );
      process.exit(1);
    }
  }

  // ─── Rule 5: Write/Edit — 대형 코드 직접 작성 차단 ───
  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = (toolInput.file_path || '').toLowerCase();
    const isCode = /\.(tsx?|jsx?|py|sql|css)$/.test(filePath);
    if (isCode) {
      const newContent = toolInput.content || toolInput.new_string || '';
      const lines = newContent.split('\n').filter(l => l.trim().length > 0);
      const threshold = cliStatus.codex === false ? 50 : 10;
      if (lines.length > threshold) {
        process.stderr.write(
          `[위임 규칙 위반] 코드 ${lines.length}줄 직접 작성 시도 (임계값: ${threshold}줄).\n` +
          `  builder(codex)로 위임: node scripts/delegate.mjs builder "<작업>"\n` +
          `  참조: CLAUDE.md §2-5\n`
        );
        process.exit(1);
      }
    }

    // Rule 6: v5.3 archive 파일 수정 경고 (차단 아님)
    if (filePath.includes('agents/_archive/') || filePath.includes('skills/_archive/') || filePath.includes('docs/asis/')) {
      process.stderr.write(
        `[경고] v5.3 archive 파일 수정 시도: ${toolInput.file_path}\n` +
        `  archive는 스냅샷. 변경은 CLAUDE.md §3-2 "유형 A" 버전업 원칙에 맞는지 확인하세요.\n`
      );
      // 차단 없이 통과
    }
  }

  process.exit(0);
});
