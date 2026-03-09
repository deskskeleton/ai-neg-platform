# DSRI Deployment Guide

## Prerequisites

- Access to DSRI (OpenShift OKD 4.14) with `oc` CLI installed
- A container registry accessible from DSRI (Docker Hub, UM registry, etc.)
- A project/namespace on DSRI

## Step-by-step

### 1. Build and push the app image

```bash
# From the ai-neg-platform directory
docker build -t your-registry/neg-platform:latest .
docker push your-registry/neg-platform:latest
```

### 2. Log in to DSRI

```bash
oc login https://console.dsri2.unimaas.nl --token=<your-token>
oc project <your-namespace>
```

### 3. Create the secrets

```bash
oc create secret generic neg-platform-env \
  --from-literal=DATABASE_URL=postgresql://neg:YOUR_PASSWORD@neg-postgres:5432/negplatform \
  --from-literal=POSTGRES_PASSWORD=YOUR_PASSWORD
```

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

Update the image in `app-deployment.yaml` to match your registry, then:

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
