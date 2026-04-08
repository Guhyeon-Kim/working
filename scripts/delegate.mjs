#!/usr/bin/env node
/**
 * delegate.mjs — CLI 위임 래퍼 v1.0
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
 * 동작:
 *   1. 프로젝트 컨텍스트에서 관련 파일 자동 탐색
 *   2. 작업 유형에 맞는 컨텍스트 패킷 조립
 *   3. 패킷 + 작업 지시를 CLI에 전달
 *   4. 결과물을 표준 경로에 저장
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

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
`);
  process.exit(1);
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
  if (!existsSync(dir)) return results;
  
  try {
    const output = execSync(
      `grep -rl ${keywords.map(k => `"${k}"`).join(' ')} ${dir} --include="*.ts" --include="*.tsx" --include="*.py" --include="*.jsx" --include="*.js" 2>/dev/null | head -10`,
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    if (output) results.push(...output.split('\n'));
  } catch {
    // grep 결과 없으면 무시
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
- 저장: .claude/docs/gemini-draft.md
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
- 저장: .claude/docs/gemini-draft.md
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
- 저장: .claude/docs/gemini-draft.md
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
  
  // CLI 실행
  let command;
  if (cli === 'codex') {
    // Codex: target을 -C 디렉토리로 매핑
    const codeDir = target === 'frontend' ? 'frontend' : 'backend';
    command = `codex exec --full-auto -C ${codeDir} "${packet.replace(/"/g, '\\"')}"`;
  } else {
    // Gemini: 프롬프트로 전달
    command = `gemini -p "${packet.replace(/"/g, '\\"')}"`;
  }
  
  console.log(`[delegate] 패킷 저장: ${packetPath}`);
  console.log(`[delegate] ${cli} CLI 호출 중 (target: ${target})...`);
  
  try {
    const result = execSync(command, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300000, // 5분
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });
    
    // Gemini 결과는 gemini-draft.md에 자동 저장
    if (cli === 'gemini') {
      writeFileSync(join(DOCS_DIR, 'gemini-draft.md'), result, 'utf8');
      console.log(`[delegate] Gemini 결과 저장: ${join(DOCS_DIR, 'gemini-draft.md')}`);
    }

    // 결과 품질 피드백 로그 기록
    const feedbackLog = generateQualityFeedback(packet, result, cli, target, task);
    const feedbackPath = join(DELEGATION_DIR, `${cli}-${target}-${timestamp}-feedback.md`);
    writeFileSync(feedbackPath, feedbackLog, 'utf8');
    console.log(`[delegate] 품질 피드백: ${feedbackPath}`);

    console.log(`[delegate] 완료.`);
    console.log(result);

  } catch (err) {
    console.error(`[delegate] ${cli} CLI 실행 실패:`, err.message);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }
}

function generateQualityFeedback(packet, result, cli, target, task) {
  const lines = [`# 위임 결과 품질 피드백`, ``, `- CLI: ${cli}`, `- Target: ${target}`, `- Task: ${task}`, `- 시각: ${new Date().toISOString()}`, ``];

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
