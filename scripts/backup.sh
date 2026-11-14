#!/bin/sh
# 每日备份：SQLite 卷 -> /opt/cube-backups/*.tgz，本地保留最近 90 天；
# 若存在 /opt/cube-backup-key（GitHub deploy key），自动推送到私有仓 weopenfire-git/cube-backups
BK=/opt/cube-backups
mkdir -p "$BK"
docker run --rm -v cube-deploy_cube-auth-data:/data -v "$BK":/b alpine \
  sh -c 'tar czf /b/auth-db-$(date +%F).tgz -C /data . ; find /b -name "auth-db-*.tgz" -mtime +89 -delete'
echo "$(date "+%F %T") backup ok: $(ls -1 "$BK" | tail -1)"

# ---- 异地容灾：deploy key 已配置则推 GitHub ----
[ -f /opt/cube-backup-key ] || exit 0
mkdir -p /root/.ssh
export GIT_SSH_COMMAND="ssh -i /opt/cube-backup-key -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/root/.ssh/known_hosts_backup"
cd "$BK" || exit 0
if [ ! -d .git ]; then
  git init -q -b main
  git remote add origin git@github.com:weopenfire-git/cube-backups.git
fi
git add -A
git -c user.email=backup@cube.local -c user.name=cube-backup commit -qm "backup $(date +%F)" 2>/dev/null
if git push -q -u origin main 2>/dev/null; then
  echo "$(date "+%F %T") pushed to GitHub"
else
  echo "$(date "+%F %T") push skipped/failed（deploy key 未生效或网络问题，本地备份不受影响）"
fi
