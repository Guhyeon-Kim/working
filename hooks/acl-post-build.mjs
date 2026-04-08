#!/usr/bin/env node
// acl-post-build.mjs — PostToolUse(Bash) hook
// 빌드/타입체크/린트 명령 실행 후 에러 감지 시 자동 교정 지시

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const BUILD_PATTERNS = [
  /npm\s+run\s+build/,
  /npx\s+tsc/,
  /npm\s+run\s+lint/,
  /npx\s+next\s+build/,
  /npx\s+eslint/,
];

const ERROR_PATTERNS = [
  /error TS\d+/i,
  /Error:/,
  /SyntaxError/,
  /Module not found/,
];

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

function isBuildCommand(command) {
  return BUILD_PATTERNS.some((p) => p.test(command));
}

function extractErrorLines(stderr) {
  if (!stderr) return [];
  const lines = stderr.split("\n");
  const matched = lines.filter((line) =>
    ERROR_PATTERNS.some((p) => p.test(line))
  );
  return matched.slice(0, 5);
}

function getStatePath() {
  return join(process.cwd(), ".claude", "acl-state.json");
}

function getLogPath() {
  return join(process.cwd(), ".claude", "quality-gate-log.md");
}

function readState() {
  const p = getStatePath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeState(state) {
  const p = getStatePath();
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2), "utf8");
}

function resetState() {
  const p = getStatePath();
  if (existsSync(p)) {
    writeState({
      task: "",
      retries: 0,
      maxRetries: 3,
      lastError: "",
      updatedAt: new Date().toISOString(),
    });
  }
}

function appendLog(command) {
  const p = getLogPath();
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const entry = `- [✅ ${command}] PASS (${date})\n`;
  const existing = existsSync(p) ? readFileSync(p, "utf8") : "";
  writeFileSync(p, existing + entry, "utf8");
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const command = input?.tool_input?.command || "";
  if (!isBuildCommand(command)) process.exit(0);

  const exitCode = input?.tool_output?.exit_code;
  const stderr = input?.tool_output?.stderr || "";
  const hasError =
    exitCode !== 0 || extractErrorLines(stderr).length > 0;

  if (!hasError) {
    // 성공
    const state = readState();
    if (state && state.retries > 0) {
      resetState();
    }
    appendLog(command);
    process.exit(0);
  }

  // 에러 감지
  const errorLines = extractErrorLines(stderr);
  const errorSummary =
    errorLines.length > 0
      ? errorLines.join("\n")
      : stderr.split("\n").slice(0, 5).join("\n");

  let state = readState();
  if (!state) {
    state = {
      task: command,
      retries: 0,
      maxRetries: 3,
      lastError: "",
      updatedAt: new Date().toISOString(),
    };
  }

  state.task = command;
  state.lastError = errorSummary;
  state.updatedAt = new Date().toISOString();
  state.retries = (state.retries || 0) + 1;

  if (state.retries < state.maxRetries) {
    writeState(state);
    process.stderr.write(
      `\n⚠️ [ACL 자동 교정] 빌드 에러 감지 (시도 ${state.retries}/${state.maxRetries})\n` +
        `에러:\n${errorSummary}\n` +
        `→ 에러를 수정한 후 동일 명령을 재실행하세요.\n`
    );
  } else {
    // 한도 초과
    process.stderr.write(
      `\n🚨 [ACL 한도 초과] ${state.maxRetries}회 시도 실패 — CEO 개입 필요\n` +
        `마지막 에러:\n${state.lastError}\n` +
        `→ failure-cases.md에 기록하고 CEO에게 보고하세요.\n`
    );
    // 초기화
    state.retries = 0;
    writeState(state);
  }

  process.exit(0);
}

main();
