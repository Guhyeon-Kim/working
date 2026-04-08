#!/bin/bash
# Stop hook — 완료 기록 + 자동 품질 게이트 (v3.0 — CTO 단일 체계)

NOW=$(date '+%Y-%m-%d %H:%M')
TIMESTAMP=$(date +%s)
LOG=".claude/activity-log.md"
TMP=".claude/current-task.tmp"
QLOG=".claude/quality-gate-log.md"

[ ! -f "$TMP" ] && exit 0

TASK=$(sed -n '1p' "$TMP")
STARTED=$(sed -n '2p' "$TMP")

[ -z "$TASK" ] && { rm -f "$TMP"; exit 0; }

# ── 1. 소요시간 계산 ──────────────────────────────────────────────────────────
ELAPSED=$(( TIMESTAMP - ${STARTED:-TIMESTAMP} ))
if   [ $ELAPSED -lt 60 ];   then DURATION="${ELAPSED}초"
elif [ $ELAPSED -lt 3600 ]; then DURATION="$((ELAPSED/60))분 $((ELAPSED%60))초"
else DURATION="$((ELAPSED/3600))시간 $(((ELAPSED%3600)/60))분"
fi

if [ ! -f "$LOG" ]; then
    printf '# HubWise Invest — Activity Log\n\n---\n\n' > "$LOG"
fi
echo "- [완료] ${TASK} (${NOW} — ${DURATION})" >> "$LOG"

# ── 1-b. project-log.md 자동 기록 ─────────────────────────────────────────────
PLOG=".claude/project-log.md"
if [ -f "$PLOG" ]; then
    if ! grep -q "^## 🤖 자동 세션 로그" "$PLOG" 2>/dev/null; then
        printf '\n---\n\n## 🤖 자동 세션 로그\n\n' >> "$PLOG"
    fi
    echo "- [■ 종료] ${TASK} — ${NOW} (소요: ${DURATION})" >> "$PLOG"
fi

# ── 2. 자동 인코딩 게이트 (frontend 코드 변경 시) ────────────────────────────
CHANGED_FRONTEND=$(git diff --name-only HEAD 2>/dev/null | grep "^src" | head -1)

if [ -n "$CHANGED_FRONTEND" ]; then
    [ ! -f "$QLOG" ] && printf '# Quality Gate Log\n\n' > "$QLOG"

    BROKEN=$(python3 -c "
import os, re
pat1 = re.compile(r'[\x80-\x9f]')
pat2 = re.compile(r'[\u4e00-\u9fff\u3400-\u4dbf]')
count = 0
for root, dirs, files in os.walk('src'):
    dirs[:] = [d for d in dirs if d not in ['node_modules', '.next']]
    for f in files:
        if not f.endswith(('.tsx','.ts','.js','.jsx','.css')): continue
        try:
            with open(os.path.join(root, f), encoding='utf-8', errors='replace') as fh:
                for line in fh:
                    if pat1.search(line) or pat2.search(line):
                        count += 1
                        break
        except: pass
print(count)
" 2>/dev/null)

    if [ -n "$BROKEN" ] && [ "$BROKEN" -gt "0" ]; then
        echo "⚠️  [인코딩 FAIL] ${BROKEN}개 파일 오염 — 커밋 전 수정 필요" >&2
        echo "    참조: .claude/agents/frontend-agent.md → 인코딩 규칙" >&2
        echo "- [❌ 인코딩] ${TASK} — ${BROKEN}개 오염 (${NOW})" >> "$QLOG"
    else
        echo "- [✅ 인코딩] ${TASK} — PASS (${NOW})" >> "$QLOG"
    fi
fi

# ── 3. 주요 설정 파일 변경 경고 ──────────────────────────────────────────────
CONFIG_CHANGED=$(git diff --name-only HEAD 2>/dev/null | \
    grep -E "next\.config|tailwind\.config|tsconfig|supabase/migrations" | head -3)

if [ -n "$CONFIG_CHANGED" ]; then
    echo "📋 [설정 변경] 영향 범위 검토 필요:" >&2
    echo "$CONFIG_CHANGED" | while IFS= read -r f; do echo "    - $f" >&2; done
fi

rm -f "$TMP"
