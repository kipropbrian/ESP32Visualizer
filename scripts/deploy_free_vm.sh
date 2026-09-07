#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm test
npm run build
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="/private/tmp/esp32-pin-lab-${stamp}.tar.gz"
COPYFILE_DISABLE=1 tar -czf "$archive" -C dist .
remote_archive="/tmp/esp32-pin-lab-${stamp}.tar.gz"
remote_script="/tmp/esp32-install-${stamp}.py"
gcloud compute scp --project=gen-lang-client-0437984435 --zone=us-central1-a --tunnel-through-iap "$archive" "voltus-free-vm:${remote_archive}"
gcloud compute scp --project=gen-lang-client-0437984435 --zone=us-central1-a --tunnel-through-iap scripts/install_remote.py "voltus-free-vm:${remote_script}"
gcloud compute ssh voltus-free-vm --project=gen-lang-client-0437984435 --zone=us-central1-a --tunnel-through-iap --ssh-flag='-o ConnectTimeout=10' --command="sudo python3 '$remote_script' '$remote_archive'"
gcloud compute ssh voltus-free-vm --project=gen-lang-client-0437984435 --zone=us-central1-a --tunnel-through-iap --ssh-flag='-o ConnectTimeout=10' --command='curl -fsS --resolve experiments.maiyoinstitute.org:443:127.0.0.1 https://experiments.maiyoinstitute.org/esp32/ >/dev/null && sudo nginx -t && systemctl is-active nginx'
