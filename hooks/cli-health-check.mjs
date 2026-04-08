import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

let data = '';

function checkCli(command) {
  try {
    const version = execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 3000,
    }).trim();

    return {
      available: true,
      version,
    };
  } catch {
    return {
      available: false,
      version: null,
    };
  }
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

process.stdin.on('data', (chunk) => {
  data += chunk;
});

process.stdin.on('end', () => {
  try {
    const codex = checkCli('codex --version');
    const gemini = checkCli('gemini --version');
    const claudeDir = findClaudeDir();
    const statusPath = path.join(claudeDir, 'cli-status.json');
    const payload = {
      codex: codex.available,
      gemini: gemini.available,
      checkedAt: new Date().toISOString(),
      codexVersion: codex.version,
      geminiVersion: gemini.version,
    };

    writeFileSync(statusPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    if (!codex.available && !gemini.available) {
      process.stderr.write('[폴백 모드] Codex + Gemini CLI 모두 미응답 — 완전 폴백 모드\n');
    } else if (!codex.available) {
      process.stderr.write('[폴백 모드] Codex CLI 미응답 — CTO 직접 구현 허용\n');
    } else if (!gemini.available) {
      process.stderr.write('[폴백 모드] Gemini CLI 미응답 — CTO 직접 리서치 수행\n');
    }
  } catch {
    // Hook failures must not block the main workflow.
  } finally {
    process.exit(0);
  }
});

process.stdin.resume();
