import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const cwd = process.cwd();
const claudeDir = path.join(cwd, '.claude');
const statePath = path.join(claudeDir, 'gc-state.json');
const reportPath = path.join(claudeDir, 'gc-report.md');

function readStdin() {
  try {
    fs.readFileSync(0, 'utf8');
  } catch {
    // Ignore stdin read failures and continue.
  }
}

function loadState() {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      lastRun: typeof parsed.lastRun === 'string' ? parsed.lastRun : null,
      intervalHours:
        typeof parsed.intervalHours === 'number' && Number.isFinite(parsed.intervalHours)
          ? parsed.intervalHours
          : 24,
    };
  } catch {
    return null;
  }
}

function shouldRun(state) {
  if (!state || !state.lastRun) {
    return true;
  }

  const lastRunTime = Date.parse(state.lastRun);
  if (Number.isNaN(lastRunTime)) {
    return true;
  }

  const elapsedMs = Date.now() - lastRunTime;
  return elapsedMs >= state.intervalHours * 60 * 60 * 1000;
}

function writeFileEnsured(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function main() {
  readStdin();

  const state = loadState();
  if (!shouldRun(state)) {
    process.exit(0);
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  const scanScriptPath = fileURLToPath(new URL('../scripts/quality-scan.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [scanScriptPath], {
    cwd,
    encoding: 'utf8',
    timeout: 10000,
  });

  const reportContent = typeof result.stdout === 'string' ? result.stdout : '';
  writeFileEnsured(reportPath, reportContent);

  const nextState = {
    lastRun: new Date().toISOString(),
    intervalHours: state?.intervalHours ?? 24,
  };
  writeFileEnsured(statePath, `${JSON.stringify(nextState, null, 2)}\n`);

  process.stderr.write('GC 스캔이 완료되었습니다. 결과는 .claude/gc-report.md에서 확인할 수 있습니다.\n');
  process.exit(0);
}

try {
  main();
} catch {
  process.exit(0);
}
