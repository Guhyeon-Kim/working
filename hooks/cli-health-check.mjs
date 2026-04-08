```javascript
/**
 * [글로벌] PreToolUse 훅: delegation_workflow.md §7 위임 품질 강제
 * 
 * v1.0: 차단만 (직접 호출 금지)
 * v2.0: 차단 + 가이드 (delegate.mjs 사용 강제 + 패킷 검증)
 *
 * 변경점:
 * - Rule 1,2: "위임하라"가 아니라 "delegate.mjs로 위임하라"로 구체화
 * - Rule 4: 코드 줄 차단 시 delegate.mjs 명령어 예시 제공
 * - Rule 5 추가: delegate.mjs 없이 codex/gemini 호출 시 패킷 누락 경고
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function loadCliStatus() {
  try {
    const statusPath = join(process.cwd(), '.claude', 'cli-status.json');
    return JSON.parse(readFileSync(statusPath, 'utf8'));
  } catch {
    return { codex: true, gemini: true };
  }
}

function inferTarget(command) {
  if (/\bfrontend\b|\b-C\s*frontend\b/i.test(command)) return 'frontend';
  if (/\bbackend\b|\b-C\s*backend\b/i.test(command)) return 'backend';
  return 'frontend'; // 기본값
}

function inferGeminiTarget(command) {
  if (/디자인|design|ui|화면/i.test(command)) return 'design';
  if (/교육|education|학습/i.test(command)) return 'education';
  if (/마케팅|marketing|그로스/i.test(command)) return 'marketing';
  return 'research'; // 기본값
}

let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    process.exit(0);
  }
  
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const cliStatus = loadCliStatus();

  if (toolName === 'Bash') {
    const cmd = (toolInput.command || '');
    const cmdLower = cmd.toLowerCase();
    
    // ── delegate.mjs를 통한 호출은 항상 허용 ──
    if (cmd.includes('delegate.mjs')) {
      process.exit(0);
    }

    // ── Rule 1: Gemini CLI 직접 호출 차단 → delegate.mjs로 유도 ──
    if (/\bgemini\b/.test(cmdLower) && !/version|--version|-v/.test(cmdLower)) {
      if (cliStatus.gemini === false) {
        process.stderr.write('[폴백 모드] gemini CLI 불가 — CTO 직접 실행 허용\n');
      } else {
        const target = inferGeminiTarget(cmd);
        process.stderr.write(
          '[위임 규칙 위반] gemini CLI 직접 호출 금지.\n' +
          '컨텍스트 패킷이 자동 조립되는 delegate.mjs를 사용하세요:\n\n' +
          `  node ~/.claude/scripts/delegate.mjs gemini ${target} "작업 내용"\n\n` +
          '이유: 직접 호출 시 프로젝트 컨텍스트, 기대 산출물 형식, 인코딩 규칙이 누락됩니다.\n' +
          '(delegation_workflow.md §7)'
        );
        process.exit(1);
      }
    }

    // ── Rule 2: Codex CLI 직접 호출 차단 → delegate.mjs로 유도 ──
    if (/\bcodex\b/.test(cmdLower) && !/version|--version|-v/.test(cmdLower)) {
      if (cliStatus.codex === false) {
        process.stderr.write('[폴백 모드] codex CLI 불가 — CTO 직접 실행 허용\n');
      } else {
        const target = inferTarget(cmd);
        process.stderr.write(
          '[위임 규칙 위반] codex CLI 직접 호출 금지.\n' +
          '컨텍스트 패킷이 자동 조립되는 delegate.mjs를 사용하세요:\n\n' +
          `  node ~/.claude/scripts/delegate.mjs codex ${target} "작업 내용"\n\n` +
          '이유: 직접 호출 시 API 명세, 디자인 명세, 반복 버그 레지스트리, 코딩 규칙이 누락됩니다.\n' +
          '패킷은 .claude/delegation/에 자동 저장되어 감사 추적이 가능합니다.\n' +
          '(delegation_workflow.md §7)'
        );
        process.exit(1);
      }
    }
  }

  // ── Rule 3: WebSearch 차단 (기존 유지) ──
  if (toolName === 'WebSearch') {
    process.stderr.write(
      '[위임 규칙 위반] WebSearch 직접 사용 금지.\n' +
      'research-agent 또는 delegate.mjs를 사용하세요:\n\n' +
      '  node ~/.claude/scripts/delegate.mjs gemini research "검색할 내용"\n\n' +
      '(delegation_workflow.md §7)'
    );
    process.exit(1);
  }

  // ── Rule 3b: WebFetch 도메인 제한 (기존 유지) ──
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
        '[위임 규칙 위반] WebFetch 리서치 목적 사용 금지.\n' +
        '개발 문서 참조만 허용. 일반 리서치는:\n\n' +
        '  node ~/.claude/scripts/delegate.mjs gemini research "검색할 내용"\n\n' +
        '(delegation_workflow.md §7)'
      );
      process.exit(1);
    }
  }

  // ── Rule 4: 대량 코드 직접 작성 차단 → delegate.mjs로 유도 ──
  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = (toolInput.file_path || '').toLowerCase();
    const isCode = /\.(tsx?|jsx?|py|sql|css)$/.test(filePath);
    if (isCode) {
      const newContent = toolInput.content || toolInput.new_string || '';
      const lines = newContent.split('\n').filter(l => l.trim().length > 0);
      const threshold = cliStatus.codex === false ? 50 : 3;
      if (lines.length > threshold) {
        const target = filePath.includes('frontend') ? 'frontend' : 'backend';
        process.stderr.write(
          `[위임 규칙 위반] 코드 ${lines.length}줄 직접 작성 시도 (임계값: ${threshold}줄).\n` +
          'delegate.mjs를 통해 Codex에 위임하세요:\n\n' +
          `  node ~/.claude/scripts/delegate.mjs codex ${target} "작업 내용"\n\n` +
          '이유: delegate.mjs가 API 명세·디자인 명세·반복 버그 레지스트리를\n' +
          '자동으로 패킷에 포함시켜 Codex에 전달합니다.\n' +
          '(delegation_workflow.md §7)'
        );
        process.exit(1);
      }
    }
  }

  process.exit(0);
});
```
