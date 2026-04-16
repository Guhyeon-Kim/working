#!/usr/bin/env node
/**
 * sync-shared-agents.mjs — Working Hub의 공용 에이전트를 대상 repo에 동기화.
 *
 * 목적: 기존 repo·신규 repo 모두, working이 업데이트될 때마다
 *       공용 에이전트를 최신 상태로 유지. repo 고유 에이전트는 보존.
 *
 * 동작:
 *   1. MANIFEST에 정의된 공용 에이전트만 target repo의 .claude/agents/로 복사.
 *   2. MANIFEST 외 파일(각 repo 고유 에이전트)은 건드리지 않음.
 *   3. memory/는 각 repo의 자체 학습 내용이므로 덮어쓰지 않음. 없으면 빈 상태 생성만.
 *   4. 공용 스크립트(delegate.mjs) 동기화는 post-merge 훅이 별도 처리.
 *
 * 실행:
 *   node /path/to/working/scripts/sync-shared-agents.mjs <target-repo-absolute-path>
 *
 * 크로스 플랫폼:
 *   Windows 한글 경로에서도 안전하도록 copyFileSync 직접 사용 (cpSync atomic 회피).
 */

import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const HUB = dirname(SCRIPT_DIR); // working repo root

const args = process.argv.slice(2);
const target = args[0];
if (!target) {
  console.error('사용법: node sync-shared-agents.mjs <target-repo-path>');
  process.exit(1);
}

const log = (...a) => console.log('[shared-agents]', ...a);
const warn = (...a) => console.warn('[shared-agents][경고]', ...a);

// 공용 에이전트 MANIFEST.
// v6.5 기준 7개 핵심 + delegation_workflow. legacy/·project-specific/는 repo별 판단으로 유지.
const SHARED_FILES = [
  'delegation_workflow.md',
  'data-agent.md',
  'infra-agent.md',
  'marketing-agent.md',
  'pm-agent.md',
  'qa-agent.md',
  'research-agent.md',
  'security-agent.md',
];

if (!existsSync(join(HUB, 'agents'))) {
  warn(`hub agents/ 없음: ${HUB} — 스킵`);
  process.exit(0);
}

if (!existsSync(target)) {
  warn(`target 없음: ${target}`);
  process.exit(1);
}

const targetAgentsDir = join(target, '.claude', 'agents');
mkdirSync(targetAgentsDir, { recursive: true });

let copied = 0;
let missing = 0;
for (const fname of SHARED_FILES) {
  const src = join(HUB, 'agents', fname);
  const dst = join(targetAgentsDir, fname);
  if (!existsSync(src)) {
    missing++;
    continue;
  }
  try {
    copyFileSync(src, dst);
    copied++;
  } catch (e) {
    warn(`복사 실패 ${fname}: ${e.message}`);
  }
}

// memory/는 각 repo 자체 학습 공간. 없을 때만 빈 상태로 생성.
const mem = join(targetAgentsDir, 'memory');
if (!existsSync(mem)) {
  mkdirSync(mem, { recursive: true });
  const rules = join(mem, 'evolving-rules.json');
  if (!existsSync(rules)) writeFileSync(rules, '[]\n', 'utf8');
  log(`memory 초기화: ${mem}`);
}

log(`${target}: 공용 에이전트 ${copied}/${SHARED_FILES.length} 동기화${missing ? ` (hub 누락 ${missing}개)` : ''}`);
