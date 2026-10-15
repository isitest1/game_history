#!/usr/bin/env bash
# 独自ドメイン umaredoshi.margheritaworks.com を設定する（docs/08_独自ドメイン.md）。
# 1. Cloudflare の DNS に CNAME（umaredoshi → isitest1.github.io、プロキシはオフ）を作る
# 2. GitHub Pages の Custom domain に umaredoshi.margheritaworks.com を入れる
# 3. 証明書ができるのを待ち、HTTPS を必須にする
# トークンは、クラウド環境の「ネットワークのシークレット」に入れる（api.cloudflare.com と api.github.com への通信に、Authorization を自動で付ける）。
# 環境変数 CLOUDFLARE_API_TOKEN / GITHUB_PAGES_TOKEN があれば、そちらを使う
set -euo pipefail

ZONE_NAME=margheritaworks.com
SUB=umaredoshi
FQDN="$SUB.$ZONE_NAME"
TARGET=isitest1.github.io
REPO=isitest1/game_history
CF=https://api.cloudflare.com/client/v4
GH=https://api.github.com

cfh=(-H "Content-Type: application/json")
ghh=(-H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] && cfh+=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
[ -n "${GITHUB_PAGES_TOKEN:-}" ] && ghh+=(-H "Authorization: Bearer $GITHUB_PAGES_TOKEN")
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1"; }

echo "== 1. Cloudflare の DNS"
ZONE_ID=$(curl -sS "${cfh[@]}" "$CF/zones?name=$ZONE_NAME" | json "d['result'][0]['id']")
echo "ゾーン: $ZONE_ID"
REC=$(curl -sS "${cfh[@]}" "$CF/zones/$ZONE_ID/dns_records?name=$FQDN")
COUNT=$(echo "$REC" | json "len(d['result'])")
BODY="{\"type\":\"CNAME\",\"name\":\"$SUB\",\"content\":\"$TARGET\",\"proxied\":false,\"ttl\":1,\"comment\":\"生まれ年ガチャ（GitHub Pages）\"}"
if [ "$COUNT" = "0" ]; then
  curl -sS -X POST "${cfh[@]}" "$CF/zones/$ZONE_ID/dns_records" --data "$BODY" | json "('作成しました' if d['success'] else d['errors'])"
else
  ID=$(echo "$REC" | json "d['result'][0]['id']")
  curl -sS -X PUT "${cfh[@]}" "$CF/zones/$ZONE_ID/dns_records/$ID" --data "$BODY" | json "('更新しました' if d['success'] else d['errors'])"
fi

echo "== 2. GitHub Pages の Custom domain"
curl -sS -o /dev/null -w "%{http_code}\n" -X PUT "${ghh[@]}" "$GH/repos/$REPO/pages" --data "{\"cname\":\"$FQDN\"}"

echo "== 3. 証明書を待って HTTPS を必須にする（最長60分）"
for i in $(seq 1 120); do
  STATE=$(curl -sS "${ghh[@]}" "$GH/repos/$REPO/pages" | json "(d.get('https_certificate') or {}).get('state','none')")
  echo "証明書: $STATE"
  if [ "$STATE" = "approved" ]; then
    curl -sS -o /dev/null -w "HTTPS必須: %{http_code}\n" -X PUT "${ghh[@]}" "$GH/repos/$REPO/pages" --data "{\"cname\":\"$FQDN\",\"https_enforced\":true}"
    break
  fi
  sleep 30
done
curl -sS -o /dev/null -w "https://$FQDN/ → %{http_code}\n" "https://$FQDN/"
