#!/bin/bash
# UserPromptSubmit hook — 작업 기록 + 위험 감지 (v3.0 — CTO 단일 체계)

export PYTHONIOENCODING=utf-8
export PYTHONUTF8=1

NOW=$(date '+%Y-%m-%d %H:%M')
TIMESTAMP=$(date +%s)
LOG=".claude/activity-log.md"
TMP=".claude/current-task.tmp"

INPUT=$(cat)

TASK_NAME=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    text = data.get('prompt', '') or data.get('message', '')
except:
    text = sys.stdin.read()
line = str(text).split('\n')[0][:80].strip()
print(line)
" 2>/dev/null)

if [ -z "$TASK_NAME" ]; then
    TASK_NAME=$(echo "$INPUT" | tr -d '{}\"\\n' | cut -c1-80 | sed 's/prompt://g' | sed 's/^[[:space:]]*//')
fi

[ ${#TASK_NAME} -lt 5 ] && exit 0

# ── 1. 금융 안전 표현 감지 ────────────────────────────────────────────────────
FINANCIAL_RISK=$(python3 -c "
text = '${TASK_NAME//\'/}'
banned = ['무조건', '확실히 오른', '수익 보장', '틀림없이', '반드시 상승', '원금 보장', '손실 없이']
found = [w for w in banned if w in text]
if found: print(' / '.join(found))
" 2>/dev/null)

if [ -n "$FINANCIAL_RISK" ]; then
    echo "⚠️  [금융 안전 정책] 금지 표현 감지: $FINANCIAL_RISK" >&2
    echo "    허용: '가능성' '경향' '과거 데이터 기준' '리스크'" >&2
fi

# ── 2. 파괴적·비가역적 작업 감지 ──────────────────────────────────────────────
DANGER=$(echo "$TASK_NAME" | grep -iE \
    "drop table|delete from|truncate|force.?push|--force|rm -rf|reset --hard|DROP DATABASE|purge" \
    2>/dev/null)

if [ -n "$DANGER" ]; then
    echo "🚨 [위험 작업] 비가역적 작업 감지: $DANGER" >&2
    echo "    CTO 리스크 분석 및 백업 계획 수립 후 진행." >&2
fi

# ── 3. 보안 위험 패턴 감지 ────────────────────────────────────────────────────
SECURITY=$(echo "$TASK_NAME" | grep -iE \
    "service_role|anon_key|\.env|하드코딩.*key|api.key.*코드" \
    2>/dev/null)

if [ -n "$SECURITY" ]; then
    echo "🔒 [보안] 민감 정보 관련 작업: $SECURITY" >&2
    echo "    .env 수정 금지. Vercel/Cloud Run 대시보드에서만 설정." >&2
fi

# ── 4. 이전 작업 재시작 감지 ──────────────────────────────────────────────────
if [ -f "$TMP" ]; then
    OLD_TASK=$(sed -n '1p' "$TMP")
    OLD_STARTED=$(sed -n '2p' "$TMP")
    if [ -n "$OLD_STARTED" ]; then
        OLD_AGE=$(( TIMESTAMP - OLD_STARTED ))
        [ "$OLD_AGE" -gt 1800 ] && echo "- [재시작] ${OLD_TASK} (${NOW})" >> "$LOG"
    fi
fi

# ── 5. 현재 작업 기록 ─────────────────────────────────────────────────────────
printf '%s\n%s\n%s\n' "$TASK_NAME" "$TIMESTAMP" "$NOW" > "$TMP"

if [ ! -f "$LOG" ]; then
    printf '# HubWise Invest — Activity Log\n\n---\n\n' > "$LOG"
fi

echo "- [시작] ${TASK_NAME} (${NOW})" >> "$LOG"

# ── 5-b. project-log.md 자동 기록 ─────────────────────────────────────────────
PLOG=".claude/project-log.md"
if [ -f "$PLOG" ]; then
    # 자동 세션 로그 섹션이 없으면 파일 끝에 추가
    if ! grep -q "^## 🤖 자동 세션 로그" "$PLOG" 2>/dev/null; then
        printf '\n---\n\n## 🤖 자동 세션 로그\n\n' >> "$PLOG"
    fi
    echo "- [▶ 시작] ${TASK_NAME} — ${NOW}" >> "$PLOG"
fi

# ── 6. 광고/사이드바/레이아웃 변경 감지 ────────────────────────────────────────
AD_LAYOUT=$(echo "$TASK_NAME" | grep -iE \
    "광고|사이드바|sidebar|AdBanner|adfit|레이아웃|layout|banner|배너" \
    2>/dev/null)

if [ -n "$AD_LAYOUT" ]; then
    echo "📋 [디자인 가이드 체크 필수] 광고/레이아웃 작업 감지: $AD_LAYOUT" >&2
    echo "    → .claude/docs/design-guide-v2.md Section 7 (광고 배치 가이드) 먼저 읽을 것" >&2
    echo "    → 기존 구조(사이드바 등) 제거 시 CEO 확인 필수" >&2
fi
