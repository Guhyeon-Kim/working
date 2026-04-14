#!/usr/bin/env node
/**
 * sync-user-scope.mjs — Working Hub → user-scope (크로스 플랫폼)
 *
 * 목적: Linux Codespace와 Windows 로컬에서 동일한 훅·스킬·전역 설정을 유지.
 *       VSCode extension이나 cmd에서 Claude Code 사용 시 양쪽 환경 일치 보장.
 *
 * 실행:
 *   Linux/macOS:  node scripts/sync-user-scope.mjs
 *   Windows cmd:  node scripts\sync-user-scope.mjs
 *   Windows PS:   node scripts/sync-user-scope.mjs
 *
 * 동작:
 *   1. hooks/ → ~/.claude/hooks/ (OS 자동 판별)
 *   2. skills/ → ~/.claude/skills/
 *   3. CLAUDE.md (global fallback) 없으면 생성
 *   4. settings.json의 훅 경로를 현재 OS의 home으로 재작성 (기존 파일 보존, 경로만 치환)
 *
 * 주의:
 *   - MCP 서버(Playwright/Context7/GitHub)는 별도 `claude mcp add` 명령 필요 — 안내만 출력
 *   - PAT 등 secret은 복사하지 않음
 *   - 기존 settings.json의 permissions/enabledPlugins 등은 유지
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, existsSync, rmSync } from 'fs';
import { join, dirname, relative, sep } from 'path';
import { homedir, platform } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const HOME = homedir();
const TARGET = join(HOME, '.claude');
const PLATFORM = platform(); // 'linux', 'darwin', 'win32'

const log = (...args) => console.log('[sync]', ...args);
const warn = (...args) => console.warn('[sync][경고]', ...args);

// ─── 유틸 ───
function copyDir(src, dst, opts = {}) {
  const { clean = false } = opts;
  if (!existsSync(src)) return { copied: 0 };

  if (clean && existsSync(dst)) {
    // 대상 디렉토리 내용만 비우고 (dst 자체는 유지) 재복사
    for (const entry of readdirSync(dst)) {
      rmSync(join(dst, entry), { recursive: true, force: true });
    }
  }
  mkdirSync(dst, { recursive: true });

  let copied = 0;
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    const stat = statSync(s);
    if (stat.isDirectory()) {
      copied += copyDir(s, d).copied;
    } else {
      copyFileSync(s, d);
      copied++;
    }
  }
  return { copied };
}

// ─── 1. hooks 동기화 ───
log(`플랫폼: ${PLATFORM}  |  홈: ${HOME}  |  타겟: ${TARGET}`);
const hooksResult = copyDir(join(REPO_ROOT, 'hooks'), join(TARGET, 'hooks'), { clean: true });
log(`hooks/ 동기화 완료 (${hooksResult.copied}개 파일)`);

// ─── 2. skills 동기화 ───
const skillsResult = copyDir(join(REPO_ROOT, 'skills'), join(TARGET, 'skills'), { clean: true });
log(`skills/ 동기화 완료 (${skillsResult.copied}개 파일)`);

// ─── 3. 전역 CLAUDE.md 동기화 ───
const GLOBAL_CLAUDE_MD_TEMPLATE = `# 전역 Claude Code Instructions

> 모든 프로젝트 cwd에서 공통 적용되는 최소 지시. 프로젝트별 CLAUDE.md가 우선이며 이 파일은 fallback 역할.

## 언어

모든 응답·문서·커밋 메시지는 **한국어**. 기술 용어와 코드 식별자는 원문 유지.

## 핵심 원칙

1. **비파괴 우선** — git push --force, reset --hard, rm -rf 등 파괴적 명령은 실행 전 반드시 사용자 확인.
2. **요청 범위 준수** — 요청하지 않은 리팩터·추상화·기능 추가 금지. 한 요청 = 한 스코프.
3. **에러 무시 금지** — silent failure(빈 catch, 기본값 폴백)로 증상 가리지 말고 원인 해결.
4. **외부 시스템에 미치는 작업은 사전 고지** — PR 생성, 메시지 전송, 파일 업로드 등.

## 크로스 플랫폼 작업 환경

유저는 **Codespace(Linux) + Windows(VSCode/cmd)** 양쪽에서 Claude Code를 사용한다. 파일 경로·셸 명령·훅은 Node.js로 포팅되어 OS 독립적이어야 한다. bash-only 스크립트는 Windows cmd에서 실행 불가.

## 위임 원칙 (Multi-AI)

| AI | 역할 | 호출 |
|----|------|------|
| Claude Code (Opus) | 오케스트레이션, 최종 판단 | 직접 |
| Gemini CLI | 리서치, 기획 초안 | \`node <repo>/scripts/delegate.mjs gemini <target> <task>\` |
| Codex CLI | 코드 구현 | \`node <repo>/scripts/delegate.mjs codex <target> <task>\` |

**Gemini CLI/Codex CLI 직접 호출 금지** — 반드시 delegate.mjs 경유.

## 사고 깊이 자동 조절 (ultrathink / ultraplan)

사용자가 "상세하게 / 꼼꼼하게 / 제대로 / 깊게 / 집중해서 / 최대한 / 고민해서 / 정밀하게" 등 품질 강조 표현을 쓰면 작업 성격에 따라 분기:

| 작업 성격 | 대응 |
|----------|------|
| 구현·수정·디버깅·리팩터 | ultrathink(max effort) 즉시 적용 — 승인 없이 진행 |
| 기획·설계·아키텍처 | ultraplan 제안 (/ultraplan) — 사용자 승인 대기 |
| 리서치·조사 | max effort + 출처 검증 강화 — Gemini 위임 + 교차검증 |

단순 확인/조회는 low effort 유지 (토큰 절약).

## memory 시스템

\`~/.claude/projects/<workspace>/memory/\`에 유저 프로파일·피드백·프로젝트 컨텍스트 저장. 세션 시작 시 자동 로딩(session-start-memory 훅).

## 프로젝트별 우선순위

프로젝트 cwd의 CLAUDE.md가 이 파일과 충돌하면 프로젝트 것이 우선. 이 파일은 _기본값_만 정의.
`;

const targetClaudeMd = join(TARGET, 'CLAUDE.md');
if (!existsSync(targetClaudeMd)) {
  mkdirSync(TARGET, { recursive: true });
  writeFileSync(targetClaudeMd, GLOBAL_CLAUDE_MD_TEMPLATE, 'utf8');
  log(`전역 CLAUDE.md 생성: ${targetClaudeMd}`);
} else {
  log(`전역 CLAUDE.md 존재 — 덮어쓰지 않음 (${targetClaudeMd})`);
}

// ─── 4. settings.json 훅 경로 재작성 (기존 파일 보존) ───
const settingsPath = join(TARGET, 'settings.json');
if (existsSync(settingsPath)) {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    let changed = 0;
    const hookDir = join(TARGET, 'hooks');

    // 훅 command 경로를 현재 OS의 HOME 기준으로 재작성
    function fixCommand(cmd) {
      if (typeof cmd !== 'string') return cmd;
      // node "PATH/hooks/foo.mjs" 형태
      const m = cmd.match(/^(node|bash)\s+"([^"]+[/\\]hooks[/\\][^"]+)"(.*)$/);
      if (!m) return cmd;
      const [, bin, oldPath, rest] = m;
      const fileName = oldPath.split(/[/\\]/).pop();
      const newPath = join(hookDir, fileName);
      if (oldPath === newPath) return cmd;

      // .sh → .mjs 자동 치환 (Windows 호환)
      let fixedBin = bin;
      let fixedName = fileName;
      if (fileName.endsWith('.sh')) {
        const mjsAlt = fileName.replace(/\.sh$/, '.mjs');
        if (existsSync(join(hookDir, mjsAlt))) {
          fixedBin = 'node';
          fixedName = mjsAlt;
          warn(`bash ${fileName} → node ${mjsAlt} 로 치환 (Windows 호환)`);
        }
      }

      const fixedPath = join(hookDir, fixedName);
      changed++;
      return `${fixedBin} "${fixedPath}"${rest}`;
    }

    function walkHooks(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach(walkHooks);
        return;
      }
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'command') obj[k] = fixCommand(v);
        else walkHooks(v);
      }
    }

    walkHooks(settings.hooks);

    if (changed > 0) {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
      log(`settings.json 훅 경로 ${changed}개 재작성`);
    } else {
      log(`settings.json 훅 경로 이미 정상`);
    }
  } catch (err) {
    warn(`settings.json 처리 실패: ${err.message}`);
  }
} else {
  warn(`settings.json 없음 (${settingsPath}) — Claude Code 최초 실행 후 재시도하거나 수동 생성 필요`);
}

// ─── 5. MCP 안내 ───
console.log('\n[MCP] 다음 명령을 한 번 실행하세요 (이미 등록돼 있으면 스킵):');
console.log('  claude mcp add playwright --scope user -- npx @playwright/mcp@latest');
console.log('  claude mcp add context7   --scope user -- npx -y @upstash/context7-mcp');
console.log('  claude mcp add github https://api.githubcopilot.com/mcp/ \\');
console.log('    --scope user --transport http \\');
if (PLATFORM === 'win32') {
  console.log('    --header "Authorization: Bearer %GH_MCP_TOKEN%"');
  console.log('\n[Windows] cmd에서는 %GH_MCP_TOKEN%, PowerShell에서는 $env:GH_MCP_TOKEN 사용');
} else {
  console.log('    --header "Authorization: Bearer $GH_MCP_TOKEN"');
}
console.log('\n[확인] claude mcp list');
