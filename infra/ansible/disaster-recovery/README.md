# Disaster Recovery Playbooks

Ansible playbooks for full VPS restore of the myapp-hello stack.

## Prerequisites

- Ansible installed locally (`pip install ansible`)
- SSH access to VPS (185.239.48.55)
- ansible-vault password for `infra/ansible/vars/vault.yml`
- Cloudflare R2 credentials (`r2_access_key_id`, `r2_secret_access_key`, `cf_account_id`) in vault

## Playbooks

| Playbook               | Purpose                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `01-base.yml`          | APT update, UFW firewall (SSH/HTTP/HTTPS), fail2ban, unattended-upgrades     |
| `02-docker.yml`        | Install Docker CE from official repository, enable Docker service            |
| `03-dokploy.yml`       | Download and run Dokploy install script (idempotent), wait for port 3000     |
| `04-rclone.yml`        | Install rclone via APT, write `rclone.conf` with Cloudflare R2 credentials   |
| `05-restore.yml`       | Pull latest backup from R2 bucket, restore Dokploy config and PostgreSQL DBs |
| `06-smoke.yml`         | Wait for apps on ports 3011–3013, verify `/health` returns 200               |
| `07-observability.yml` | Copy observability configs to VPS, write `.env`, start Promtail + Alloy      |

## Full Restore from Scratch

```bash
ansible-playbook -i ../inventory/hosts.yml site.yml --ask-vault-pass
```

Runs all 7 playbooks in order: base → docker → dokploy → rclone → restore → smoke → observability.

## Run Individual Playbooks

```bash
# Smoke test only
ansible-playbook -i ../inventory/hosts.yml 06-smoke.yml

# Redeploy observability agents
ansible-playbook -i ../inventory/hosts.yml 07-observability.yml --ask-vault-pass
```

## Dry Run (no changes)

```bash
ansible-playbook -i ../inventory/hosts.yml site.yml --check --ask-vault-pass
```

## Backup Source

The restore playbook (`05-restore.yml`) pulls from the Cloudflare R2 bucket `myapp-backups` using
rclone. The CI `db-backup.yml` workflow writes daily PostgreSQL dumps to Yandex Object Storage via
the Dokploy API — these must be manually mirrored to R2 before a disaster-recovery restore.

## See Also

- [Deployment Guide](../../../docs/deployment.md) — CI/CD pipeline, backup schedule, Yandex S3 setup
- [Observability Guide](../../../docs/observability.md) — Promtail + Alloy architecture
