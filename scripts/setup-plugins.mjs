#!/usr/bin/env node
/**
 * setup-plugins.mjs — Claude Code 플러그인 크로스 플랫폼 설치 도우미
 *
 * 목적: Codespace(Linux)와 Windows 로컬 양쪽에서 동일한 플러그인 세트를 유지.
 *       플러그인은 머신별 `--scope user` 설치라 sync-user-scope로 전파되지 않음.
 *
 * 실행:
 *   미리보기 (명령만 출력):  node scripts/setup-plugins.mjs
 *   실제 설치:               node scripts/setup-plugins.mjs --apply
 *
 * 동작:
 *   1. 플랫폼 판별 (linux / darwin / win32)
 *   2. claude CLI, python3, pip 가용성 확인
 *   3. 마켓플레이스 등록 (gptaku-plugins) — 중복 등록은 claude CLI가 내부 처리
 *   4. 플러그인 설치 (insane-design, insane-search, deep-research)
 *   5. Python 의존성 설치 (Pillow, yt-dlp, feedparser)
 *
 * Windows 주의사항:
 *   - Claude Code는 WSL2 위에서 실행 권장 (공식 안내)
 *   - WSL 내부에서 이 스크립트 실행하면 Linux와 동일하게 동작
 *   - Windows 네이티브 cmd/PowerShell에서 실행 시 `claude` PATH 및 `python` 별칭 확인 필요
 */

import { spawnSync } from 'child_process';
import { platform } from 'os';

const APPLY = process.argv.includes('--apply');
const PLATFORM = platform(); // 'linux' | 'darwin' | 'win32'
const IS_WIN = PLATFORM === 'win32';

const log = (...args) => console.log('[setup-plugins]', ...args);
const warn = (...args) => console.warn('[setup-plugins][경고]', ...args);

const MARKETPLACE_URL = 'https://github.com/fivetaku/gptaku_plugins.git';
const MARKETPLACE_NAME = 'gptaku-plugins';

const PLUGINS = [
  { name: 'insane-design', reason: 'URL → 실제 CSS 기반 디자인 시스템 추출 (design.md + 리포트)' },
  { name: 'insane-search', reason: 'WebFetch 차단 플랫폼 40+ 자동 우회 (X·Reddit·네이버·YouTube 자막 등)' },
  { name: 'deep-research', reason: '7단계 멀티에이전트 딥리서치 파이프라인 (A~E 소스 등급)' },
];

const PY_DEPS = [
  { name: 'Pillow', importCheck: 'PIL', reason: 'insane-design 이미지 처리' },
  { name: 'yt-dlp', importCheck: 'yt_dlp', reason: 'insane-search YouTube 자막 추출' },
  { name: 'feedparser', importCheck: 'feedparser', reason: 'insane-search RSS 파싱' },
];

// ─── 유틸 ───
// Windows는 `shell:true` 대신 `cmd.exe /d /s /c` 래핑 — DEP0190 경고 회피 + 인젝션 방지.
function run(cmd, args, { capture = false } = {}) {
  const opts = capture
    ? { encoding: 'utf8' }
    : { stdio: 'inherit' };
  const spawnCmd = IS_WIN ? 'cmd.exe' : cmd;
  const spawnArgs = IS_WIN ? ['/d', '/s', '/c', cmd, ...args] : args;
  const res = spawnSync(spawnCmd, spawnArgs, opts);
  return { status: res.status, stdout: res.stdout?.trim() };
}

function checkAvailable(cmd, versionFlag = '--version') {
  const res = run(cmd, [versionFlag], { capture: true });
  return res.status === 0;
}

function getPipCommand() {
  // Windows는 `pip`, Linux는 `pip3`가 일반적. 둘 다 시도.
  for (const candidate of ['pip3', 'pip']) {
    if (checkAvailable(candidate)) return candidate;
  }
  return null;
}

function getPythonCommand() {
  // Windows는 py 런처가 표준이고, `python`/`python3`은 MS Store 스텁(exit 49)일 수 있음.
  // 우선순위: python3 → python → py (Windows 호환)
  for (const candidate of ['python3', 'python', 'py']) {
    if (checkAvailable(candidate)) return candidate;
  }
  return null;
}

function checkPyImport(pythonCmd, moduleName) {
  const res = run(pythonCmd, ['-c', `import ${moduleName}`], { capture: true });
  return res.status === 0;
}

// ─── 1. 사전 점검 ───
log(`플랫폼: ${PLATFORM}${IS_WIN ? ' (WSL 권장)' : ''}`);
log(`모드: ${APPLY ? '실제 설치 (--apply)' : '미리보기'}`);

const claudeOk = checkAvailable('claude');
const pythonCmd = getPythonCommand();
const pipCmd = getPipCommand();

if (!claudeOk) {
  warn('claude CLI를 찾을 수 없습니다. Claude Code를 먼저 설치하세요.');
  if (IS_WIN) warn('Windows: WSL2에 npm install -g @anthropic-ai/claude-code');
  process.exit(1);
}
if (!pythonCmd) {
  warn('Python 3.11+이 필요합니다. Windows는 https://www.python.org/ 또는 winget install Python.Python.3.12');
  process.exit(1);
}
if (!pipCmd) {
  warn('pip가 필요합니다. python -m ensurepip --upgrade 로 설치 가능.');
  process.exit(1);
}

log(`claude: ok · python: ${pythonCmd} · pip: ${pipCmd}`);

// ─── 2. 마켓플레이스 등록 ───
log(`마켓플레이스 등록 (${MARKETPLACE_NAME})`);
if (APPLY) {
  run('claude', ['plugin', 'marketplace', 'add', MARKETPLACE_URL]);
} else {
  console.log(`  $ claude plugin marketplace add ${MARKETPLACE_URL}`);
}

// ─── 3. 플러그인 설치 ───
for (const plugin of PLUGINS) {
  const spec = `${plugin.name}@${MARKETPLACE_NAME}`;
  log(`플러그인: ${plugin.name} — ${plugin.reason}`);
  if (APPLY) {
    run('claude', ['plugin', 'install', spec]);
  } else {
    console.log(`  $ claude plugin install ${spec}`);
  }
}

// ─── 4. Python 의존성 설치 ───
for (const dep of PY_DEPS) {
  const already = dep.importCheck ? checkPyImport(pythonCmd, dep.importCheck) : false;
  if (already) {
    log(`Python: ${dep.name} 이미 설치됨`);
    continue;
  }
  log(`Python: ${dep.name} — ${dep.reason}`);
  if (APPLY) {
    run(pipCmd, ['install', '--quiet', dep.name]);
  } else {
    console.log(`  $ ${pipCmd} install ${dep.name}`);
  }
}

// ─── 5. 마무리 안내 ───
log('완료. Claude Code를 재시작하면 플러그인이 활성화됩니다.');
if (!APPLY) {
  log('실제 설치하려면: node scripts/setup-plugins.mjs --apply');
}
if (IS_WIN) {
  log('Windows 네이티브 환경이면 위 명령을 cmd/PowerShell에서 직접 실행하거나 WSL2로 전환하세요.');
}
