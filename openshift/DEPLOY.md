# DSRI Deployment Guide

Deploy the AI Negotiation Experiment Platform on the UM DSRI (OpenShift/Kubernetes).

**Architecture:** 3 pods on DSRI — app server (Node.js + React), PostgreSQL, and Ollama (LLM). Participants on the UM wired network access the app via an OpenShift Route (HTTPS). Ollama and PostgreSQL are internal-only (ClusterIP).

---

## Prerequisites

- DSRI account with a project/namespace allocated
- `oc` CLI installed ([OpenShift CLI docs](https://docs.openshift.com/container-platform/latest/cli_reference/openshift_cli/getting-started-cli.html))
- Docker installed locally (for building images)
- GitHub account (for GitHub Container Registry)

---

## One-time setup

### 1. Set up GitHub Container Registry (ghcr.io)

Create a GitHub Personal Access Token (PAT) with `write:packages` scope:

```bash
# Log in to ghcr.io from your local machine
echo YOUR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### 2. Book GPU time on DSRI

The Ollama LLM pod requires a GPU for responsive inference with 6-18 concurrent participants. Use the DSRI GPU calendar system to reserve GPU time for your experiment session dates.

### 3. Log in to DSRI

Get your login token from the DSRI web console (top-right → Copy Login Command):

```bash
oc login https://console.dsri2.unimaas.nl --token=<your-token>
oc project <your-namespace>
```

### 4. Verify storage class

```bash
oc get storageclass
```

If the default storage class differs from `csi-cephfs`, update the `storageClassName` in `postgres-deployment.yaml` and `ollama-deployment.yaml` accordingly.

### 5. Create image pull secret (if ghcr.io repo is private)

```bash
oc create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_PAT
oc secrets link default ghcr-pull-secret --for=pull
```

If using this, also uncomment the `imagePullSecrets` block in `app-deployment.yaml`.

---

## Deployment

### 1. Build and push the app image

```bash
# From the ai-neg-platform directory
docker build -t ghcr.io/YOUR_GITHUB_USERNAME/neg-platform:latest .
docker push ghcr.io/YOUR_GITHUB_USERNAME/neg-platform:latest
```

### 2. Update the image reference

Edit `openshift/app-deployment.yaml` and replace `YOUR_GITHUB_USERNAME` with your actual GitHub username in the `image:` field.

### 3. Create secrets

```bash
oc create secret generic neg-platform-env \
  --from-literal=DATABASE_URL=postgresql://neg:YOUR_PASSWORD@neg-postgres:5432/negplatform \
  --from-literal=POSTGRES_PASSWORD=YOUR_PASSWORD \
  --from-literal=ADMIN_PASSWORD=YOUR_ADMIN_PASSWORD
```

### 4. Deploy PostgreSQL

```bash
oc apply -f openshift/postgres-deployment.yaml
```

Wait for the pod to be ready, then initialize the database:

```bash
POD=$(oc get pods -l app=neg-postgres -o jsonpath='{.items[0].metadata.name}')
oc cp server/db/init.sql $POD:/tmp/init.sql
oc exec $POD -- psql -U neg -d negplatform -f /tmp/init.sql
```

### 5. Deploy Ollama (GPU)

```bash
oc apply -f openshift/ollama-deployment.yaml
```

Wait for the pod to be ready (may take a few minutes on GPU node), then pull the model:

```bash
POD=$(oc get pods -l app=ollama -o jsonpath='{.items[0].metadata.name}')
oc exec $POD -- ollama pull llama3.2:3b
```

> **Important:** The `LLM_MODEL` env var in `app-deployment.yaml` is set to `llama3.2`. Make sure the model you pull here matches (e.g., `llama3.2:3b`). The model persists on the PVC, so this only needs to be done once.

### 6. Deploy the app server

```bash
oc apply -f openshift/app-deployment.yaml
```

### 7. Verify

```bash
oc get pods          # All 3 should be Running
oc get routes        # Shows the app URL
```

The app should be available at `https://neg-platform.apps.dsri2.unimaas.nl` (or whatever hostname you configured in the Route).

**Test it:** Open the URL in a browser on the UM network. Participants on wired lab terminals can reach this URL directly — no VPN needed for on-campus connections.

---

## Before each experiment session

1. Navigate to `https://<route-url>/admin` and log in with your ADMIN_PASSWORD
2. Create a new batch (6, 12, or 18 participants)
3. Generate tokens for participants (Admin → Tokens)
4. Distribute token URLs to participant terminals (e.g., `https://<route-url>/p/ABC12`)
5. Verify Ollama is responsive:
   ```bash
   POD=$(oc get pods -l app=ollama -o jsonpath='{.items[0].metadata.name}')
   oc exec $POD -- curl -s http://localhost:11434/api/tags
   ```

---

## After each experiment session

Back up the database (DSRI is not for long-term storage):

```bash
POD=$(oc get pods -l app=neg-postgres -o jsonpath='{.items[0].metadata.name}')
oc exec $POD -- pg_dump -U neg -d negplatform -F c -f /tmp/backup.dump
oc cp $POD:/tmp/backup.dump ./backup_$(date +%Y%m%d).dump
```

Download the backup to your local machine or UM storage.

---

## Updating the app

After making code changes:

```bash
docker build -t ghcr.io/YOUR_GITHUB_USERNAME/neg-platform:latest .
docker push ghcr.io/YOUR_GITHUB_USERNAME/neg-platform:latest
oc rollout restart deployment/neg-platform
```

---

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Pod stuck in `ImagePullBackOff` | Check image name, ensure pull secret is created and linked |
| WebSocket disconnects during session | The Route has `haproxy.router.openshift.io/timeout: 900s` annotation — verify it's applied: `oc get route neg-platform -o yaml` |
| Ollama slow responses | Confirm GPU is allocated: `oc describe pod <ollama-pod>` should show `nvidia.com/gpu: 1` in limits |
| DB connection refused | Ensure postgres pod is Running and the `DATABASE_URL` secret matches the postgres service name (`neg-postgres`) |
| Participants can't reach the URL | Confirm they're on the UM wired network. The Route is only accessible within the UM network |
