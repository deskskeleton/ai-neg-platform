# DSRI Deployment Guide

## Prerequisites

- Access to DSRI (OpenShift OKD 4.14) with `oc` CLI installed
- Access to the UM network (e.g. UM VPN)
- A project/namespace on DSRI
- Optionally: a container registry accessible from DSRI (Docker Hub, UM registry, etc.) if you do **not** use the on-cluster build

## Step-by-step

### 1. Log in to DSRI

1. Connect to the UM network (VPN if off-campus).
2. Open the DSRI OpenShift console: `https://console-openshift-console.apps.dsri2.unimaas.nl`.
3. Log in with your UM credentials.
4. In the top-right menu, click **Copy Login Command** and paste it into your terminal. It will look like:

```bash
oc login https://api.dsri2.unimaas.nl:6443 --token=<your-token>
```

5. Confirm/select your project:

```bash
oc project <your-namespace>
```

Password-only login is not supported; always use the token from the web UI.

### 2. Build the app image

You can either build on the DSRI cluster (recommended) or use an external registry.

**Option A – On-cluster binary build (recommended):**

```bash
# From the ai-neg-platform directory
oc new-build --name neg-platform --binary
oc start-build neg-platform --from-dir=. --follow --wait
```

This creates an ImageStream named `neg-platform`. In this case, set the image in `openshift/app-deployment.yaml` to:

```yaml
image: neg-platform:latest
```

**Option B – External registry:**

```bash
# From the ai-neg-platform directory
docker build -t your-registry/neg-platform:latest .
docker push your-registry/neg-platform:latest
```

Then set the image in `openshift/app-deployment.yaml` to that full registry URL.

### 3. Create the secrets

```bash
oc create secret generic neg-platform-env \
  --from-literal=DATABASE_URL=postgresql://neg:YOUR_PASSWORD@neg-postgres:5432/negplatform \
  --from-literal=POSTGRES_PASSWORD=YOUR_PASSWORD
```

Make sure this secret exists **before** the PostgreSQL deployment starts, so the pod can read `POSTGRES_PASSWORD`.

### 4. Deploy PostgreSQL

```bash
oc apply -f openshift/postgres-deployment.yaml
```

Wait for it to be ready, then initialize the database:

```bash
POD=$(oc get pods -l app=neg-postgres -o jsonpath='{.items[0].metadata.name}')
oc cp server/db/init.sql $POD:/tmp/init.sql
oc exec $POD -- psql -U neg -d negplatform -f /tmp/init.sql
```

### 5. Deploy Ollama

```bash
oc apply -f openshift/ollama-deployment.yaml
```

Pull the model (wait for the pod to be ready first):

```bash
POD=$(oc get pods -l app=ollama -o jsonpath='{.items[0].metadata.name}')
oc exec $POD -- ollama pull llama3.2:3b
```

### 6. Deploy the app server

Ensure the image is set correctly in `openshift/app-deployment.yaml` (either `neg-platform:latest` for on-cluster builds or your registry image), then:

```bash
oc apply -f openshift/app-deployment.yaml
```

### 7. Verify

```bash
oc get pods
oc get routes
```

The app should be available at `https://neg-platform.apps.dsri2.unimaas.nl`
(or whatever hostname you configured in the Route).

## Backups

To run a manual backup:

```bash
POD=$(oc get pods -l app=neg-postgres -o jsonpath='{.items[0].metadata.name}')
oc exec $POD -- pg_dump -U neg -d negplatform -F c -f /tmp/backup.dump
oc cp $POD:/tmp/backup.dump ./backup_$(date +%Y%m%d).dump
```

## Updating the app

```bash
docker build -t your-registry/neg-platform:latest .
docker push your-registry/neg-platform:latest
oc rollout restart deployment/neg-platform
```
