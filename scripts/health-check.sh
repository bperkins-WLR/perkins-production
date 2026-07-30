#!/bin/bash
# Health check for perkinsproduction.com
# Usage: bash scripts/health-check.sh

SITE="https://www.perkinsproduction.com"
PASS=0
FAIL=0

check() {
    local label="$1"
    local ok="$2"
    if [ "$ok" = "yes" ]; then
        echo "  PASS  $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL  $label"
        FAIL=$((FAIL + 1))
    fi
}

status_of() {
    curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$1"
}

echo "Perkins Production health check: $(date '+%Y-%m-%d %H:%M')"
echo ""

# Pages
[ "$(status_of "$SITE/")" = "200" ] && ok=yes || ok=no
check "Homepage responds" $ok

body=$(curl -s --max-time 15 "$SITE/")
echo "$body" | grep -q "PERKINS" && ok=yes || ok=no
check "Homepage content looks right" $ok

[ "$(status_of "$SITE/admin.html")" = "200" ] && ok=yes || ok=no
check "Admin page responds" $ok

# Photo API
images=$(curl -s --max-time 15 "$SITE/api/images" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('images', {})))" 2>/dev/null)
[ -n "$images" ] && [ "$images" -ge 10 ] && ok=yes || ok=no
check "Photo API returns images ($images found)" $ok

# Hero reel videos
for clip in wedding-featured wedding-details wedding-firstdance portrait-engagement portrait-senior portrait-creative wedding-ceremony wedding-reception; do
    [ "$(status_of "$SITE/reel/$clip.mp4")" = "200" ] && ok=yes || ok=no
    check "Hero clip: $clip" $ok
done

# Contact form wiring
echo "$body" | grep -q "formsubmit.co/ajax" && ok=yes || ok=no
check "Contact form endpoint configured" $ok
echo "$body" | grep -q "_autoresponse" && ok=yes || ok=no
check "Auto-reply configured" $ok

# SEO files
[ "$(status_of "$SITE/sitemap.xml")" = "200" ] && ok=yes || ok=no
check "Sitemap serving" $ok
[ "$(status_of "$SITE/robots.txt")" = "200" ] && ok=yes || ok=no
check "Robots file serving" $ok
echo "$body" | grep -q "application/ld+json" && ok=yes || ok=no
check "LocalBusiness structured data present" $ok

# Matterport tour
[ "$(status_of "https://my.matterport.com/show/?m=9zKWY8ZmbjB")" = "200" ] && ok=yes || ok=no
check "Matterport tour reachable" $ok

# Latest deploy (only if GitHub CLI is available)
if command -v gh >/dev/null 2>&1; then
    state=$(gh api repos/bperkins-WLR/perkins-production/commits/main/status -q '.state' 2>/dev/null)
    [ "$state" = "success" ] && ok=yes || ok=no
    check "Latest Vercel deploy ($state)" $ok
fi

echo ""
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "All systems go." || echo "Something needs attention. Ask Claude to investigate."
exit $FAIL
