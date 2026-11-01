# Multi-Cloud Serverless & Container Architecture with Terraform

[![Terraform](https://img.shields.io/badge/Terraform-1.17+-7B42BC?logo=terraform&logoColor=white)](https://www.terraform.io/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers_%26_D1-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Azure](https://img.shields.io/badge/Azure-ACR_%26_ACI-0078D4?logo=microsoft-azure&logoColor=white)](https://azure.microsoft.com/)
[![Podman](https://img.shields.io/badge/Podman-5.8-892CA0?logo=podman&logoColor=white)](https://podman.io/)

A modern Infrastructure as Code (IaC) project orchestrating a hybrid **Multi-Cloud** architecture using **Terraform**, **Cloudflare** (Edge Computing + D1 SQLite Database), and **Microsoft Azure** (Azure Container Registry + Azure Container Instances) empaquetado con **Podman**.

---

## Architecture Overview

```
[ HTTP GET Request ] ──► Cloudflare Edge (Worker: worker.js)
                             ├──► Cloudflare D1 (SQLite visits table persistence)
                             └──► Microsoft Azure (Azure Container Instances via private ACR)
```

1. **Edge Layer (Cloudflare):**
   - **Cloudflare Worker:** Serverless JavaScript runtime handling incoming HTTP requests.
   - **Cloudflare D1:** Serverless SQL database storing persistent visit logs.
   - **Subdomain Integration:** Automatically mapped to public `*.workers.dev`.
2. **Container Compute Layer (Microsoft Azure):**
   - **Resource Group:** Dedicated resource isolation (`rg-practica11-iteso`).
   - **Azure Container Registry (ACR):** Private container registry storing container images.
   - **Azure Container Instances (ACI):** Serverless container compute running the backend microservice.
   - **Podman:** Rootless, daemonless OCI container build and push workflow.

---

## Repository Structure

```text
.
├── versions.tf                # Terraform version constraints & providers (cloudflare, azurerm, random)
├── variables.tf               # Input variable declarations
├── terraform.tfvars.example   # Sample variables file (credentials template)
├── main.tf                    # Cloudflare resources (D1, Worker script, subdomain)
├── azure.tf                   # Azure resources (RG, ACR, ACI container group)
├── outputs.tf                 # Public URLs and FQDN outputs
├── worker.js                  # Cloudflare Edge Worker script (ES Module)
└── container/
    ├── Dockerfile             # Container image specification (Node.js 20 Alpine)
    └── server.js              # Lightweight HTTP backend service
```

---

## Quickstart

### 1. Prerequisites
- [Terraform](https://www.terraform.io/) >= 1.5.0
- [Podman](https://podman.io/) or Docker
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/) logged in (`az login`)
- Cloudflare Account with an API Token (`Account.Workers Scripts: Edit`, `Account.D1: Edit`)

### 2. Configure Credentials
Copy the example variables file:
```bash
cp terraform.tfvars.example terraform.tfvars
```
Set your `account_id` and `api_token` in `terraform.tfvars`.

### 3. Deploy Infrastructure
```bash
# Initialize Terraform providers
terraform init

# Plan and apply base infrastructure (RG and ACR)
terraform apply -target=azurerm_container_registry.acr

# Build and push container with Podman
ACR_SERVER=$(terraform output -raw azure_acr_login_server)
ACR_PASS=$(az acr credential show --name $(terraform output -raw azure_acr_name) --query "passwords[0].value" -o tsv)
echo "$ACR_PASS" | podman login "$ACR_SERVER" -u $(terraform output -raw azure_acr_name) --password-stdin
podman build -t practica11-backend container/
podman tag localhost/practica11-backend:latest "$ACR_SERVER/backend:v1"
podman push "$ACR_SERVER/backend:v1"

# Complete full apply (ACI + Cloudflare Worker + D1)
terraform apply
```

### 4. Verify Endpoints
```bash
# Query the Cloudflare Edge Worker
curl -s $(terraform output -raw worker_url)

# Query the Azure Container directly
curl -s $(terraform output -raw azure_aci_url)
```

---

## Clean Up
To destroy all provisioned resources across Cloudflare and Azure:
```bash
terraform destroy
```
