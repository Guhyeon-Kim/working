import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';

let data = '';

function checkCli(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', timeout: 3000 });
  if (res.status === 0 && res.stdout) return { available: true, version: res.stdout.trim() };
  return { available: false, version: null };
}

function findClaudeDir() {
  let currentDir = process.cwd();
  const { root } = path.parse(currentDir);

  while (true) {
    const candidate = path.join(currentDir, '.claude');
    try {
      mkdirSync(candidate, { recursive: false });
      return candidate;
    } catch (error) {
      if (error && error.code !== 'EEXIST') {
        if (currentDir === root) {
          const fallback = path.join(process.cwd(), '.claude');
          mkdirSync(fallback, { recursive: true });
          return fallback;
        }
      } else {
        return candidate;
      }
    }
    if (currentDir === root) {
      const fallback = path.join(process.cwd(), '.claude');
      mkdirSync(fallback, { recursive: true });
      return fallback;
    }
    currentDir = path.dirname(currentDir);
  }
}

// ───────────────────────────────────────────────
// MCP 상태 체크 (24시간 throttling)
// ───────────────────────────────────────────────
function checkMcpHealth(previousStatus) {
  const last = previousStatus?.mcpCheckedAt ? new Date(previousStatus.mcpCheckedAt).getTime() : 0;
  const elapsed = Date.now() - last;
  const DAY = 24 * 60 * 60 * 1000;

  if (elapsed < DAY && previousStatus?.mcp) {
    return { ...previousStatus.mcp, throttled: true };
  }

  const res = spawnSync('claude', ['mcp', 'list'], { encoding: 'utf8', timeout: 10000 });
  if (res.status !== 0 || !res.stdout) {
    return { connected: [], failed: ['cli_error'], mcpCheckedAt: new Date().toISOString() };
  }

  const lines = res.stdout.split('\n');
  const connected = [];
  const failed = [];
  for (const line of lines) {
    const okMatch = line.match(/^([\w.@:\- ]+?):.*?✓\s*Connected/);
    const failMatch = line.match(/^([\w.@:\- ]+?):.*?(✗|!)\s*(Failed|Needs)/);
    if (okMatch) connected.push(okMatch[1].trim());
    else if (failMatch) failed.push(failMatch[1].trim());
  }
  return { connected, failed, mcpCheckedAt: new Date().toISOString() };
}

// ───────────────────────────────────────────────
// GitHub PAT 만료 감지 (24시간 throttling)
// ───────────────────────────────────────────────
async function checkGithubTokenExpiry(previousStatus) {
  const last = previousStatus?.githubTokenCheckedAt ? new Date(previousStatus.githubTokenCheckedAt).getTime() : 0;
  const elapsed = Date.now() - last;
  const DAY = 24 * 60 * 60 * 1000;

  if (elapsed < DAY && previousStatus?.githubToken) {
    return { ...previousStatus.githubToken, throttled: true };
  }

  try {
    const home = process.env.HOME;
    const configPath = path.join(home, '.claude.json');
    if (!existsSync(configPath)) return { status: 'no_config', githubTokenCheckedAt: new Date().toISOString() };

    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    const gh = cfg.mcpServers?.github;
    const auth = gh?.headers?.Authorization || '';
    const token = auth.replace(/^Bearer\s+/, '');

    if (!token || !token.startsWith('github_pat_')) {
      return { status: 'no_fine_grained_pat', githubTokenCheckedAt: new Date().toISOString() };
    }

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5000);
    try {
      const resp = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'claude-code-cli-health' },
        signal: controller.signal,
      });
      clearTimeout(tid);

      if (!resp.ok) {
        return { status: `http_${resp.status}`, githubTokenCheckedAt: new Date().toISOString() };
      }

      // 1) API 헤더에서 만료일 추출 시도 (classic PAT만 제공)
      const expiration = resp.headers.get('github-authentication-token-expiration');
      // 2) 없으면 환경변수 GH_MCP_TOKEN_EXPIRES 사용 (권장 방식: Codespace Secret)
      const hintRaw = process.env.GH_MCP_TOKEN_EXPIRES;
      const expiration2 = hintRaw ? new Date(hintRaw).toISOString() : null;
      const expiry = expiration || expiration2;

      if (!expiry) {
        // 토큰은 유효하지만 만료일 정보 없음
        return { status: 'valid_no_expiry_info', githubTokenCheckedAt: new Date().toISOString() };
      }

      const expiryDate = new Date(expiry);
      if (isNaN(expiryDate.getTime())) {
        return { status: 'valid_no_expiry_info', githubTokenCheckedAt: new Date().toISOString() };
      }
      const daysLeft = Math.floor((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      return { status: 'ok', expiresAt: expiryDate.toISOString(), daysLeft, githubTokenCheckedAt: new Date().toISOString() };
    } catch (err) {
      clearTimeout(tid);
      return { status: 'fetch_error', error: err.message, githubTokenCheckedAt: new Date().toISOString() };
    }
  } catch (err) {
    return { status: 'read_error', error: err.message, githubTokenCheckedAt: new Date().toISOString() };
  }
}

process.stdin.on('data', (chunk) => { data += chunk; });

process.stdin.on('end', async () => {
  try {
    const claudeDir = findClaudeDir();
    const statusPath = path.join(claudeDir, 'cli-status.json');

    let previous = null;
    try { previous = JSON.parse(readFileSync(statusPath, 'utf8')); } catch {}

    const codex = checkCli('codex', ['--version']);
    const gemini = checkCli('gemini', ['--version']);
    const mcp = checkMcpHealth(previous);
    const githubToken = await checkGithubTokenExpiry(previous);

    const payload = {
      codex: codex.available,
      gemini: gemini.available,
      checkedAt: new Date().toISOString(),
      codexVersion: codex.version,
      geminiVersion: gemini.version,
      mcp: { connected: mcp.connected, failed: mcp.failed },
      mcpCheckedAt: mcp.mcpCheckedAt || previous?.mcpCheckedAt,
      githubToken: {
        status: githubToken.status,
        expiresAt: githubToken.expiresAt,
        daysLeft: githubToken.daysLeft,
      },
      githubTokenCheckedAt: githubToken.githubTokenCheckedAt || previous?.githubTokenCheckedAt,
    };

    writeFileSync(statusPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    if (!codex.available && !gemini.available) {
      process.stderr.write('[폴백 모드] Codex + Gemini CLI 모두 미응답\n');
    } else if (!codex.available) {
      process.stderr.write('[폴백 모드] Codex CLI 미응답 — CTO 직접 구현 허용\n');
    } else if (!gemini.available) {
      process.stderr.write('[폴백 모드] Gemini CLI 미응답 — CTO 직접 리서치 수행\n');
    }

    if (!mcp.throttled && mcp.failed && mcp.failed.length > 0) {
      process.stderr.write(`[MCP 경고] 연결 실패: ${mcp.failed.join(', ')}\n`);
    }

    if (!githubToken.throttled && githubToken.status === 'ok' && typeof githubToken.daysLeft === 'number') {
      if (githubToken.daysLeft < 0) {
        process.stderr.write(`[GitHub PAT 만료] ${githubToken.expiresAt} — 재발급 필요\n`);
      } else if (githubToken.daysLeft <= 30) {
        process.stderr.write(`[GitHub PAT 만료 임박] ${githubToken.daysLeft}일 남음 (${githubToken.expiresAt})\n`);
      }
    } else if (!githubToken.throttled && githubToken.status && !['ok', 'no_config', 'no_fine_grained_pat', 'valid_no_expiry_info'].includes(githubToken.status)) {
      process.stderr.write(`[GitHub PAT 체크 실패] ${githubToken.status}\n`);
    }
  } catch {
    // Hook failures must not block the main workflow.
  } finally {
    process.exit(0);
  }
});

process.stdin.resume();
