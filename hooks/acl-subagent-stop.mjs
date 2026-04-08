#!/usr/bin/env node

/**
 * acl-subagent-stop.mjs
 * SubagentStop 훅: 서브에이전트 종료 후 타입 체크 + 빌드 자동 검증
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, appendFileSync } from "fs";
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
  // stdin이 JSON이 아니면 무시
  process.exit(0);
}

const cwd = process.cwd();

// 2. package.json 존재 확인 (Node.js 프로젝트인지 판별)
if (!existsSync(join(cwd, "package.json"))) {
  process.exit(0);
}

// 3. src/ 디렉토리에 최근 변경된 파일이 있는지 확인
let diffOutput = "";
try {
  diffOutput = execSync("git diff --name-only HEAD", {
    cwd,
    encoding: "utf-8",
    timeout: 10000,
  });
} catch {
  // git 명령 실패 시 무시
  process.exit(0);
}

const srcChanges = diffOutput
  .split("\n")
  .filter((line) => line.startsWith("src/"));

if (srcChanges.length === 0) {
  process.exit(0);
}

// 에러 줄 추출 헬퍼: "error", "Error", "failed" 포함 줄만 최대 5줄
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
  execSync("npx tsc --noEmit", {
    cwd,
    encoding: "utf-8",
    timeout: 60000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  tscPassed = true;
} catch (err) {
  const combined = (err.stdout || "") + "\n" + (err.stderr || "");
  const errors = extractErrors(combined);
  process.stderr.write(
    `⚠️ [SubagentStop 검증] 타입 체크 실패\n에러: ${errors}\n→ Codex 결과물에 타입 에러가 있습니다. 수정 후 재검증하세요.\n`
  );
  process.exit(0);
}

// 4b. 빌드 (타입 체크 통과 시에만)
let buildPassed = false;
try {
  execSync("npm run build", {
    cwd,
    encoding: "utf-8",
    timeout: 60000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  buildPassed = true;
} catch (err) {
  const combined = (err.stdout || "") + "\n" + (err.stderr || "");
  const errors = extractErrors(combined);
  process.stderr.write(
    `⚠️ [SubagentStop 검증] 빌드 실패\n에러: ${errors}\n→ 빌드 에러를 수정하세요.\n`
  );
  process.exit(0);
}

// 5. 모두 성공
if (tscPassed && buildPassed) {
  // quality-gate-log.md에 PASS 기록
  const logDir = join(cwd, ".claude");
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  const record = `| ${now} | ${input.agent_name || "unknown"} | PASS | 타입 체크 + 빌드 성공 |\n`;
  if (!existsSync(logPath)) {
    appendFileSync(
      logPath,
      "| 시각 | 에이전트 | 결과 | 상세 |\n|---|---|---|---|\n" + record,
      "utf-8"
    );
  } else {
    appendFileSync(logPath, record, "utf-8");
  }
  process.stderr.write(
    `✅ [SubagentStop 검증] 타입 체크 + 빌드 PASS\n`
  );
}

process.exit(0);
