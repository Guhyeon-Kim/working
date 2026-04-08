/**
 * [글로벌] PreToolUse 훅: delegation_workflow.md §7 토큰 최적화 3원칙 강제
 *
 * 차단 규칙:
 * 1. Bash에서 gemini CLI 직접 호출 → research-agent 위임
 * 2. Bash에서 codex CLI 직접 호출 → /codex:rescue 플러그인
 * 3. WebSearch/WebFetch 리서치 목적 → research-agent 위임
 * 4. Write/Edit 코드 4줄 이상 → Codex 플러그인 위임
 */

import { readFileSync } from 'fs';
import { join } from 'path';

function loadCliStatus() {
  try {
    const statusPath = join(process.cwd(), '.claude', 'cli-status.json');
    return JSON.parse(readFileSync(statusPath, 'utf8'));
  } catch {
    return { codex: true, gemini: true };
  }
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

  // Rule 0: delegate.mjs를 통한 호출은 항상 허용
  if (toolName === 'Bash') {
    const cmd = (toolInput.command || '');
    if (cmd.includes('delegate.mjs')) {
      process.exit(0);
    }
  }

  // Rule 1: Block direct gemini CLI calls (폴백: gemini 불가 시 우회)
  if (toolName === 'Bash') {
    const cmd = (toolInput.command || '').toLowerCase();
    if (/\bgemini\b/.test(cmd) && !/version|--version|-v/.test(cmd)) {
      if (cliStatus.gemini === false) {
        process.stderr.write('[폴백 모드] gemini CLI 불가 — CTO 직접 실행 허용\n');
      } else {
        process.stderr.write(
          '[위임 규칙 위반] gemini CLI 직접 호출 금지. ' +
          'research-agent (Agent subagent_type="research-agent")로 위임하세요. ' +
          '(delegation_workflow.md §7)'
        );
        process.exit(1);
      }
    }

    // Rule 2: Block direct codex CLI calls (폴백: codex 불가 시 우회)
    if (/\bcodex\b/.test(cmd) && !/version|--version|-v/.test(cmd)) {
      if (cliStatus.codex === false) {
        process.stderr.write('[폴백 모드] codex CLI 불가 — CTO 직접 실행 허용\n');
      } else {
        process.stderr.write(
          '[위임 규칙 위반] codex CLI 직접 호출 금지. ' +
          '/codex:rescue 플러그인 스킬을 사용하세요. ' +
          '(delegation_workflow.md §7)'
        );
        process.exit(1);
      }
    }
  }

  // Rule 3: Block direct WebSearch
  if (toolName === 'WebSearch') {
    process.stderr.write(
      '[위임 규칙 위반] WebSearch 직접 사용 금지. ' +
      'research-agent (Gemini CLI)로 위임하세요. ' +
      '(delegation_workflow.md §7)'
    );
    process.exit(1);
  }

  // Rule 3b: Block WebFetch for non-dev domains
  if (toolName === 'WebFetch') {
    const url = (toolInput.url || '').toLowerCase();
    const allowedDomains = [
      'github.com', 'raw.githubusercontent.com',
      'npmjs.com', 'registry.npmjs.org',
      'nextjs.org', 'react.dev', 'tailwindcss.com',
      'supabase.com', 'vercel.com',
      'developer.mozilla.org', 'nodejs.org',
      'typescriptlang.org', 'pypi.org',
      'fastapi.tiangolo.com', 'docs.python.org'
    ];
    const isAllowed = allowedDomains.some(d => url.includes(d));
    if (!isAllowed) {
      process.stderr.write(
        '[위임 규칙 위반] WebFetch 리서치 목적 사용 금지. ' +
        '개발 문서 참조만 허용. 일반 리서치는 research-agent로 위임하세요. ' +
        '(delegation_workflow.md §7)'
      );
      process.exit(1);
    }
  }

  // Rule 4: Block large code writes (폴백: codex 불가 시 50줄까지 허용)
  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = (toolInput.file_path || '').toLowerCase();
    const isCode = /\.(tsx?|jsx?|py|sql|css)$/.test(filePath);
    if (isCode) {
      const newContent = toolInput.content || toolInput.new_string || '';
      const lines = newContent.split('\n').filter(l => l.trim().length > 0);
      const threshold = cliStatus.codex === false ? 50 : 10;
      if (lines.length > threshold) {
        process.stderr.write(
          `[위임 규칙 위반] 코드 ${lines.length}줄 직접 작성 시도 (임계값: ${threshold}줄). ` +
          '/codex:rescue 플러그인으로 위임하세요. ' +
          '(delegation_workflow.md §7)'
        );
        process.exit(1);
      }
    }
  }

  process.exit(0);
});
