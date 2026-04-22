#!/usr/bin/env node
/**
 * install-hooks.mjs — Working Hub 훅 설정 설치기
 *
 * 목적:
 *   <repo>/settings.json (템플릿, __HOME__ 플레이스홀더 포함)을 읽어
 *   ~/.claude/settings.json의 "hooks" 필드에만 머지한다.
 *   기존 mcpServers·permissions 등 다른 필드는 건드리지 않는다.
 *
 * 사용법:
 *   node scripts/install-hooks.mjs --dry-run   # diff만 출력
 *   node scripts/install-hooks.mjs             # 백업 + 설치
 *
 * 동작:
 *   1. <repo>/settings.json 읽기
 *   2. __HOME__ → os.homedir() (Windows 경로), __HOME_POSIX__ → POSIX 형식
 *   3. 기존 ~/.claude/settings.json 읽기 (없으면 빈 객체)
 *   4. result = { ...existing, hooks: template.hooks }
 *   5. --dry-run이면 변경 내용만 출력하고 종료
 *   6. 실제 쓰기 전에 ~/.claude/settings.json.backup-<timestamp> 생성
 *   7. 병합 결과를 ~/.claude/settings.json에 쓰고 JSON.parse로 검증
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform } from 'os';

const DRY_RUN = process.argv.includes('--dry-run');
const REPO_ROOT = process.cwd();
const TEMPLATE_PATH = join(REPO_ROOT, 'settings.json');
const USER_SETTINGS_DIR = join(homedir(), '.claude');
const USER_SETTINGS_PATH = join(USER_SETTINGS_DIR, 'settings.json');

function posixHome() {
  const h = homedir();
  if (platform() === 'win32') {
    // C:\Users\x → /c/Users/x
    const drive = h.charAt(0).toLowerCase();
    return '/' + drive + h.slice(2).replace(/\\/g, '/');
  }
  return h;
}

function expandPlaceholders(str) {
  const home = homedir();
  return str
    .replace(/__HOME_POSIX__/g, posixHome())
    .replace(/__HOME__/g, home);
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`JSON 파싱 실패: ${path} — ${e.message}`);
  }
}

function summarizeHooks(hooks) {
  if (!hooks || typeof hooks !== 'object') return '  (hooks 필드 없음)';
  const lines = [];
  for (const [lifecycle, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    const commandCount = entries.reduce((acc, e) => acc + (e.hooks?.length || 0), 0);
    lines.push(`  ${lifecycle}: ${entries.length} matcher block(s), ${commandCount} command(s)`);
  }
  return lines.join('\n') || '  (비어있음)';
}

function main() {
  console.log(`[install-hooks] 모드: ${DRY_RUN ? 'DRY RUN' : '설치'}`);
  console.log(`[install-hooks] 템플릿: ${TEMPLATE_PATH}`);
  console.log(`[install-hooks] 타겟: ${USER_SETTINGS_PATH}`);
  console.log('');

  // 1. 템플릿 읽기
  if (!existsSync(TEMPLATE_PATH)) {
    console.error(`[오류] 템플릿 없음: ${TEMPLATE_PATH}`);
    process.exit(1);
  }
  let templateRaw = readFileSync(TEMPLATE_PATH, 'utf8');
  templateRaw = expandPlaceholders(templateRaw);

  let template;
  try {
    template = JSON.parse(templateRaw);
  } catch (e) {
    console.error(`[오류] 템플릿 JSON 파싱 실패: ${e.message}`);
    process.exit(1);
  }

  if (!template.hooks) {
    console.error('[오류] 템플릿에 hooks 필드 없음. 머지할 대상이 없습니다.');
    process.exit(1);
  }

  // 2. 기존 user settings 읽기
  const existing = readJson(USER_SETTINGS_PATH) || {};
  const existingKeys = Object.keys(existing);

  console.log('[기존 ~/.claude/settings.json]');
  if (existingKeys.length === 0) {
    console.log('  (파일 없음 또는 비어있음)');
  } else {
    for (const k of existingKeys) {
      if (k === 'hooks') {
        console.log(`  ${k}: (아래 hooks 머지 대상)`);
      } else if (k === 'mcpServers') {
        const count = Object.keys(existing[k] || {}).length;
        console.log(`  ${k}: ${count}개 서버 (보존)`);
      } else if (k === 'permissions') {
        const allowCount = existing[k]?.allow?.length || 0;
        console.log(`  ${k}: allow ${allowCount}개 (보존)`);
      } else {
        console.log(`  ${k}: (보존)`);
      }
    }
  }
  console.log('');

  console.log('[기존 hooks]');
  console.log(summarizeHooks(existing.hooks));
  console.log('');

  console.log('[템플릿 hooks — 머지 후 상태]');
  console.log(summarizeHooks(template.hooks));
  console.log('');

  // 3. 머지 (hooks만 교체, 나머지는 보존)
  const merged = { ...existing, hooks: template.hooks };

  // 4. JSON 검증
  let mergedStr;
  try {
    mergedStr = JSON.stringify(merged, null, 2) + '\n';
    JSON.parse(mergedStr);
  } catch (e) {
    console.error(`[오류] 머지 결과 JSON 검증 실패: ${e.message}`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('[DRY RUN — 쓰기 없음]');
    console.log(`머지 후 파일 크기: ${mergedStr.length} bytes`);
    console.log(`전체 top-level 필드: ${Object.keys(merged).join(', ')}`);
    console.log('');
    console.log('실제 적용하려면 --dry-run 플래그 없이 재실행하세요.');
    return;
  }

  // 5. 백업
  mkdirSync(USER_SETTINGS_DIR, { recursive: true });
  if (existsSync(USER_SETTINGS_PATH)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = `${USER_SETTINGS_PATH}.backup-${ts}`;
    copyFileSync(USER_SETTINGS_PATH, backupPath);
    console.log(`[백업] ${backupPath}`);
  }

  // 6. 쓰기
  writeFileSync(USER_SETTINGS_PATH, mergedStr, 'utf8');
  console.log(`[완료] ${USER_SETTINGS_PATH} 갱신`);

  const lifecycleCount = Object.keys(template.hooks).length;
  const totalCommands = Object.values(template.hooks)
    .flat()
    .reduce((acc, e) => acc + (e.hooks?.length || 0), 0);
  console.log(`[요약] ${lifecycleCount}개 라이프사이클, ${totalCommands}개 command 엔트리 등록됨.`);
  console.log('[안내] 다음 세션부터 훅이 자동 발동합니다.');
}

main();
