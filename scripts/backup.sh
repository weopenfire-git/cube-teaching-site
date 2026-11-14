#!/bin/sh
# cube-deploy 每日备份：SQLite 数据卷 -> /opt/cube-backups/*.tgz，保留最近 14 天
# 由 root crontab 调用（docker 命令需要 root）。
mkdir -p /opt/cube-backups
docker run --rm -v cube-deploy_cube-auth-data:/data -v /opt/cube-backups:/b alpine \
  sh -c 'tar czf /b/auth-db-$(date +%F).tgz -C /data . ; find /b -name "auth-db-*.tgz" -mtime +13 -delete'
echo "$(date "+%F %T") backup ok: $(ls -1 /opt/cube-backups | tail -1)"
