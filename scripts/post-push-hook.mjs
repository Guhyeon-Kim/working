/**
 * PostToolUse Bash hook — git push 감지 시 배포 완료 대기 후 site-check 실행
 * Vercel 빌드 평균 28~30초. HTTP 폴링으로 배포 완료 감지.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { spawn } from 'child_process'
import { join } from 'path'
import https from 'https'

const PROJECT_ROOT = process.cwd()
const FLAG_FILE = join(PROJECT_ROOT, '.claude', 'post-push-pending.md')
const SITE_CHECK_SCRIPT = join(PROJECT_ROOT, '.claude', 'scripts', 'site-check.mjs')
// 프로젝트별 BASE_URL: .claude/deploy-config.json 또는 환경변수에서 읽기
let BASE_URL = 'https://hubwise-invest.com'
try {
  const deployConfig = JSON.parse(readFileSync(join(PROJECT_ROOT, '.claude', 'deploy-config.json'), 'utf-8'))
  if (deployConfig.baseUrl) BASE_URL = deployConfig.baseUrl
} catch { /* 기본값 사용 */ }

function log(msg) {
  process.stdout.write(`[post-push] ${msg}\n`)
}

function writeFlag(status) {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  writeFileSync(FLAG_FILE, `${status}\n생성: ${now}\n`, 'utf-8')
}

function removeFlag() {
  try { unlinkSync(FLAG_FILE) } catch { /* 없으면 무시 */ }
}

function httpGet(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('error', () => resolve(0))
    req.on('timeout', () => { req.destroy(); resolve(0) })
  })
}

async function waitForDeploy(maxWaitMs = 180_000) {
  // 첫 대기: Vercel 빌드 최소 시간
  log('30초 초기 대기 (Vercel 빌드 중)...')
  await new Promise(r => setTimeout(r, 30_000))

  const start = Date.now()
  log('사이트 응답 폴링 시작...')

  while (Date.now() - start < maxWaitMs) {
    const status = await httpGet(BASE_URL)
    log(`HTTP 상태: ${status}`)
    if (status >= 200 && status < 400) {
      log('사이트 정상 응답 확인')
      return true
    }
    await new Promise(r => setTimeout(r, 10_000))
  }

  log('배포 대기 타임아웃')
  return false
}

async function runSiteCheck() {
  log('site-check 시작...')
  return new Promise((resolve) => {
    const child = spawn('node', [SITE_CHECK_SCRIPT, BASE_URL], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    })
    child.on('close', code => { log(`site-check 완료 (exit: ${code})`); resolve(code === 0) })
    child.on('error', e => { log(`site-check 오류: ${e.message}`); resolve(false) })
  })
}

async function main() {
  let raw = ''
  try { raw = readFileSync(0, 'utf-8') } catch { return }

  let data
  try { data = JSON.parse(raw) } catch { return }

  const cmd = data?.tool_input?.command ?? ''
  if (!cmd.includes('git push')) return

  log(`git push 감지: ${cmd.trim()}`)
  writeFlag('배포 후 점검 필요')

  const ready = await waitForDeploy()

  if (ready) {
    writeFlag('배포 완료 — site-check 실행 중')
    const passed = await runSiteCheck()
    if (passed) {
      removeFlag()
      log('모든 점검 통과. 완료.')
    } else {
      writeFlag('site-check 실패 — 수동 확인 필요')
    }
  } else {
    writeFlag('배포 타임아웃 — 수동 확인 필요')
  }
}

main().catch(e => log(`오류: ${e.message}`))
