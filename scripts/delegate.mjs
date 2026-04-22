#!/usr/bin/env node
/**
 * delegate.mjs — CLI 위임 래퍼 v2.0 (v6.0 7 에이전트)
 *
 * 목적: Claude Code 세션이 v6.0 에이전트(7개) 중 하나를 지정해 위임할 때
 *       컨텍스트 패킷을 자동 조립하고 1:1로 매핑된 CLI를 호출한다.
 *
 * 사용법:
 *   node delegate.mjs <agent> <task>
 *
 *   agent: researcher | planner | copywriter | designer | builder | tester | curator
 *   task:  작업 내용 (자연어)
 *
 * 예시:
 *   node delegate.mjs builder "로그인 페이지 구현"
 *   node delegate.mjs researcher "경쟁사 QR 결제 서비스 분석"
 *   node delegate.mjs tester "결제 플로우 E2E 시나리오 작성"
 *
 * v2.0 (2026-04-22): v5.3 → v6.0 마이그레이션 (breaking)
 *   - 구 6 target(frontend/backend/research/design/education/marketing) 제거
 *   - v6.0 7 에이전트 AGENT_REGISTRY 도입 (CLAUDE.md §2-1)
 *   - CLI 자동 선택 (agent → cli 1:1 매핑)
 *   - 구 target/구 CLI 이름 호출 시 exit 2 + 마이그레이션 메시지
 *   - claude CLI 지원 추가 (planner/designer/curator)
 *   - DELEGATE_DRY_RUN=1 지원 (CLI 호출 없이 라우팅까지만)
 *
 * v1.2 (2026-04-16): 3단 모델 체인, target별 체인 힌트, GEMINI_MODEL_CHAIN env
 * v1.1: spawnSync + 배열 인자, 429/5xx 폴백, 시도 이력 피드백 누적
 *
 * 환경변수:
 *   DELEGATE_DRY_RUN=1       CLI 실행 없이 라우팅·패킷 저장까지만 (테스트용)
 *   DELEGATE_CODE_DIR        codex 실행 디렉토리 (기본: frontend)
 *   DELEGATE_TIMEOUT_SEC     단일 시도 타임아웃 (초, 기본: 300)
 *   DELEGATE_TIMEOUT_MS      레거시 ms 단위 (DELEGATE_TIMEOUT_SEC 미지정 시만)
 *   GEMINI_MODEL_CHAIN       gemini 모델 체인 전체 override (콤마 구분)
 *   GEMINI_MODEL             gemini primary 모델 교체
 *   GEMINI_FALLBACK_MODEL    gemini secondary 모델 (deprecated)
 *
 * Fallback 규칙 (CLAUDE.md §1-1: CTO = Claude = 최종 책임):
 *   primary CLI (codex/gemini) 실패 시 → claude로 전역 fallback
 *   - 트리거: ENOENT/EACCES/EPERM, exit!=0, signal kill, timeout, auth/quota 패턴
 *   - claude primary 에이전트(planner/designer/curator)는 fallback 없음 (claude IS the fallback)
 *   - exit codes: 0=성공, 1=primary 실패 no-fallback, 3=fallback도 실패, 2=breaking change
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';

// ─── v6.0 Agent Registry (CLAUDE.md §2-1 과 1:1 매핑) ───
const AGENT_REGISTRY = {
  researcher: { cli: 'gemini', fallbackCli: 'claude', role: '리서치·벤치마킹' },
  planner:    { cli: 'claude',                        role: '요건정의·기획 고도화' },
  copywriter: { cli: 'gemini', fallbackCli: 'claude', role: '마케팅·카피' },
  designer:   { cli: 'claude',                        role: 'UI·정보구조' },
  builder:    { cli: 'codex',  fallbackCli: 'claude', role: 'Front/Backend 구현' },
  tester:     { cli: 'codex',  fallbackCli: 'claude', role: '테스트·디버깅' },
  curator:    { cli: 'claude',                        role: '컨텍스트·로그·메모리' },
};

// v5.3 → v6.0 breaking change: 구 target 호출 시 마이그레이션 메시지 + exit 2
const REMOVED_V5_TARGETS = new Set([
  'frontend', 'backend', 'research', 'design', 'education', 'marketing',
]);

// v5.3 인터페이스는 <cli> <target> <task>. v6.0은 <agent> <task>.
// 첫 인자가 구 CLI 이름이면 인터페이스 변경을 알린다.
const V5_CLI_NAMES = new Set(['codex', 'gemini']);

// ─── Gemini 모델 체인 ───
//
// 2026-04-13 기준. 신규 preview 출시 시 GEMINI_MODEL_CHAIN으로 override하거나 여기를 업데이트.
const GEMINI_CHAINS = {
  quality: ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  standard: ['gemini-2.5-pro', 'gemini-2.5-flash'],
};

function resolveGeminiChain(agent) {
  // 1순위: 환경변수 전체 체인 override
  if (process.env.GEMINI_MODEL_CHAIN) {
    return process.env.GEMINI_MODEL_CHAIN.split(',').map(s => s.trim()).filter(Boolean);
  }
  // 2순위: agent별 기본 체인 — researcher만 quality(최신 우선), 나머지는 standard
  const useQuality = agent === 'researcher';
  const base = useQuality ? GEMINI_CHAINS.quality : GEMINI_CHAINS.standard;
  let chain = [...base];
  // 3순위: GEMINI_MODEL이 있으면 맨 앞에 주입 (중복 제거)
  if (process.env.GEMINI_MODEL) {
    chain = [process.env.GEMINI_MODEL, ...chain.filter(m => m !== process.env.GEMINI_MODEL)];
  }
  // 4순위: GEMINI_FALLBACK_MODEL이 있으면 체인에 없을 때만 뒤에 append (레거시 호환)
  if (process.env.GEMINI_FALLBACK_MODEL && !chain.includes(process.env.GEMINI_FALLBACK_MODEL)) {
    chain.push(process.env.GEMINI_FALLBACK_MODEL);
  }
  return chain;
}

// ─── 설정 ───
const PROJECT_ROOT = process.cwd();
const CLAUDE_DIR = join(PROJECT_ROOT, '.claude');
const DOCS_DIR = join(CLAUDE_DIR, 'docs');
const DELEGATION_DIR = join(CLAUDE_DIR, 'delegation');
const MEMORY_DIR = join(CLAUDE_DIR, 'agents', 'memory');

// ─── 인자 파싱 ───
const [,, agentArg, ...taskParts] = process.argv;
const task = taskParts.join(' ');

function printUsage() {
  const rows = Object.entries(AGENT_REGISTRY)
    .map(([k, v]) => `  ${k.padEnd(11)} → ${v.cli.padEnd(6)} (${v.role})`)
    .join('\n');
  console.error(`
사용법: node delegate.mjs <agent> <task>

  agent: ${Object.keys(AGENT_REGISTRY).join(' | ')}
  task:  작업 내용 (자연어)

예시:
  node delegate.mjs builder "로그인 페이지 구현"
  node delegate.mjs researcher "경쟁사 QR 결제 서비스 분석"
  node delegate.mjs tester "결제 플로우 E2E 시나리오 작성"

v6.0 에이전트 (CLAUDE.md §2-1):
${rows}

환경변수:
  DELEGATE_DRY_RUN=1       CLI 실행 없이 라우팅·패킷 저장까지만
  DELEGATE_CODE_DIR        codex 실행 디렉토리 (기본: frontend)
  DELEGATE_TIMEOUT_SEC     단일 시도 타임아웃 (초, 기본: 300)
  GEMINI_MODEL_CHAIN       gemini 모델 체인 override (콤마 구분)

Fallback: primary CLI 실패 시 claude로 자동 전환 (agent.fallbackCli 보유 시).
`);
}

if (!agentArg || !task) {
  printUsage();
  process.exit(1);
}

// v5.3 → v6.0 breaking change 감지 (구 target)
if (REMOVED_V5_TARGETS.has(agentArg)) {
  console.error(`
ERROR: '${agentArg}' is removed in v6.0. Use v6.0 agent names instead:
  researcher, planner, copywriter, designer, builder, tester, curator.
See CLAUDE.md §2-5 (v6.0 에이전트 카탈로그).
`);
  process.exit(2);
}

// v5.3 → v6.0 breaking change 감지 (구 인터페이스 <cli> <target> <task>)
if (V5_CLI_NAMES.has(agentArg)) {
  console.error(`
ERROR: delegate.mjs interface changed in v6.0.
  OLD: node delegate.mjs <cli> <target> <task>
  NEW: node delegate.mjs <agent> <task>
Use one of: researcher, planner, copywriter, designer, builder, tester, curator.
See CLAUDE.md §2-5.
`);
  process.exit(2);
}

const agentDef = AGENT_REGISTRY[agentArg];
if (!agentDef) {
  console.error(`[오류] 알 수 없는 에이전트: ${agentArg}`);
  console.error(`사용 가능: ${Object.keys(AGENT_REGISTRY).join(', ')}`);
  printUsage();
  process.exit(1);
}

const agent = agentArg;
const cli = agentDef.cli;

// ─── 라우팅 힌트 로그 (위임 순간 "왜 이 CLI인지" 표시) ───
const ROUTING_HINTS = {
  researcher: 'Gemini 리서치 — 2M 컨텍스트·검색 결합·출처 필수',
  planner: 'Claude 기획 — 의사결정·요건 구조화',
  copywriter: 'Gemini 카피 — 장문·브랜드 보이스·검색',
  designer: 'Claude 디자인 — Figma MCP·UI 정보구조',
  builder: 'Codex 구현 — 30줄+ 코드·다중 파일 일관성',
  tester: 'Codex 테스트 — E2E·유닛·디버깅·작동 증거',
  curator: 'Claude 큐레이션 — 로그·메모리·컨텍스트 요약',
};
console.error(`[delegate][v6.0] agent=${agent} cli=${cli} — ${ROUTING_HINTS[agent]}`);

// ─── 유틸리티 ───
function readIfExists(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function extractRelevantSection(content, keywords) {
  if (!content) return null;
  const lines = content.split('\n');
  const relevant = [];
  let capturing = false;
  let sectionDepth = 0;

  for (const line of lines) {
    const isHeader = /^#{1,4}\s/.test(line);
    const matchesKeyword = keywords.some(k =>
      line.toLowerCase().includes(k.toLowerCase())
    );

    if (isHeader && matchesKeyword) {
      capturing = true;
      sectionDepth = (line.match(/^#+/) || [''])[0].length;
      relevant.push(line);
    } else if (capturing) {
      if (isHeader && (line.match(/^#+/) || [''])[0].length <= sectionDepth) {
        capturing = false;
      } else {
        relevant.push(line);
      }
    }
  }

  return relevant.length > 0 ? relevant.join('\n') : null;
}

function findRelatedFiles(dir, keywords, extensions = ['.tsx', '.ts', '.jsx', '.js', '.py']) {
  const results = [];
  if (!existsSync(dir) || !keywords || keywords.length === 0) return results;

  const safeKeywords = keywords
    .filter(k => typeof k === 'string' && /^[\p{L}\p{N}_.\-]+$/u.test(k))
    .slice(0, 5);
  if (safeKeywords.length === 0) return results;

  // Node-native 재귀 스캔 (Windows에 grep 미존재 대응). 배열 키워드는 OR.
  const extSet = new Set(extensions);
  const skipDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', '.venv', '__pycache__']);
  const regex = new RegExp(safeKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
  const deadline = Date.now() + 5000;
  const MAX = 10;
  const stack = [dir];

  while (stack.length && results.length < MAX && Date.now() < deadline) {
    const cur = stack.pop();
    let entries;
    try { entries = readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (results.length >= MAX || Date.now() >= deadline) break;
      const full = join(cur, ent.name);
      if (ent.isDirectory()) {
        if (!skipDirs.has(ent.name) && !ent.name.startsWith('.')) stack.push(full);
        continue;
      }
      if (!ent.isFile()) continue;
      const ext = ent.name.slice(ent.name.lastIndexOf('.'));
      if (!extSet.has(ext)) continue;
      try {
        const content = readFileSync(full, 'utf8');
        if (regex.test(content)) results.push(full);
      } catch { /* ignore unreadable */ }
    }
  }
  return results;
}

// memory/ 주입 (v5.3 계승). failure-cases는 항상 append, success-patterns는 키워드 관련 섹션만.
function injectMemory(packet, keywords) {
  const failureCases = readIfExists(join(MEMORY_DIR, 'failure-cases.md'));
  let injectedFailure = false;
  if (failureCases) {
    const lines = failureCases.split('\n');
    const recentFailures = lines.filter(l => l.startsWith('|') || l.startsWith('#')).slice(0, 15);
    if (recentFailures.length > 0) {
      packet.push(`\n[하지 말 것 — failure-cases]\n${recentFailures.join('\n')}`);
      injectedFailure = true;
    }
  }

  const successPatterns = readIfExists(join(MEMORY_DIR, 'success-patterns.md'));
  let injectedSuccess = false;
  if (successPatterns) {
    const relevant = extractRelevantSection(successPatterns, keywords);
    if (relevant) {
      packet.push(`\n[이렇게 하면 잘 됨 — success-patterns]\n${relevant}`);
      injectedSuccess = true;
    }
  }

  console.error(`[delegate] memory/ 주입 완료 (failure-cases: ${injectedFailure ? '✓' : '—'}, success-patterns: ${injectedSuccess ? '✓' : '—'})`);
}

// ─── 패킷 빌더 ───

function buildCodexPacket(agent, task) {
  const packet = [];

  // 1. 프로젝트 기본 정보
  const projectConfig = readIfExists(join(CLAUDE_DIR, 'project-config.json'));
  if (projectConfig) {
    try {
      const config = JSON.parse(projectConfig);
      packet.push(`[프로젝트] ${config.projectName} (${config.projectType})`);
    } catch {}
  }

  // 2. agent·작업 지시
  packet.push(`\n[agent] ${agent} — ${AGENT_REGISTRY[agent].role}`);
  packet.push(`\n[작업 지시]\n${task}`);

  const taskKeywords = task.split(/[\s,./]+/).filter(w => w.length > 2);

  // 3. API/디자인/와이어프레임 명세 (있으면 모두)
  const apiSpec = readIfExists(join(DOCS_DIR, 'api-spec.md'));
  if (apiSpec) {
    const relevant = extractRelevantSection(apiSpec, taskKeywords);
    if (relevant) {
      packet.push(`\n[API 명세 — 관련 부분]\n${relevant}`);
    } else {
      packet.push(`\n[API 명세] api-spec.md 참조. 경로: ${join(DOCS_DIR, 'api-spec.md')}`);
    }
  }
  const designSpec = readIfExists(join(DOCS_DIR, 'design-spec.md'));
  if (designSpec) {
    const relevant = extractRelevantSection(designSpec, taskKeywords);
    if (relevant) packet.push(`\n[디자인 명세 — 관련 부분]\n${relevant}`);
  }
  const wireframe = readIfExists(join(DOCS_DIR, 'wireframe.md'));
  if (wireframe) {
    const relevant = extractRelevantSection(wireframe, taskKeywords);
    if (relevant) packet.push(`\n[와이어프레임 — 관련 부분]\n${relevant}`);
  }

  // 4. 기존 코드 참조 (frontend, backend 모두 스캔 — task 키워드로 자연 필터링)
  const dirs = [
    join(PROJECT_ROOT, 'frontend', 'src'),
    join(PROJECT_ROOT, 'backend', 'app'),
  ];
  const relatedFiles = [];
  for (const d of dirs) {
    for (const f of findRelatedFiles(d, taskKeywords)) {
      relatedFiles.push(f);
      if (relatedFiles.length >= 10) break;
    }
    if (relatedFiles.length >= 10) break;
  }
  if (relatedFiles.length > 0) {
    packet.push(`\n[참조할 기존 코드]\n${relatedFiles.map(f => `- ${f}`).join('\n')}`);
  }

  // 5. memory/ 주입
  injectMemory(packet, taskKeywords);

  // 6. 필수 코딩 규칙
  packet.push(`
[필수 코딩 규칙]
- 모든 파일은 UTF-8 without BOM으로 저장
- 한국어 문자열은 유니코드 이스케이프: '\\uc804\\ub7b5'
- async params 패턴 필수 (Next.js 15+): params: Promise<{}> + await params
- TypeScript any 금지, unknown + 타입 가드
- 파일 읽기 시 전체 읽기 금지 — offset/limit 또는 grep으로 필요 범위만
- console.log 금지 (디버깅 후 제거)
- localhost 하드코딩 금지
`);

  // 7. tester 전용 추가 지침
  if (agent === 'tester') {
    packet.push(`
[tester 추가 지침]
- 작동 증거(실행 흔적) 필수 — 테스트 실행 결과·커버리지 로그 첨부
- BLOCK 조건: 크리티컬 결함 1건 이상 시 즉시 배포 불가 판정
- 스킬 참조: skills/qa-test.md, skills/self-review.md
`);
  }

  return packet.join('\n');
}

function buildGeminiPacket(agent, task) {
  const packet = [];

  // 1. 프로젝트 배경
  const projectConfig = readIfExists(join(CLAUDE_DIR, 'project-config.json'));
  if (projectConfig) {
    try {
      const config = JSON.parse(projectConfig);
      packet.push(`[프로젝트] ${config.projectName} (${config.projectType})`);
      if (config.deployUrl) packet.push(`[URL] ${config.deployUrl}`);
    } catch {}
  }

  // 2. agent·작업 지시
  packet.push(`\n[agent] ${agent} — ${AGENT_REGISTRY[agent].role}`);
  packet.push(`\n[작업 지시]\n${task}`);

  const taskKeywords = task.split(/[\s,./]+/).filter(w => w.length > 2);

  if (agent === 'researcher') {
    packet.push(`
[기대 산출물]
- 형식: 마크다운 (.md)
- 구조: 요약(3줄) → 핵심 발견 → 상세 분석 → 시사점
- 출처: 모든 주장에 출처 URL 포함
- 길이: 최소 500자, 최대 3000자
- 출력만 반환 (파일 저장은 Claude Code 측에서 수행 — 모델이 쓰기 시도 금지)
`);

    // 기존 리서치 결과 요약 (중복 방지)
    const existingDraft = readIfExists(join(DOCS_DIR, 'gemini-draft.md'));
    if (existingDraft) {
      const firstLines = existingDraft.split('\n').slice(0, 10).join('\n');
      packet.push(`\n[기존 리서치 — 중복 방지]\n${firstLines}\n(위 내용과 중복되는 조사는 하지 말 것)`);
    }
  } else if (agent === 'copywriter') {
    packet.push(`
[기대 산출물]
- 형식: 마크다운 (.md)
- 톤: 전문적이면서 접근 가능한 톤 (브랜드 보이스에 맞게)
- 구조: 헤드라인 → 리드 → 본문 → CTA
- 출력만 반환 (파일 저장은 Claude Code 측에서 수행 — 모델이 쓰기 시도 금지)
`);
  }

  // 3. 요구사항 요약 (있으면)
  const requirements = readIfExists(join(DOCS_DIR, 'requirements.md'));
  if (requirements) {
    const summary = requirements.split('\n').slice(0, 20).join('\n');
    packet.push(`\n[프로젝트 요구사항 요약]\n${summary}`);
  }

  // 4. memory/ 주입
  injectMemory(packet, taskKeywords);

  // 5. 인코딩·출처 규칙
  packet.push(`
[필수 규칙]
- UTF-8 without BOM 필수. 한국어에 CP949/EUC-KR 사용 금지
- 출처 없는 주장 금지
- 추측 표현 시 "추정" 명시
`);

  return packet.join('\n');
}

function buildClaudePacket(agent, task) {
  const packet = [];

  // 1. 프로젝트 배경
  const projectConfig = readIfExists(join(CLAUDE_DIR, 'project-config.json'));
  if (projectConfig) {
    try {
      const config = JSON.parse(projectConfig);
      packet.push(`[프로젝트] ${config.projectName} (${config.projectType})`);
    } catch {}
  }

  // 2. agent·작업 지시
  packet.push(`\n[agent] ${agent} — ${AGENT_REGISTRY[agent].role}`);
  packet.push(`\n[작업 지시]\n${task}`);

  const taskKeywords = task.split(/[\s,./]+/).filter(w => w.length > 2);

  // 3. agent별 추가 컨텍스트
  if (agent === 'designer') {
    const designGuide = readIfExists(join(DOCS_DIR, 'design-guide-v2.md'));
    if (designGuide) {
      const summary = designGuide.split('\n').slice(0, 30).join('\n');
      packet.push(`\n[디자인 가이드]\n${summary}`);
    }
    packet.push(`
[designer 지침]
- Figma MCP 우선 참조 (파일 키가 지정되면 해당 디자인 읽기)
- 산출물: 와이어프레임 + 컴포넌트 계층 + 상태·인터랙션 정의
- 스킬 참조: skills/wireframe.md, skills/design-review.md, skills/design-system.md, skills/ui-component.md
`);
  } else if (agent === 'planner') {
    const requirements = readIfExists(join(DOCS_DIR, 'requirements.md'));
    if (requirements) {
      const summary = requirements.split('\n').slice(0, 30).join('\n');
      packet.push(`\n[기존 요구사항]\n${summary}`);
    }
    packet.push(`
[planner 지침]
- 산출물: requirements-spec 업데이트 + 플로우 + 리스크/의존성
- 의사결정이 필요한 지점은 명시하고 CEO 판단 대기
- 스킬 참조: skills/planning.md, skills/requirements-spec.md, skills/flowchart.md
`);
  } else if (agent === 'curator') {
    packet.push(`
[curator 지침]
- 산출물: Notion devlog v2.0 엔트리 초안 + 컨텍스트 요약
- 스킬 참조: skills/project-log.md, skills/context-summary.md, skills/onboarding.md
- 메모리(agents/memory/)와 docs/logs/ 현황 정리
`);
  }

  // 4. memory/ 주입
  injectMemory(packet, taskKeywords);

  return packet.join('\n');
}

// ─── 패킷 검증 ───

function validatePacket(packet, cli, agent) {
  const issues = [];
  if (!packet.includes('[작업 지시]')) issues.push('작업 지시 누락');
  if (!packet.includes('[agent]')) issues.push('agent 표시 누락');
  if (cli === 'codex' && !packet.includes('[필수 코딩 규칙]')) issues.push('Codex 코딩 규칙 누락');
  if (cli === 'gemini' && !packet.includes('[필수 규칙]')) issues.push('Gemini 인코딩 규칙 누락');
  if (cli === 'gemini' && !packet.includes('[기대 산출물]')) issues.push('Gemini 기대 산출물 누락');
  return issues;
}

// ─── 실행 ───

async function main() {
  // 패킷 조립
  let packet;
  if (cli === 'codex') {
    packet = buildCodexPacket(agent, task);
  } else if (cli === 'gemini') {
    packet = buildGeminiPacket(agent, task);
  } else if (cli === 'claude') {
    packet = buildClaudePacket(agent, task);
  } else {
    console.error(`[오류] 지원하지 않는 CLI: ${cli}`);
    process.exit(1);
  }

  // 패킷 검증
  const issues = validatePacket(packet, cli, agent);
  if (issues.length > 0) {
    console.error(`[경고] 패킷 검증 이슈:\n${issues.map(i => `  ⚠ ${i}`).join('\n')}`);
    console.error('계속 진행하되, 위 항목을 보완하면 결과 품질이 올라갑니다.');
  }

  // 패킷 저장 (감사/디버깅용)
  const { mkdirSync } = await import('fs');
  mkdirSync(DELEGATION_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const packetPath = join(DELEGATION_DIR, `${agent}-${timestamp}.md`);
  writeFileSync(packetPath, packet, 'utf8');

  console.error(`[delegate] 패킷 저장: ${packetPath}`);
  console.error(`[delegate] ${cli} CLI 호출 중 (agent: ${agent})...`);

  // DRY RUN: CLI 호출 없이 라우팅·패킷 저장까지만
  if (process.env.DELEGATE_DRY_RUN === '1') {
    console.error(`[delegate] DRY RUN — CLI 호출 생략. 라우팅 완료: agent=${agent}, cli=${cli}`);
    process.exit(0);
  }

  const attempts = [];
  const feedbackPath = join(DELEGATION_DIR, `${agent}-${timestamp}-feedback.md`);
  let result;
  let primaryErr;
  let usedCli = cli;

  // ─── 1) Primary 시도 ───
  try {
    result = executePrimary(cli, agent, packet, attempts);
  } catch (err) {
    primaryErr = err;
  }

  // ─── 2) Fallback 판정 ───
  if (primaryErr) {
    const fallbackAvail = !!agentDef.fallbackCli;

    if (!fallbackAvail) {
      // claude primary(planner/designer/curator) 또는 fallbackCli 미지정 → 종결
      console.error(`[delegate] CLAUDE PRIMARY FAILED. No fallback available (claude IS the fallback).`);
      console.error(`  reason: ${formatPrimaryError(primaryErr)}`);

      const feedbackLog = generateQualityFeedback(packet, '', cli, agent, task, attempts, primaryErr);
      try { writeFileSync(feedbackPath, feedbackLog, 'utf8'); } catch {}
      console.error(`[delegate] 시도 이력: ${feedbackPath}`);
      process.exit(1);
    }

    // Fallback 경로 진입
    console.error(`[delegate] PRIMARY FAILED: agent=${agent} cli=${cli} reason=${formatPrimaryError(primaryErr)}`);
    console.error(`[delegate] FALLBACK → ${agentDef.fallbackCli}. Claude가 ${agent} 역할로 수행.`);

    const fallbackPacket = injectFallbackContext(packet, agent, cli);
    usedCli = agentDef.fallbackCli;

    // fallback 패킷 별도 파일로 저장 (진단용)
    const fallbackPath = join(DELEGATION_DIR, `${agent}-${timestamp}-fallback.md`);
    try { writeFileSync(fallbackPath, fallbackPacket, 'utf8'); } catch {}
    console.error(`[delegate] fallback 패킷 저장: ${fallbackPath}`);

    try {
      result = runCli('claude', ['-p'], 'claude-fallback', attempts, fallbackPacket);
    } catch (fallbackErr) {
      console.error(`[delegate] FALLBACK ALSO FAILED.`);
      console.error(`  primary(${cli}) error:   ${formatPrimaryError(primaryErr)}`);
      console.error(`  fallback(claude) error: ${formatPrimaryError(fallbackErr)}`);

      const composite = new Error(`primary(${cli}) and fallback(claude) both failed`);
      composite.primary = formatPrimaryError(primaryErr);
      composite.fallback = formatPrimaryError(fallbackErr);
      const feedbackLog = generateQualityFeedback(packet, '', cli, agent, task, attempts, composite);
      try { writeFileSync(feedbackPath, feedbackLog, 'utf8'); } catch {}
      console.error(`[delegate] 시도 이력: ${feedbackPath}`);
      process.exit(3);
    }
  }

  // ─── 3) 결과 저장 (gemini만 draft/history) ───
  if (usedCli === 'gemini') {
    const { mkdirSync } = await import('fs');
    mkdirSync(DOCS_DIR, { recursive: true });

    const draftPath = join(DOCS_DIR, 'gemini-draft.md');
    const historyPath = join(DOCS_DIR, `gemini-history/${timestamp}-${agent}.md`);
    mkdirSync(dirname(historyPath), { recursive: true });
    writeFileSync(draftPath, result, 'utf8');
    writeFileSync(historyPath, result, 'utf8');
    console.error(`[delegate] Gemini 결과 저장:`);
    console.error(`  - 최신: ${draftPath}`);
    console.error(`  - 이력: ${historyPath}`);
  }

  const feedbackLog = generateQualityFeedback(packet, result, usedCli, agent, task, attempts);
  writeFileSync(feedbackPath, feedbackLog, 'utf8');
  console.error(`[delegate] 품질 피드백: ${feedbackPath}`);

  console.error(`[delegate] 완료. (cli=${usedCli}${usedCli !== cli ? ' via fallback' : ''})`);
  // stdout은 오직 CLI 최종 응답 본문만 — 후속 pipe(jq 등) 가능
  console.log(result);
}

// ─── Primary 실행 (cli별 분기) ───

function executePrimary(primaryCli, agent, packet, attempts) {
  if (primaryCli === 'codex') {
    const codeDir = process.env.DELEGATE_CODE_DIR || 'frontend';
    // stdin 전달 — argv에는 플래그만. codex exec가 stdin에서 prompt 읽음.
    return runCli('codex', ['exec', '--full-auto', '-C', codeDir], 'codex-default', attempts, packet);
  }

  if (primaryCli === 'gemini') {
    // agent별 모델 체인. 일시 에러는 체인 내부에서 모델 전환, 체인 전체 실패만 상위로.
    const chain = resolveGeminiChain(agent);
    console.error(`[delegate] 모델 체인: ${chain.join(' → ')}`);

    let chainErr;
    for (const model of chain) {
      try {
        console.error(`[delegate] 시도: gemini -m ${model}`);
        // stdin 전달 — gemini CLI가 stdin에서 prompt 읽음.
        return runCli('gemini', ['-m', model], model, attempts, packet);
      } catch (err) {
        chainErr = err;
        const last = attempts[attempts.length - 1];
        const transient = isTransientError(err);
        if (last) { last.error = summarizeErr(err); last.transient = transient; }
        if (!transient) throw err;  // 비일시 오류는 체인 중단 → cross-cli fallback로
        console.error(`[delegate] ${model} 일시 오류 → 다음 모델 시도: ${summarizeErr(err).slice(0, 140)}`);
      }
    }
    throw chainErr || new Error('Gemini 모델 체인 전체 실패');
  }

  if (primaryCli === 'claude') {
    // stdin 전달 — claude -p가 stdin에서 prompt 읽음.
    return runCli('claude', ['-p'], 'claude-default', attempts, packet);
  }

  throw new Error(`지원하지 않는 CLI: ${primaryCli}`);
}

// ─── Fallback 컨텍스트 주입 ───

function injectFallbackContext(packet, agent, primaryCli) {
  // NOTE: 선두에 '---' 사용 금지 — claude CLI가 argv의 leading '---'를 unknown flag로 해석함.
  const role = AGENT_REGISTRY[agent]?.role || agent;
  const header = `[FALLBACK 컨텍스트]
이 작업은 원래 ${primaryCli}가 담당할 ${agent} 역할(${role})이다.
${primaryCli} 실패로 Claude가 대신 수행한다.
해당 에이전트 프롬프트(agents/${agent}.md)의 역할·제약을 따르되,
본인이 Claude임을 인지하고 필요 시 그에 맞게 보정하라.

===

`;
  return header + packet;
}

// ─── CLI 실행 + 에러 분류 ───

// runCli: 모든 CLI 호출은 stdin으로 패킷 전달 (argv는 짧은 플래그만).
// Windows의 argv multi-line truncation 회피 + 패킷 크기 제한 사실상 해제.
function runCli(cmd, args, label, attemptsLog, input) {
  const started = Date.now();
  const timeout =
    (process.env.DELEGATE_TIMEOUT_SEC ? Number(process.env.DELEGATE_TIMEOUT_SEC) * 1000 : 0) ||
    Number(process.env.DELEGATE_TIMEOUT_MS) ||
    300000;

  // Windows: `shell:true` 대신 `cmd.exe /d /s /c` 래핑 (DEP0190 회피 + 인젝션 방지).
  const isWin = process.platform === 'win32';
  const spawnCmd = isWin ? 'cmd.exe' : cmd;
  const spawnArgs = isWin ? ['/d', '/s', '/c', cmd, ...args] : args;
  const res = spawnSync(spawnCmd, spawnArgs, {
    encoding: 'utf8',
    input: input ?? '',
    timeout,
    maxBuffer: 10 * 1024 * 1024,
  });

  const entry = { label, ms: Date.now() - started, status: res.status, signal: res.signal };

  // spawn 에러 (ENOENT 등) — timeout도 error.code === 'ETIMEDOUT' 또는 signal=SIGTERM으로 들어옴
  if (res.error) {
    attemptsLog.push({ ...entry, ok: false });
    const e = res.error;
    e.stderr = res.stderr;
    e.stdout = res.stdout;
    e.exitCode = res.status;
    e.signalName = res.signal;
    throw e;
  }

  // signal kill (timeout 포함)
  if (res.signal) {
    attemptsLog.push({ ...entry, ok: false });
    const err = new Error(`${cmd} killed by signal ${res.signal}`);
    err.code = res.signal;
    err.killed = true;
    err.stderr = res.stderr;
    err.stdout = res.stdout;
    err.exitCode = res.status;
    err.signalName = res.signal;
    throw err;
  }

  if (res.status !== 0) {
    attemptsLog.push({ ...entry, ok: false });
    const err = new Error(`${cmd} exited with status ${res.status}`);
    err.code = res.status;
    err.stderr = res.stderr;
    err.stdout = res.stdout;
    err.exitCode = res.status;
    err.signalName = res.signal;
    throw err;
  }

  // exit 0 이지만 stdout 비어있고 stderr가 auth/quota 패턴 → 실질 실패 처리
  const stdoutTrim = (res.stdout || '').trim();
  const stderrLow = (res.stderr || '').toLowerCase();
  if (stdoutTrim.length === 0 && /authentication|unauthorized|\b401\b|quota|rate.?limit/.test(stderrLow)) {
    attemptsLog.push({ ...entry, ok: false });
    const err = new Error(`${cmd} reported auth/quota failure on empty output`);
    err.code = 'AUTH_OR_QUOTA';
    err.stderr = res.stderr;
    err.stdout = res.stdout;
    err.exitCode = res.status;
    err.signalName = res.signal;
    throw err;
  }

  attemptsLog.push({ ...entry, ok: true });
  return res.stdout;
}

// Windows cp949 mojibake 방어. non-printable+U+FFFD 비율 > 30%면 대체 메시지.
function formatPrimaryError(err) {
  const raw = (err?.stderr ? String(err.stderr) : (err?.message || String(err))).replace(/\s+/g, ' ').trim();
  const total = raw.length;
  if (total > 0) {
    const bad = (raw.match(/[\x00-\x08\x0B-\x1F\x7F�]/g) || []).length;
    if (bad / total > 0.3) {
      const code = err?.exitCode ?? err?.code ?? 'n/a';
      const sig = err?.signalName ?? 'n/a';
      return `[decoded stderr unavailable; exit=${code} signal=${sig}]`;
    }
  }
  return raw.slice(0, 240);
}

function isTransientError(err) {
  const blob = [
    err?.code,
    err?.message,
    err?.stderr ? String(err.stderr) : '',
    err?.stdout ? String(err.stdout) : '',
  ].join(' ').toLowerCase();

  return (
    /etimedout|econnreset|econnrefused|enotfound|socket hang up/.test(blob) ||
    /\b(429|500|502|503|504)\b/.test(blob) ||
    /resource_exhausted|rate.?limit|no capacity|unavailable|model_capacity/.test(blob) ||
    /too many requests/.test(blob)
  );
}

function summarizeErr(err) {
  const out = (err?.stderr ? String(err.stderr) : '') || err?.message || String(err);
  return out.replace(/\s+/g, ' ').trim().slice(0, 400);
}

function generateQualityFeedback(packet, result, cli, agent, task, attempts = [], fatalErr = null) {
  const lines = [
    `# 위임 결과 품질 피드백`,
    ``,
    `- CLI: ${cli}`,
    `- Agent: ${agent}`,
    `- Task: ${task}`,
    `- 시각: ${new Date().toISOString()}`,
    ``,
  ];

  if (attempts.length > 0) {
    lines.push('## 시도 이력');
    lines.push('| # | 라벨(모델) | 결과 | 소요(ms) | status | 비고 |');
    lines.push('|---|-----------|------|----------|--------|------|');
    attempts.forEach((a, i) => {
      const note = a.transient ? '일시오류 → 폴백' : (a.error ? '치명' : '');
      const errSnippet = a.error ? a.error.slice(0, 80) : '';
      lines.push(`| ${i + 1} | ${a.label} | ${a.ok ? '✅' : '❌'} | ${a.ms} | ${a.status ?? '-'} | ${note} ${errSnippet} |`);
    });
    lines.push('');
  }

  if (fatalErr) {
    lines.push('## 최종 실패');
    lines.push('```');
    lines.push(summarizeErr(fatalErr));
    lines.push('```');
    lines.push('');
    return lines.join('\n') + '\n';
  }

  const checks = [];
  const resultLower = (result || '').toLowerCase();

  checks.push({
    item: '결과물 존재',
    pass: result && result.trim().length > 50,
    detail: result ? `${result.trim().length}자` : '결과 없음',
  });

  const taskKeywords = task.split(/[\s,./]+/).filter(w => w.length > 2);
  const matchedKeywords = taskKeywords.filter(k => resultLower.includes(k.toLowerCase()));
  const keywordRatio = taskKeywords.length > 0 ? matchedKeywords.length / taskKeywords.length : 0;
  checks.push({
    item: '작업 키워드 일치',
    pass: keywordRatio >= 0.3,
    detail: `${matchedKeywords.length}/${taskKeywords.length} (${Math.round(keywordRatio * 100)}%)`,
  });

  if (cli === 'codex') {
    const hasCode = /function |const |import |export |class |def |async /.test(result || '');
    checks.push({ item: '코드 포함', pass: hasCode, detail: hasCode ? 'O' : 'X' });
  }

  if (cli === 'gemini' && agent === 'researcher') {
    const hasSource = /https?:\/\//.test(result || '');
    checks.push({ item: '출처 URL 포함', pass: hasSource, detail: hasSource ? 'O' : 'X' });
  }

  const hasBroken = /[\x80-\x9f]/.test(result || '');
  checks.push({ item: '인코딩 정상', pass: !hasBroken, detail: hasBroken ? '깨짐 감지' : 'OK' });

  lines.push('## 체크리스트');
  lines.push('| 항목 | 결과 | 상세 |');
  lines.push('|------|------|------|');
  for (const c of checks) {
    lines.push(`| ${c.item} | ${c.pass ? '✅' : '❌'} | ${c.detail} |`);
  }

  const passCount = checks.filter(c => c.pass).length;
  const totalScore = Math.round((passCount / checks.length) * 100);
  lines.push('');
  lines.push(`## 총점: ${totalScore}% (${passCount}/${checks.length})`);

  if (totalScore < 60) {
    lines.push('');
    lines.push('> ⚠️ 품질 미달 — 패킷 보강 또는 재위임 권장');
  }

  return lines.join('\n') + '\n';
}

main();
