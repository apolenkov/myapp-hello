# infra-ansible

Ansible playbooks for disaster recovery of the myapp-hello VPS.

## Prerequisites

- Ansible installed locally
- SSH access to VPS (185.239.48.55)
- rclone configured with Cloudflare R2
- ansible-vault password

## Full restore from scratch

```bash
ansible-playbook -i inventory.yml playbooks/site.yml --ask-vault-pass
```

## Smoke test only

```bash
ansible-playbook -i inventory.yml playbooks/06-smoke.yml
```

## Dry run (no changes)

```bash
ansible-playbook -i inventory.yml playbooks/site.yml --check --ask-vault-pass
```
