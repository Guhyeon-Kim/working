#!/usr/bin/env node
/**
 * delegate.mjs — CLI 위임 래퍼 v1.1
 *
 * 목적: Codex/Gemini 호출 시 컨텍스트 패킷을 자동 조립하여
 *       "제대로 된 위임"이 가장 쉬운 경로가 되도록 한다.
 *
 * 사용법:
 *   node delegate.mjs codex frontend "로그인 페이지 구현"
 *   node delegate.mjs codex backend "stocks API 엔드포인트 구현"
 *   node delegate.mjs gemini research "경쟁사 QR 결제 서비스 분석"
 *   node delegate.mjs gemini design "대시보드 화면 초안"
 *
 * 환경변수 (모델 체인 제어):
 *   GEMINI_MODEL_CHAIN    전체 체인 강제 (콤마 구분). 예: "gemini-3.1-pro-preview,gemini-2.5-pro,gemini-2.5-flash"
 *   GEMINI_MODEL          primary 모델만 교체. 기본 체인의 첫 요소 대체
 *   GEMINI_FALLBACK_MODEL secondary 모델 교체 (deprecated; GEMINI_MODEL_CHAIN 권장)
 *   DELEGATE_TIMEOUT_MS   단일 시도 타임아웃 (기본: 300000)
 *
 * 기본 모델 체인 (target별):
 *   research/design  : [최신 preview] → [안정 pro] → [경량 flash]  (품질 우선)
 *   기타              : [안정 pro]    → [경량 flash]               (재현성 우선)
 *
 * 모델 이름은 Google 정책에 따라 주기적으로 변경됨.
 * 신규 preview 모델이 등장하면 GEMINI_MODEL_CHAIN으로 즉시 반영 가능.
 *
 * v1.2 변경점:
 *   - 3단 모델 체인 지원 (preview → pro → flash)
 *   - target별 체인 힌트 (research는 최신 우선, 그 외는 안정 우선)
 *   - GEMINI_MODEL_CHAIN 환경변수로 체인 전체 override
 * v1.1:
 *   - spawnSync + 배열 인자로 shell escape 원천 차단
 *   - 429/RESOURCE_EXHAUSTED/ETIMEDOUT/5xx 자동 폴백
 *   - 시도 이력을 feedback 리포트에 누적
 */

// ─── Gemini 모델 체인 ───
//
// 2026-04-13 기준. 신규 preview 출시 시 GEMINI_MODEL_CHAIN으로 override하거나 여기를 업데이트.
const GEMINI_CHAINS = {
  quality: ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  standard: ['gemini-2.5-pro', 'gemini-2.5-flash'],
};

function resolveGeminiChain(target) {
  // 1순위: 환경변수 전체 체인 override
  if (process.env.GEMINI_MODEL_CHAIN) {
    return process.env.GEMINI_MODEL_CHAIN.split(',').map(s => s.trim()).filter(Boolean);
  }

  // 2순위: target별 기본 체인
  const useQuality = target === 'research' || target === 'design';
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

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { execSync, spawnSync } from 'child_process';

// ─── 설정 ───
const PROJECT_ROOT = process.cwd();
const CLAUDE_DIR = join(PROJECT_ROOT, '.claude');
const DOCS_DIR = join(CLAUDE_DIR, 'docs');
const DELEGATION_DIR = join(CLAUDE_DIR, 'delegation');
const MEMORY_DIR = join(CLAUDE_DIR, 'agents', 'memory');

// ─── 인자 파싱 ───
const [,, cli, target, ...taskParts] = process.argv;
const task = taskParts.join(' ');

if (!cli || !target || !task) {
  console.error(`
사용법: node delegate.mjs <cli> <target> <task>

  cli:    codex | gemini
  target: frontend | backend | research | design | education | marketing
  task:   작업 내용 (자연어)

예시:
  node delegate.mjs codex frontend "로그인 페이지 구현"
  node delegate.mjs gemini research "경쟁사 QR 결제 서비스 분석"

v6.5 라우팅 원칙 (CLAUDE.md §🎯 참고):
  Codex  = 신규 30줄+ 코드, 다중 파일 수정·리팩터·테스트 생성
  Gemini = 장문 리서치, PDF·이미지·영상, 검색 결합 리서치
  Claude = 30줄 이하 수정, MCP 호출, 한국어 문서, 의사결정
`);
  process.exit(1);
}

// ─── v6.5 라우팅 힌트 로그 ───
// 위임 순간 "왜 이 AI인지" 표시해서 추후 잘못된 위임을 사용자가 캐치 가능하게.
const ROUTING_HINTS = {
  codex: {
    frontend: '프론트엔드 구현 → Codex (30줄+ 코드·다중 파일 일관성)',
    backend: '백엔드 구현 → Codex (API·스키마 일관성)',
  },
  gemini: {
    research: '장문 리서치 → Gemini (2M 컨텍스트·검색 결합)',
    design: '디자인 레퍼런스 → Gemini (멀티모달·이미지)',
    education: '교육 콘텐츠 → Gemini (장문·트렌드)',
    marketing: '마케팅 카피·전략 → Gemini (장문·검색)',
  },
};
const hint = ROUTING_HINTS[cli]?.[target];
if (hint) {
  console.error(`[delegate][v6.5] ${hint}`);
}

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

  // 쉘 인젝션 방지: 안전한 키워드만 통과 (영숫자/한글/언더스코어/하이픈/점)
  const safeKeywords = keywords
    .filter(k => typeof k === 'string' && /^[\p{L}\p{N}_.\-]+$/u.test(k))
    .slice(0, 5); // 과도한 패턴 수 제한

  if (safeKeywords.length === 0) return results;

  // spawnSync + 인자 배열 → 쉘 해석 없음
  const args = [];
  for (const k of safeKeywords) { args.push('-e', k); }
  args.push('-rl', '--include=*.ts', '--include=*.tsx', '--include=*.py', '--include=*.jsx', '--include=*.js', dir);

  const res = spawnSync('grep', args, { encoding: 'utf8', timeout: 5000 });
  if (res.status === 0 && res.stdout) {
    results.push(...res.stdout.trim().split('\n').filter(Boolean).slice(0, 10));
  }
  return results;
}

// ─── 패킷 빌더 ───

function buildCodexPacket(target, task) {
  const packet = [];
  
  // 1. 프로젝트 기본 정보
  const projectConfig = readIfExists(join(CLAUDE_DIR, 'project-config.json'));
  if (projectConfig) {
    try {
      const config = JSON.parse(projectConfig);
      packet.push(`[프로젝트] ${config.projectName} (${config.projectType})`);
    } catch {}
  }
  
  // 2. 작업 스코프
  packet.push(`\n[작업 지시]\n${task}`);
  
  // 3. API 명세 (관련 부분만)
  const apiSpec = readIfExists(join(DOCS_DIR, 'api-spec.md'));
  const taskKeywords = task.split(/[\s,./]+/).filter(w => w.length > 2);
  if (apiSpec) {
    const relevant = extractRelevantSection(apiSpec, taskKeywords);
    if (relevant) {
      packet.push(`\n[API 명세 — 관련 부분]\n${relevant}`);
    } else {
      packet.push(`\n[API 명세] api-spec.md 참조. 경로: ${join(DOCS_DIR, 'api-spec.md')}`);
    }
  }
  
  // 4. 디자인 명세 (프론트엔드만)
  if (target === 'frontend') {
    const designSpec = readIfExists(join(DOCS_DIR, 'design-spec.md'));
    if (designSpec) {
      const relevant = extractRelevantSection(designSpec, taskKeywords);
      if (relevant) {
        packet.push(`\n[디자인 명세 — 관련 부분]\n${relevant}`);
      }
    }
    
    const wireframe = readIfExists(join(DOCS_DIR, 'wireframe.md'));
    if (wireframe) {
      const relevant = extractRelevantSection(wireframe, taskKeywords);
      if (relevant) {
        packet.push(`\n[와이어프레임 — 관련 부분]\n${relevant}`);
      }
    }
  }
  
  // 5. 기존 코드 참조 (관련 파일 경로)
  const codeDir = target === 'frontend' 
    ? join(PROJECT_ROOT, 'frontend', 'src')
    : join(PROJECT_ROOT, 'backend', 'app');
  
  const relatedFiles = findRelatedFiles(codeDir, taskKeywords);
  if (relatedFiles.length > 0) {
    packet.push(`\n[참조할 기존 코드]\n${relatedFiles.map(f => `- ${f}`).join('\n')}`);
  }
  
  // 6. 반복 버그 레지스트리 (항상 포함)
  const failureCases = readIfExists(join(MEMORY_DIR, 'failure-cases.md'));
  if (failureCases) {
    // 최근 10개 항목만 추출
    const lines = failureCases.split('\n');
    const recentFailures = lines.filter(l => l.startsWith('|') || l.startsWith('#')).slice(0, 15);
    if (recentFailures.length > 0) {
      packet.push(`\n[하지 말 것 — failure-cases]\n${recentFailures.join('\n')}`);
    }
  }
  
  // 7. 필수 코딩 규칙 (항상 포함)
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
  
  // 8. 성공 패턴 (있으면 포함)
  const successPatterns = readIfExists(join(MEMORY_DIR, 'success-patterns.md'));
  if (successPatterns) {
    const relevant = extractRelevantSection(successPatterns, taskKeywords);
    if (relevant) {
      packet.push(`\n[이렇게 하면 잘 됨 — success-patterns]\n${relevant}`);
    }
  }
  
  return packet.join('\n');
}

function buildGeminiPacket(target, task) {
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
  
  // 2. 작업 지시 + 기대 산출물
  packet.push(`\n[작업 지시]\n${task}`);
  
  if (target === 'research') {
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
    
  } else if (target === 'design') {
    packet.push(`
[기대 산출물]
- 형식: 마크다운 (.md) + 컴포넌트 구조
- 구조: 화면 목적 → 레이아웃 → 컴포넌트 계층 → 상태 정의 → 인터랙션
- 디자인 시스템: shadcn/ui + Tailwind CSS 기준
- 출력만 반환 (파일 저장은 Claude Code 측에서 수행 — 모델이 쓰기 시도 금지)
`);
    
    // 디자인 가이드 참조
    const designGuide = readIfExists(join(DOCS_DIR, 'design-guide-v2.md'));
    if (designGuide) {
      const summary = designGuide.split('\n').slice(0, 30).join('\n');
      packet.push(`\n[디자인 가이드 요약]\n${summary}`);
    }
    
  } else if (target === 'education' || target === 'marketing') {
    packet.push(`
[기대 산출물]
- 형식: 마크다운 (.md)
- 톤: 전문적이면서 접근 가능한 톤
- 출력만 반환 (파일 저장은 Claude Code 측에서 수행 — 모델이 쓰기 시도 금지)
`);
  }
  
  // 3. requirements.md 요약 (있으면)
  const requirements = readIfExists(join(DOCS_DIR, 'requirements.md'));
  if (requirements) {
    const summary = requirements.split('\n').slice(0, 20).join('\n');
    packet.push(`\n[프로젝트 요구사항 요약]\n${summary}`);
  }
  
  // 4. 인코딩 규칙 (항상)
  packet.push(`
[필수 규칙]
- UTF-8 without BOM 필수. 한국어에 CP949/EUC-KR 사용 금지
- 출처 없는 주장 금지
- 추측 표현 시 "추정" 명시
`);
  
  return packet.join('\n');
}

// ─── 패킷 검증 ───

function validatePacket(packet, cli, target) {
  const issues = [];
  
  if (cli === 'codex') {
    if (!packet.includes('[작업 지시]')) issues.push('작업 지시 누락');
    if (!packet.includes('[필수 코딩 규칙]')) issues.push('코딩 규칙 누락');
    if (target === 'frontend' && !packet.includes('디자인') && !packet.includes('API')) {
      issues.push('프론트엔드 작업인데 디자인/API 참조 없음 — api-spec.md, design-spec.md 존재 여부 확인');
    }
    if (target === 'backend' && !packet.includes('API')) {
      issues.push('백엔드 작업인데 API 명세 참조 없음 — api-spec.md 존재 여부 확인');
    }
  }
  
  if (cli === 'gemini') {
    if (!packet.includes('[기대 산출물]')) issues.push('기대 산출물 형식 누락');
    if (!packet.includes('[필수 규칙]')) issues.push('인코딩 규칙 누락');
  }
  
  return issues;
}

// ─── 실행 ───

async function main() {
  // 패킷 조립
  let packet;
  if (cli === 'codex') {
    packet = buildCodexPacket(target, task);
  } else if (cli === 'gemini') {
    packet = buildGeminiPacket(target, task);
  } else {
    console.error(`[오류] 지원하지 않는 CLI: ${cli}. codex 또는 gemini만 가능.`);
    process.exit(1);
  }
  
  // 패킷 검증
  const issues = validatePacket(packet, cli, target);
  if (issues.length > 0) {
    console.error(`[경고] 패킷 검증 이슈:\n${issues.map(i => `  ⚠ ${i}`).join('\n')}`);
    console.error('계속 진행하되, 위 항목을 보완하면 결과 품질이 올라갑니다.');
  }
  
  // 패킷 저장 (감사/디버깅용)
  const { mkdirSync } = await import('fs');
  mkdirSync(DELEGATION_DIR, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const packetPath = join(DELEGATION_DIR, `${cli}-${target}-${timestamp}.md`);
  writeFileSync(packetPath, packet, 'utf8');
  
  console.log(`[delegate] 패킷 저장: ${packetPath}`);
  console.log(`[delegate] ${cli} CLI 호출 중 (target: ${target})...`);

  const attempts = [];
  let result;
  let finalErr;

  try {
    if (cli === 'codex') {
      const codeDir = target === 'frontend' ? 'frontend' : 'backend';
      // spawnSync + 인자 배열 → shell escape 문제 원천 차단
      result = runCli('codex', ['exec', '--full-auto', '-C', codeDir, packet], 'codex-default', attempts);
    } else {
      // Gemini: target별 모델 체인 (quality: preview→pro→flash, standard: pro→flash)
      const chain = resolveGeminiChain(target);
      console.log(`[delegate] 모델 체인: ${chain.join(' → ')}`);

      for (const model of chain) {
        try {
          console.log(`[delegate] 시도: gemini -m ${model}`);
          result = runCli('gemini', ['-m', model, '-p', packet], model, attempts);
          break;
        } catch (err) {
          const last = attempts[attempts.length - 1];
          const transient = isTransientError(err);
          if (last) { last.error = summarizeErr(err); last.transient = transient; }

          if (!transient) throw err;
          console.error(`[delegate] ${model} 일시 오류 → 다음 모델 시도: ${summarizeErr(err).slice(0, 140)}`);
          finalErr = err;
        }
      }

      if (!result) throw finalErr || new Error('Gemini 모델 체인 전체 실패');
    }

    if (cli === 'gemini') {
      const { mkdirSync } = await import('fs');
      mkdirSync(DOCS_DIR, { recursive: true });

      // 최신 결과는 gemini-draft.md (하위 호환), 히스토리는 timestamped 파일로 보존
      const draftPath = join(DOCS_DIR, 'gemini-draft.md');
      const historyPath = join(DOCS_DIR, `gemini-history/${timestamp}-${target}.md`);
      mkdirSync(dirname(historyPath), { recursive: true });
      writeFileSync(draftPath, result, 'utf8');
      writeFileSync(historyPath, result, 'utf8');
      console.log(`[delegate] Gemini 결과 저장:`);
      console.log(`  - 최신: ${draftPath}`);
      console.log(`  - 이력: ${historyPath}`);
    }

    const feedbackLog = generateQualityFeedback(packet, result, cli, target, task, attempts);
    const feedbackPath = join(DELEGATION_DIR, `${cli}-${target}-${timestamp}-feedback.md`);
    writeFileSync(feedbackPath, feedbackLog, 'utf8');
    console.log(`[delegate] 품질 피드백: ${feedbackPath}`);

    console.log(`[delegate] 완료.`);
    console.log(result);

  } catch (err) {
    const feedbackLog = generateQualityFeedback(packet, '', cli, target, task, attempts, err);
    const feedbackPath = join(DELEGATION_DIR, `${cli}-${target}-${timestamp}-feedback.md`);
    try { writeFileSync(feedbackPath, feedbackLog, 'utf8'); } catch {}

    console.error(`[delegate] ${cli} CLI 실행 실패:`, (err.message || String(err)).split('\n')[0]);
    if (err.stderr) console.error(String(err.stderr).slice(0, 500));
    console.error(`[delegate] 시도 이력은 ${feedbackPath}에 저장됨`);
    process.exit(1);
  }
}

// ─── CLI 실행 + 에러 분류 ───

function runCli(cmd, args, label, attemptsLog) {
  const started = Date.now();
  const timeout = Number(process.env.DELEGATE_TIMEOUT_MS) || 300000;

  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 10 * 1024 * 1024,
  });

  const entry = { label, ms: Date.now() - started, status: res.status, signal: res.signal };

  if (res.error) {
    attemptsLog.push({ ...entry, ok: false });
    const e = res.error;
    e.stderr = res.stderr;
    e.stdout = res.stdout;
    throw e;
  }
  if (res.status !== 0) {
    attemptsLog.push({ ...entry, ok: false });
    const err = new Error(`${cmd} exited with status ${res.status}`);
    err.code = res.status;
    err.stderr = res.stderr;
    err.stdout = res.stdout;
    throw err;
  }

  attemptsLog.push({ ...entry, ok: true });
  return res.stdout;
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

function generateQualityFeedback(packet, result, cli, target, task, attempts = [], fatalErr = null) {
  const lines = [`# 위임 결과 품질 피드백`, ``, `- CLI: ${cli}`, `- Target: ${target}`, `- Task: ${task}`, `- 시각: ${new Date().toISOString()}`, ``];

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

  // 1. 결과물 존재 여부
  checks.push({
    item: '결과물 존재',
    pass: result && result.trim().length > 50,
    detail: result ? `${result.trim().length}자` : '결과 없음',
  });

  // 2. 작업 지시 키워드 매칭
  const taskKeywords = task.split(/[\s,./]+/).filter(w => w.length > 2);
  const matchedKeywords = taskKeywords.filter(k => resultLower.includes(k.toLowerCase()));
  const keywordRatio = taskKeywords.length > 0 ? matchedKeywords.length / taskKeywords.length : 0;
  checks.push({
    item: '작업 키워드 일치',
    pass: keywordRatio >= 0.3,
    detail: `${matchedKeywords.length}/${taskKeywords.length} (${Math.round(keywordRatio * 100)}%)`,
  });

  // 3. Codex 전용: 코드 포함 여부
  if (cli === 'codex') {
    const hasCode = /function |const |import |export |class |def |async /.test(result || '');
    checks.push({ item: '코드 포함', pass: hasCode, detail: hasCode ? 'O' : 'X' });
  }

  // 4. Gemini 전용: 출처 포함 여부 (research)
  if (cli === 'gemini' && target === 'research') {
    const hasSource = /https?:\/\//.test(result || '');
    checks.push({ item: '출처 URL 포함', pass: hasSource, detail: hasSource ? 'O' : 'X' });
  }

  // 5. 한글 인코딩 정상 여부
  const hasBroken = /[\x80-\x9f]/.test(result || '');
  checks.push({ item: '인코딩 정상', pass: !hasBroken, detail: hasBroken ? '깨짐 감지' : 'OK' });

  lines.push('## 체크리스트');
  lines.push('| 항목 | 결과 | 상세 |');
  lines.push('|------|------|------|');
  for (const c of checks) {
    lines.push(`| ${c.item} | ${c.pass ? '\u2705' : '\u274C'} | ${c.detail} |`);
  }

  const passCount = checks.filter(c => c.pass).length;
  const totalScore = Math.round((passCount / checks.length) * 100);
  lines.push('');
  lines.push(`## 총점: ${totalScore}% (${passCount}/${checks.length})`);

  if (totalScore < 60) {
    lines.push('');
    lines.push('> \u26A0\uFE0F 품질 미달 — 패킷 보강 또는 재위임 권장');
  }

  return lines.join('\n') + '\n';
}

main();
