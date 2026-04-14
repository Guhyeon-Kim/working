#!/usr/bin/env node
/**
 * PreToolUse 훅: Write/Edit 대상 콘텐츠에서 secret 패턴 감지 → 차단
 *
 * 동작:
 *   - stdin: { tool_name, tool_input: { file_path, content|new_string, ... } }
 *   - 매칭되면 stderr 경고 + exit 2 (Claude에게 차단 이유 전달)
 *   - 허용 파일(.env.example, *.md 문서 예시) 일부 예외 처리
 */

// 순서 중요: 더 구체적인 패턴(Anthropic `sk-ant-`)이 먼저 와야 네거티브 lookahead로 배제된 일반 패턴과 충돌 없음.
const PATTERNS = [
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{50,}\b/ },
  { name: 'OpenAI project key', re: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'OpenAI classic key', re: /\bsk-(?!ant-|proj-)[A-Za-z0-9]{40,}\b/ },
  { name: 'GitHub classic PAT', re: /\bghp_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/ },
  { name: 'GitHub OAuth token', re: /\bgho_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub server-to-server', re: /\bghs_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub user-to-server', re: /\bghu_[A-Za-z0-9]{30,}\b/ },
  { name: 'Google API key', re: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { name: 'AWS Access Key ID', re: /\bAKIA[A-Z0-9]{16}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Supabase service key', re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/, hint: 'JWT (Supabase service_role/anon 가능성)' },
  { name: 'Private key PEM', re: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |)PRIVATE KEY-----/ },
  { name: 'Stripe live key', re: /\bsk_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'Password assignment', re: /\b(?:password|passwd|pwd)\s*[:=]\s*["'][^"'\s]{6,}["']/i, hint: '하드코딩된 비밀번호' },
];

// 경고만 하고 차단하지 않을 파일 (문서화 목적의 예시 포함 가능)
const EXEMPT_PATH_RE = /(?:\.env\.example|\.env\.sample|README\.md|CHANGELOG\.md|docs\/.*\.md)$/i;

async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });
}

function extractContent(toolName, input) {
  if (!input) return '';
  // Write: content; Edit: new_string + old_string 변화만 보고 싶지만 new_string에 들어가면 결국 파일에 기록되므로 검사
  if (toolName === 'Write') return String(input.content || '');
  if (toolName === 'Edit') return String(input.new_string || '');
  if (toolName === 'NotebookEdit') return String(input.new_source || '');
  return '';
}

function scan(text) {
  const hits = [];
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      const idx = m.index ?? 0;
      const context = text.slice(Math.max(0, idx - 20), idx + m[0].length + 20);
      hits.push({ name: p.name, match: m[0].slice(0, 12) + '…', hint: p.hint, context: context.replace(/\s+/g, ' ').slice(0, 80) });
    }
  }
  return hits;
}

(async () => {
  try {
    const raw = await readStdin();
    if (!raw.trim()) process.exit(0);

    let event;
    try { event = JSON.parse(raw); } catch { process.exit(0); }

    const toolName = event.tool_name || event.tool || '';
    const input = event.tool_input || {};
    if (!['Write', 'Edit', 'NotebookEdit'].includes(toolName)) process.exit(0);

    const text = extractContent(toolName, input);
    if (!text) process.exit(0);

    const hits = scan(text);
    if (hits.length === 0) process.exit(0);

    const filePath = String(input.file_path || input.notebook_path || '');
    const exempt = EXEMPT_PATH_RE.test(filePath);

    // stderr 리포트
    const msg = [];
    msg.push('[Secret Scan] 민감정보 패턴 감지:');
    for (const h of hits) {
      msg.push(`  - ${h.name}${h.hint ? ` (${h.hint})` : ''}: ${h.match}  [..${h.context}..]`);
    }
    msg.push('');

    if (exempt) {
      msg.push(`경로가 예외(${filePath}) — 문서화 목적으로 가정, 차단하지 않음.`);
      msg.push('정말 실제 secret이면 즉시 revoke하고 환경변수/Secret Manager로 옮기세요.');
      process.stderr.write(msg.join('\n') + '\n');
      process.exit(0);
    }

    msg.push(`파일: ${filePath}`);
    msg.push('→ 차단: secret을 코드에 기록하지 마세요.');
    msg.push('  1) 즉시 해당 토큰 revoke (탈취 가정)');
    msg.push('  2) 환경변수 또는 Codespace Secret에 저장');
    msg.push('  3) 코드에서는 process.env.X_KEY 로 참조');
    process.stderr.write(msg.join('\n') + '\n');

    // exit 2 → Claude에게 차단 메시지 전달
    process.exit(2);
  } catch {
    process.exit(0);
  }
})();
