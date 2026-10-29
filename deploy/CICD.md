# CI/CD

Two GitHub Actions workflows:

- **CI** (`.github/workflows/ci.yml`) runs on every push and pull request:
  - backend tests against a MySQL 8.4 test database
  - frontend typecheck, translation check and build

  A red ❌ on a commit or PR means something broke.
- **Deploy** (`.github/workflows/deploy.yml`) runs after CI passes on a push to `main`.
  1. It connects to the VPS over SSH and runs `deploy/deploy.sh` with the tested commit.
  2. The script fast-forwards the server's code to that commit, then rebuilds and restarts the containers.
  3. It waits for the API to report healthy (the API applies database migrations as it starts).
  4. It checks `https://<DOMAIN>/api/v1/health`.

  If any step fails, the run turns red and the log says why. A deploy never moves the server to a commit that isn't on `main`.

## One-time setup

### 1. Create the deploy key (on the VPS)

Log in to the VPS as the user that owns `~/food-order-app`, then run:

```bash
ssh-keygen -t ed25519 -N "" -C "github-actions-deploy" -f ~/.ssh/kaunter_deploy

# Allow this key to run the deploy script and nothing else.
echo "command=\"$HOME/food-order-app/deploy/deploy.sh\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $(cat ~/.ssh/kaunter_deploy.pub)" >> ~/.ssh/authorized_keys

chmod +x ~/food-order-app/deploy/deploy.sh

# Show the private key once, to copy into GitHub (step 2), then delete it from the server.
cat ~/.ssh/kaunter_deploy
rm ~/.ssh/kaunter_deploy
```

The `command=` part limits the key. Even if the GitHub secret leaked, it could only redeploy code that is already on `main`. It can't open a shell, read files or reach the database.

### 2. Add the secrets (on GitHub)

Go to the repository → **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Value |
|---|---|
| `VPS_HOST` | The server's IP address or host name, e.g. `43.159.33.177` |
| `VPS_USER` | The Linux user from step 1, e.g. `ubuntu` |
| `VPS_SSH_KEY` | The whole private key printed in step 1, including the `-----BEGIN` and `-----END` lines |
| `VPS_KNOWN_HOSTS` | Recommended. The output of `ssh-keyscan <VPS_HOST>` run on **your own computer**. It pins the server's identity. Without it, the workflow trusts whatever key answers and prints a warning. |

### 3. Try it

Push any commit to `main`, or re-run the last Deploy from the **Actions** tab. The Deploy log ends with `Deployed <commit> to https://<DOMAIN>`.

## Deploying by hand

This works exactly as before. On the VPS run `~/food-order-app/deploy/deploy.sh`, which deploys the latest `main`. Or give it a commit: `deploy/deploy.sh 1a2b3c4`.

## Turning automatic deploys off

To stop automatic deploys, either:
- disable the **Deploy** workflow in the Actions tab (CI keeps running), or
- remove the `command=...` line from `~/.ssh/authorized_keys` on the VPS.
