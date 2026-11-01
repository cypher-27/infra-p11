# Práctica 11: Terraform con Cloudflare (y Expansión Multi-Cloud con Azure y Contenedores)

**Materia:** Infraestructura y Desarrollo Continuo — ITESO  
**Estudiante:** cyphernexon27  
**Fecha:** Noviembre 2026  

---

## 1. Resumen Ejecutivo
Esta práctica demuestra el aprovisionamiento automatizado mediante **Infraestructura como Código (IaC)** con **Terraform**. Se diseñó en dos etapas complementarias:

1. **Fase 1 (Cloudflare Edge & Serverless Database):** Despliegue de un **Cloudflare Worker** conectado a una base de datos **Cloudflare D1 (SQLite)** y expuesto mediante el subdominio `*.workers.dev`. Cada petición HTTP `GET` registra la visita y devuelve un conteo persistente.
2. **Fase 2 (Expansión Multi-Cloud: Azure + Podman):** Creación de un **Resource Group** y un **Azure Container Registry (ACR)** en Azure mediante Terraform, construcción y publicación de una imagen de contenedor usando **Podman**, despliegue en **Azure Container Instances (ACI)** e integración híbrida con el Worker de Cloudflare.

---

## 2. Fase 1: Cloudflare Worker + D1

### 2.1 Estructura de Archivos
```text
practica11/
├── .gitignore                 # Exclusión de credenciales y estado de Terraform
├── versions.tf                # Configuración de Terraform y Provider cloudflare ~> 5.0
├── variables.tf               # Declaración de variables (account_id, api_token, etc.)
├── main.tf                    # Recursos: D1, Workers Script, Script Subdomain y Data Source
├── outputs.tf                 # Salida de la URL pública en workers.dev
├── worker.js                  # Script JavaScript ejecutado en el Edge de Cloudflare
├── terraform.tfvars.example   # Plantilla de variables de ejemplo
└── terraform.tfvars           # Credenciales locales protegidas
```

### 2.2 Código de los Recursos

#### `versions.tf`
```hcl
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}
```

#### `worker.js` (Lógica con D1)
```javascript
export default {
  async fetch(request, env) {
    const db = env.DB;

    // Crear tabla si no existe
    await db
      .prepare(
        "CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, user_agent TEXT)"
      )
      .run();

    // Registrar la visita actual en la base de datos D1
    const userAgent = request.headers.get("user-agent") || "unknown";
    await db
      .prepare("INSERT INTO visits (user_agent) VALUES (?)")
      .bind(userAgent)
      .run();

    // Consultar el conteo total acumulado
    const count = await db
      .prepare("SELECT COUNT(*) as total FROM visits")
      .first();

    return Response.json({
      ok: true,
      message: "Worker funcionando con D1 en Cloudflare (Practica 11)",
      visitas: count?.total ?? 0,
      url: request.url,
      timestamp: new Date().toISOString(),
    });
  },
};
```

---

## 3. Evidencias de Ejecución (Fase 1)

### 3.1 Inicialización y Validación
```bash
$ terraform init
Initializing the backend...
Initializing provider plugins...
- Finding cloudflare/cloudflare versions matching "~> 5.0"...
- Installing cloudflare/cloudflare v5.28.1...
Terraform has been successfully initialized!

$ terraform validate
Success! The configuration is valid.
```

### 3.2 Terraform Plan
```text
Plan: 3 to add, 0 to change, 0 to destroy.

Changes to Outputs:
  + worker_url = (known after apply)
```

### 3.3 Terraform Apply
```text
cloudflare_d1_database.app: Creating...
cloudflare_d1_database.app: Creation complete after 6s [id=d6c2d874-6de2-4000-a90d-e80bbd841179]
cloudflare_workers_script.hello: Creating...
cloudflare_workers_script.hello: Creation complete after 1s [id=practica11-worker]
cloudflare_workers_script_subdomain.hello: Creating...
data.cloudflare_worker.hello: Reading...
data.cloudflare_worker.hello: Read complete after 0s [id=practica11-worker]
cloudflare_workers_script_subdomain.hello: Creation complete after 0s [id=practica11-worker]

Apply complete! Resources: 3 added, 0 changed, 0 destroyed.

Outputs:

worker_url = "https://practica11-worker.cyphernexon27-home.workers.dev"
```

### 3.4 Verificación de Endpoint HTTP GET y Persistencia en D1
Se realizaron múltiples peticiones `GET` consecutivas mediante `curl`:

**Petición 1:**
```bash
$ curl -s https://practica11-worker.cyphernexon27-home.workers.dev
{
  "ok": true,
  "message": "Worker funcionando con D1 en Cloudflare (Practica 11)",
  "visitas": 1,
  "url": "https://practica11-worker.cyphernexon27-home.workers.dev/",
  "timestamp": "2026-11-01T18:44:33.824Z"
}
```

**Petición 2:**
```bash
$ curl -s https://practica11-worker.cyphernexon27-home.workers.dev
{
  "ok": true,
  "message": "Worker funcionando con D1 en Cloudflare (Practica 11)",
  "visitas": 2,
  "url": "https://practica11-worker.cyphernexon27-home.workers.dev/",
  "timestamp": "2026-11-01T18:44:43.285Z"
}
```

**Petición 3:**
```bash
$ curl -s https://practica11-worker.cyphernexon27-home.workers.dev
{
  "ok": true,
  "message": "Worker funcionando con D1 en Cloudflare (Practica 11)",
  "visitas": 3,
  "url": "https://practica11-worker.cyphernexon27-home.workers.dev/",
  "timestamp": "2026-11-01T18:44:48.768Z"
}
```
*Resultado:* Se valida la conectividad, la vinculación (*binding*) `DB` hacia Cloudflare D1 y el incremento continuo del contador en cada `GET`.

---

## 4. Fase 2: Expansión Híbrida Multi-Cloud (Podman + Azure ACR & ACI)

Para cumplir con la rúbrica de Docker/Contenedores y Grupos de Recursos en Azure, y conectar ambas infraestructuras, se diseñó una solución híbrida:

### 4.1 Microservicio en Contenedor (`container/`)
Se desarrolló un servidor HTTP ligero en Node.js ([container/server.js](file:///home/cypher/Iteso/7Semestre/Infra_Desarrollo_Continuo/Practicas/11/container/server.js)) empaquetado mediante [container/Dockerfile](file:///home/cypher/Iteso/7Semestre/Infra_Desarrollo_Continuo/Practicas/11/container/Dockerfile).

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server.js .
EXPOSE 80
CMD ["node", "server.js"]
```

### 4.2 Construcción y Publicación con Podman
1. **Compilación de la imagen:**
   ```bash
   podman build -t practica11-backend container/
   ```
2. **Autenticación en Azure Container Registry (ACR):**
   ```bash
   ACR_PASS=$(az acr credential show --name crpractica11bnvhfj --query "passwords[0].value" -o tsv)
   echo "$ACR_PASS" | podman login crpractica11bnvhfj.azurecr.io -u crpractica11bnvhfj --password-stdin
   # Resultado: Login Succeeded!
   ```
3. **Etiquetado y Push al Registro Privado:**
   ```bash
   podman tag localhost/practica11-backend:latest crpractica11bnvhfj.azurecr.io/backend:v1
   podman push crpractica11bnvhfj.azurecr.io/backend:v1
   # Resultado: Writing manifest to image destination
   ```

### 4.3 Infraestructura en Azure declarada en Terraform (`azure.tf`)
Se definieron los siguientes recursos en Azure:
- **`azurerm_resource_group.rg`**: Grupo de recursos (`rg-practica11-iteso`) en `eastus`.
- **`azurerm_container_registry.acr`**: Registro de contenedores privado (`crpractica11bnvhfj`).
- **`azurerm_container_group.aci`**: Contenedor serverless en Azure Container Instances con IP pública y FQDN accesible vía DNS.

### 4.4 Integración Edge <-> Cloud
En [main.tf](file:///home/cypher/Iteso/7Semestre/Infra_Desarrollo_Continuo/Practicas/11/main.tf), se inyectó la URL pública del contenedor de Azure directamente al Worker de Cloudflare mediante un binding de texto plano:
```hcl
bindings = [
  {
    name = "DB"
    type = "d1"
    id   = cloudflare_d1_database.app.id
  },
  {
    name = "AZURE_API_URL"
    type = "plain_text"
    text = "http://${azurerm_container_group.aci.fqdn}"
  }
]
```

### 4.5 Evidencias de Ejecución y Pruebas Multi-Cloud

#### Salida de `terraform apply`:
```text
Apply complete! Resources: 1 added, 4 changed, 0 destroyed.

Outputs:

azure_aci_fqdn = "aci-p11-bnvhfj.eastus.azurecontainer.io"
azure_aci_url = "http://aci-p11-bnvhfj.eastus.azurecontainer.io"
azure_acr_login_server = "crpractica11bnvhfj.azurecr.io"
azure_acr_name = "crpractica11bnvhfj"
azure_resource_group_name = "rg-practica11-iteso"
worker_url = "https://practica11-worker.cyphernexon27-home.workers.dev"
```

#### Prueba Directa al Contenedor en Azure (ACI):
```bash
$ curl -s http://aci-p11-bnvhfj.eastus.azurecontainer.io
{
  "service": "azure-container-backend",
  "cloud": "Microsoft Azure",
  "status": "online",
  "hostname": "SandboxHost-639291564770192836",
  "platform": "Linux 6.1.158.2-microsoft-standard",
  "uptime_seconds": 47,
  "client_ip": "::ffff:10.92.0.9",
  "timestamp": "2026-11-01T19:04:02.676Z",
  "message": "Respuesta exitosa desde Azure Container Instances (ACI) gestionado con Terraform y Podman"
}
```

#### Prueba de Integración Multi-Cloud (Cloudflare Worker -> Cloudflare D1 + Azure ACI):
```bash
$ curl -s https://practica11-worker.cyphernexon27-home.workers.dev
{
  "ok": true,
  "arquitectura": "Hibrida Multi-Cloud (Cloudflare Edge + Azure ACI)",
  "cloudflare_d1": {
    "mensaje": "Base de datos D1 funcionando",
    "visitas_totales": 5
  },
  "azure_container": {
    "service": "azure-container-backend",
    "cloud": "Microsoft Azure",
    "status": "online",
    "hostname": "SandboxHost-639291564770192836",
    "platform": "Linux 6.1.158.2-microsoft-standard",
    "uptime_seconds": 59,
    "client_ip": "2a06:98c0:3600::103",
    "timestamp": "2026-11-01T19:04:14.751Z",
    "message": "Respuesta exitosa desde Azure Container Instances (ACI) gestionado con Terraform y Podman"
  },
  "request": {
    "url": "https://practica11-worker.cyphernexon27-home.workers.dev/",
    "timestamp": "2026-11-01T19:04:14.768Z"
  }
}
```

---

## 5. Limpieza de Infraestructura (`terraform destroy`)
Para cumplir con el requerimiento de la práctica (*"Después destruye lo creado con Terraform"*), se ejecuta:

```bash
$ terraform destroy -auto-approve
```
*Efecto:* Destruye de forma segura y automatizada:
1. El script del Worker en Cloudflare (`practica11-worker`) y su subdominio.
2. La base de datos Cloudflare D1 (`practica11-db`).
3. La instancia de Azure Container Instances (`aci-practica11`).
4. El registro Azure Container Registry (`crpractica11bnvhfj`).
5. El grupo de recursos en Azure (`rg-practica11-iteso`).

---

## 6. Matriz de Cumplimiento de Rúbrica

| Criterio | Requerimiento | Estado | Evidencia |
| :--- | :--- | :---: | :--- |
| **Provider Cloudflare** | Archivo `versions.tf` con versión `~> 5.0` | **Cumplido** | [versions.tf](versions.tf) |
| **Recurso D1** | `cloudflare_d1_database` aprovisionado | **Cumplido** | Base de datos `practica11-db` creada |
| **Recurso Worker** | `cloudflare_workers_script` con binding a D1 | **Cumplido** | [worker.js](worker.js) y [main.tf](main.tf) |
| **Recurso Subdomain** | `cloudflare_workers_script_subdomain` habilitado | **Cumplido** | Subdominio `.workers.dev` expuesto |
| **Petición GET** | Script responde con JSON vía HTTP GET | **Cumplido** | Pruebas con `curl` verificadas |
| **Crear Imagen y Container** | Evidencia Docker / Podman Apply (5 pts) | **Cumplido** | [Dockerfile](container/Dockerfile), `podman build`, `podman push` y ACI |
| **Grupo de Recursos en Azure** | Evidencia de Resource Group con Terraform (5 pts) | **Cumplido** | `azurerm_resource_group.rg` (`rg-practica11-iteso`) |
| **Destrucción con Terraform** | `terraform destroy` listo para ejecutar | **Cumplido** | Estado gestionado unificadamente |


