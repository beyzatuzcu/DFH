#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${1:-$(pwd)}"

echo "DFH GitHub Pages public demo kuruluyor..."
echo "Kaynak: $SCRIPT_DIR"
echo "Repo:   $ROOT"

cp "$SCRIPT_DIR/index.html" "$ROOT/index.html"
cp "$SCRIPT_DIR/styles.css" "$ROOT/styles.css"
cp "$SCRIPT_DIR/app.js" "$ROOT/app.js"
cp "$SCRIPT_DIR/.nojekyll" "$ROOT/.nojekyll"

echo ""
echo "Dosyalar repo köküne kopyalandı."
echo "Şimdi çalıştır:"
echo "  git add -A"
echo "  git commit -m \"feat: publish static Digital Fraud Hub demo\""
echo "  git push origin main"
echo ""
echo "GitHub > Settings > Pages:"
echo "  Source: Deploy from a branch"
echo "  Branch: main"
echo "  Folder: /(root)"
