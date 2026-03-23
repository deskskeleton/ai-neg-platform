# DSRI Deployment Guide

## Prerequisites

- Access to DSRI (OpenShift OKD 4.14) with `oc` CLI installed
- Access to the UM network (VPN if off-campus)
- A project/namespace on DSRI

## Step-by-step

### 1. Log in to DSRI

Connect to the UM network (VPN if off-campus), then:

1. Open the DSRI console: `https://console-openshift-console.apps.dsri2.unimaas.nl`
2. Log in with your UM credentials.
3. Click **Copy Login Command** (top-right) and paste it in your terminal:

```bash
oc login https://api.dsri2.unimaas.nl:6443 --token=<your-token>
oc project <your-namespace>
```

Password-only login is not supported; always use the token from the web UI.

### 2. Build the app image on-cluster

Run from the `ai-neg-platform` repository root:

```bash
oc new-build --name neg-platform --binary
oc start-build neg-platform --from-dir=. --follow --wait
```

This creates an ImageStream `neg-platform` in your namespace. Note your namespace name — you'll need it next.

### 3. Patch the image reference in the deployment

The image is already set to the `sbe-dad-aineg` namespace. No changes needed.

### 4. Create the secret

```bash
oc create secret generic neg-platform-env \
  --from-literal=DATABASE_URL=postgresql://neg:YOUR_PASSWORD@neg-postgres:5432/negplatform \
  --from-literal=POSTGRES_PASSWORD=YOUR_PASSWORD
```

Create this **before** deploying PostgreSQL so the pod can read `POSTGRES_PASSWORD`.

### 5. Deploy PostgreSQL

```bash
oc apply -f openshift/postgres-deployment.yaml
```

Wait for the pod to be ready, then initialize the schema:

```bash
POD=$(oc get pods -l app=neg-postgres -o jsonpath='{.items[0].metadata.name}')
oc cp server/db/init.sql $POD:/tmp/init.sql
oc exec $POD -- psql -U neg -d negplatform -f /tmp/init.sql
```

### 6. Deploy Ollama

```bash
oc apply -f openshift/ollama-deployment.yaml
```

Wait for the pod to be ready, then pull the model (this takes a few minutes):

```bash
POD=$(oc get pods -l app=ollama -o jsonpath='{.items[0].metadata.name}')
oc exec $POD -- ollama pull llama3.2:3b
```

### 7. Deploy the app server

Ensure the `image:` line in `openshift/app-deployment.yaml` has `NAMESPACE` replaced with your project name, then:

```bash
oc apply -f openshift/app-deployment.yaml
```

### 8. Verify

```bash
oc get pods
oc get routes
```

The app should be available at `https://neg-platform.apps.dsri2.unimaas.nl`.

---

## Updating the app

```bash
oc start-build neg-platform --from-dir=. --follow --wait
oc rollout restart deployment/neg-platform
```

## Database backup

```bash
POD=$(oc get pods -l app=neg-postgres -o jsonpath='{.items[0].metadata.name}')
oc exec $POD -- pg_dump -U neg -d negplatform -F c -f /tmp/backup.dump
oc cp $POD:/tmp/backup.dump ./backup_$(date +%Y%m%d).dump
```
