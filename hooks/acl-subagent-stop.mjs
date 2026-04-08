#!/usr/bin/env node

/**
 * acl-subagent-stop.mjs (v2.0)
 * SubagentStop 훅: 서브에이전트 종료 후 타입 체크 + 빌드 자동 검증
 *
 * v2.0 변경:
 *   - execSync → execFileSync (보안 강화)
 *   - 빌드 캐시: 동일 코드 상태에서 중복 빌드 방지
 */

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// 1. stdin에서 JSON 읽기
const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
const stdinText = Buffer.concat(chunks).toString("utf-8");

let input;
try {
  input = JSON.parse(stdinText);
} catch {
  process.exit(0);
}

const cwd = process.cwd();

// 2. package.json 존재 확인
if (!existsSync(join(cwd, "package.json"))) {
  process.exit(0);
}

// 2-b. 빌드 캐시: 마지막 성공 빌드의 git hash + diff 비교
const buildCachePath = join(cwd, ".claude", "build-cache.json");
let currentHash = "";
try {
  currentHash = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd, encoding: "utf-8", timeout: 5000,
  }).trim();
} catch { /* ignore */ }

if (currentHash) {
  try {
    const cache = JSON.parse(readFileSync(buildCachePath, "utf-8"));
    const diffOutput = execFileSync("git", ["diff", "HEAD", "--name-only"], {
      cwd, encoding: "utf-8", timeout: 5000,
    }).trim();
    if (cache.hash === currentHash && !diffOutput) {
      process.stderr.write("\u2705 [SubagentStop] \uBE4C\uB4DC \uCE90\uC2DC \uD788\uD2B8 \u2014 \uC2A4\uD0B5\n");
      process.exit(0);
    }
  } catch { /* cache miss */ }
}

// 3. src/ 변경 파일 확인
let diffOutput = "";
try {
  diffOutput = execFileSync("git", ["diff", "--name-only", "HEAD"], {
    cwd, encoding: "utf-8", timeout: 10000,
  });
} catch {
  process.exit(0);
}

const srcChanges = diffOutput.split("\n").filter((line) => line.startsWith("src/"));
if (srcChanges.length === 0) {
  process.exit(0);
}

function extractErrors(output) {
  return output
    .split("\n")
    .filter((line) => /error|Error|failed/.test(line))
    .slice(0, 5)
    .join("\n");
}

const logPath = join(cwd, ".claude", "quality-gate-log.md");
const now = new Date().toISOString();

// 4a. 타입 체크
let tscPassed = false;
try {
  execFileSync("npx", ["tsc", "--noEmit"], {
    cwd, encoding: "utf-8", timeout: 60000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  tscPassed = true;
} catch (err) {
  const combined = (err.stdout || "") + "\n" + (err.stderr || "");
  const errors = extractErrors(combined);
  process.stderr.write(
    `\u26A0\uFE0F [SubagentStop] \uD0C0\uC785 \uCCB4\uD06C \uC2E4\uD328\n\uC5D0\uB7EC: ${errors}\n\u2192 \uC218\uC815 \uD6C4 \uC7AC\uAC80\uC99D\uD558\uC138\uC694.\n`
  );
  process.exit(0);
}

// 4b. 빌드
let buildPassed = false;
try {
  execFileSync("npm", ["run", "build"], {
    cwd, encoding: "utf-8", timeout: 60000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  buildPassed = true;
} catch (err) {
  const combined = (err.stdout || "") + "\n" + (err.stderr || "");
  const errors = extractErrors(combined);
  process.stderr.write(
    `\u26A0\uFE0F [SubagentStop] \uBE4C\uB4DC \uC2E4\uD328\n\uC5D0\uB7EC: ${errors}\n\u2192 \uBE4C\uB4DC \uC5D0\uB7EC\uB97C \uC218\uC815\uD558\uC138\uC694.\n`
  );
  process.exit(0);
}

// 5. 모두 성공
if (tscPassed && buildPassed) {
  const logDir = join(cwd, ".claude");
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

  const record = `| ${now} | ${input.agent_name || "unknown"} | PASS | \uD0C0\uC785 \uCCB4\uD06C + \uBE4C\uB4DC \uC131\uACF5 |\n`;
  if (!existsSync(logPath)) {
    appendFileSync(logPath, "| \uC2DC\uAC01 | \uC5D0\uC774\uC804\uD2B8 | \uACB0\uACFC | \uC0C1\uC138 |\n|---|---|---|---|\n" + record, "utf-8");
  } else {
    appendFileSync(logPath, record, "utf-8");
  }

  // 빌드 캐시 저장
  if (currentHash) {
    try {
      writeFileSync(buildCachePath, JSON.stringify({
        hash: currentHash,
        passedAt: now,
        agent: input.agent_name || "unknown",
      }, null, 2) + "\n", "utf-8");
    } catch { /* ignore */ }
  }

  process.stderr.write("\u2705 [SubagentStop] \uD0C0\uC785 \uCCB4\uD06C + \uBE4C\uB4DC PASS\n");
}

process.exit(0);
