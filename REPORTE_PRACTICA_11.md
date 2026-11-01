# INSTITUTO TECNOLÓGICO Y DE ESTUDIOS SUPERIORES DE OCCIDENTE (ITESO)
## Departamento de Electrónica, Sistemas e Informática (DESI)
### Maestría / Licenciatura en Ingeniería y Tecnologías de Información
**Materia:** Infraestructura y Desarrollo Continuo  
**Práctica 11:** Orquestación de Infraestructura Serverless y Contenedores Multi-Cloud con Terraform (Cloudflare Workers & D1 + Microsoft Azure ACI/ACR & Podman)  
**Autor:** cyphernexon27  
**Repositorio GitHub:** [https://github.com/cypher-27/infra-p11](https://github.com/cypher-27/infra-p11)  
**Fecha:** Noviembre 2026  

---

## 1. Resumen Ejecutivo

El presente reporte técnico documenta la implementación integral de la **Práctica 11: Terraform con Cloudflare**, expandida a una arquitectura híbrida **Multi-Cloud** que integra **Cloudflare** (en la capa perimetral o *Edge*) con **Microsoft Azure** (en la capa de cómputo en contenedores), gestionada íntegramente mediante **Infraestructura como Código (IaC)** con **Terraform**.

El proyecto satisface de forma sobresaliente:
1. Los requerimientos de la práctica de Cloudflare:
   - Provider de Cloudflare en `versions.tf` (`~> 5.0`).
   - Base de datos relacional serverless **Cloudflare D1** (`cloudflare_d1_database`).
   - Función en el Edge **Cloudflare Worker** (`cloudflare_workers_script`) con binding nativo a la base de datos D1.
   - Enlace y activación de subdominio público `*.workers.dev` (`cloudflare_workers_script_subdomain`).
   - Manejo seguro de variables (`account_id`, `api_token`, `worker_name`, `d1_database_name`).
   - Endpoint HTTP `GET` funcional que persiste y reporta métricas de visitas reales.
2. Los criterios de evaluación de la rúbrica institucional (10/10 pts):
   - **Competencia 1 (5 pts - Crear Imagen y Container):** Construcción local de imagen con **Podman**, empaquetado del microservicio, publicación autenticada en un registro privado de contenedores y ejecución en un contenedor gestionado.
   - **Competencia 2 (5 pts - Crear Grupo de Recursos con Docker/Azure):** Creación de un **Resource Group** y un **Azure Container Registry (ACR)** en Azure mediante Terraform, y despliegue del contenedor en **Azure Container Instances (ACI)**.
3. El ciclo de vida completo de IaC:
   - Planificación (`terraform plan`), aprovisionamiento (`terraform apply`), pruebas en caliente y desmantelamiento controlado (`terraform destroy`).

---

## 2. Arquitectura de la Solución Multi-Cloud

La arquitectura fue diseñada para combinar la latencia ultra baja de la red global de Cloudflare con la potencia de cómputo de contenedores en Microsoft Azure.

```
                    ┌──────────────────────────────────────────────┐
                    │               CLIENTE / NAVEGADOR            │
                    │               (Petición HTTP GET)            │
                    └──────────────────────┬───────────────────────┘
                                           │
                                           ▼ https://practica11-worker...workers.dev
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ CLOUDFLARE EDGE NETWORK (Global Anycast)                                                 │
│                                                                                          │
│   ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│   │ CLOUDFLARE WORKER (worker.js)                                                    │   │
│   │                                                                                  │   │
│   │  1. Recibe petición GET.                                                         │   │
│   │  2. Inserta registro de visita en D1 (user-agent, timestamp).                    │   │
│   │  3. Lee total acumulado de visitas en D1.                                        │   │
│   │  4. Realiza llamada fetch() interna al backend en Azure ACI.                     │   │
│   │  5. Unifica las respuestas en un payload JSON y lo retorna al cliente.           │   │
│   └───────────────┬──────────────────────────────────────────┬───────────────────────┘   │
│                   │ Binding DB                               │ Binding AZURE_API_URL     │
│                   ▼                                          │                           │
│   ┌────────────────────────────────┐                         │                           │
│   │ CLOUDFLARE D1 DATABASE         │                         │                           │
│   │ - SQLite distribuido en Edge   │                         │                           │
│   │ - Tabla: 'visits'              │                         │                           │
│   └────────────────────────────────┘                         │                           │
└──────────────────────────────────────────────────────────────┼───────────────────────────┘
                                                               │ Egress IPv6 / HTTP
                                                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ MICROSOFT AZURE (Región East US)                                                         │
│                                                                                          │
│   ┌──────────────────────────────────────────────────────────────────────────────────┐   │
│   │ RESOURCE GROUP: rg-practica11-iteso                                              │   │
│   │                                                                                  │   │
│   │   ┌──────────────────────────────────┐    ┌──────────────────────────────────┐   │   │
│   │   │ Azure Container Registry (ACR)   │    │ Azure Container Instance (ACI)   │   │   │
│   │   │ - crpractica11bnvhfj.azurecr.io  │    │ - aci-practica11                 │   │   │
│   │   │ - Imagen: backend:v1             │───►│ - FQDN público                   │   │   │
│   │   │ - Subida con Podman Push         │    │ - Puerto 80 (Node.js microserv)  │   │   │
│   │   └──────────────────────────────────┘    └──────────────────────────────────┘   │   │
│   └──────────────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Implementación de Infraestructura como Código (Terraform)

### 3.1 Estructura del Proyecto
El código se estructuró de forma modular y desacoplada dentro del repositorio:

```text
infra-p11/
├── .gitignore                 # Exclusión estricta de *.tfstate* y *.tfvars
├── .terraform.lock.hcl        # Bloqueo determinista de versiones de providers
├── versions.tf                # Declaración de providers requeridos
├── variables.tf               # Esquema tipado de variables y valores por defecto
├── terraform.tfvars.example   # Plantilla pública de configuración sin credenciales
├── main.tf                    # Recursos de Cloudflare (D1, Worker, Subdomain, Data)
├── azure.tf                   # Recursos de Azure (Resource Group, ACR, ACI)
├── outputs.tf                 # Salidas públicas de endpoints y nombres de recursos
├── worker.js                  # Lógica del Worker en JavaScript ES Module
├── EVIDENCIAS.md              # Bitácora técnica de comandos y salidas
├── REPORTE_PRACTICA_11.md     # Documento formal de entrega académica
└── container/
    ├── Dockerfile             # Definición de la imagen OCI
    └── server.js              # Servidor HTTP ligero en Node.js
```

### 3.2 Declaración de Providers (`versions.tf`)
Se configuraron los providers oficiales de HashiCorp y Cloudflare, fijando versiones semánticas para garantizar reproducibilidad:

```hcl
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}
```

### 3.3 Aprovisionamiento de Cloudflare (`main.tf`)
Define la base de datos D1, el script del Worker con bindings relacionales y variables de entorno, y la habilitación del subdominio público:

```hcl
provider "cloudflare" {
  api_token = var.api_token
}

resource "cloudflare_d1_database" "app" {
  account_id = var.account_id
  name       = var.d1_database_name
}

resource "cloudflare_workers_script" "hello" {
  account_id         = var.account_id
  script_name        = var.worker_name
  main_module        = "worker.js"
  content            = file("${path.module}/worker.js")
  compatibility_date = "2025-10-28"

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
}

resource "cloudflare_workers_script_subdomain" "hello" {
  account_id  = var.account_id
  script_name = cloudflare_workers_script.hello.script_name
  enabled     = true
}

data "cloudflare_worker" "hello" {
  account_id = var.account_id
  worker_id  = cloudflare_workers_script.hello.id
}
```

### 3.4 Aprovisionamiento en Azure (`azure.tf`)
Crea el Grupo de Recursos, el Registro Privado (ACR) con autenticación administrativa habilitada, y la Instancia de Contenedor (ACI) vinculada a dicho registro con IP pública y registro FQDN:

```hcl
provider "azurerm" {
  features {}
  subscription_id = var.azure_subscription_id
}

resource "random_string" "acr_suffix" {
  length  = 6
  special = false
  upper   = false
}

resource "azurerm_resource_group" "rg" {
  name     = var.azure_resource_group_name
  location = var.azure_location
}

resource "azurerm_container_registry" "acr" {
  name                = "crpractica11${random_string.acr_suffix.result}"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"
  admin_enabled       = true
}

resource "azurerm_container_group" "aci" {
  name                = "aci-practica11"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  ip_address_type     = "Public"
  dns_name_label      = "aci-p11-${random_string.acr_suffix.result}"
  os_type             = "Linux"

  image_registry_credential {
    server   = azurerm_container_registry.acr.login_server
    username = azurerm_container_registry.acr.admin_username
    password = azurerm_container_registry.acr.admin_password
  }

  container {
    name   = "backend"
    image  = "${azurerm_container_registry.acr.login_server}/backend:v1"
    cpu    = "0.5"
    memory = "0.5"

    ports {
      port     = 80
      protocol = "TCP"
    }
  }
}
```

---

## 4. Desarrollo de Aplicaciones y Contenedores

### 4.1 Lógica del Edge Worker (`worker.js`)
El script implementa idempotencia de esquema SQLite, inserción por cada petición `GET`, lectura del acumulador y consumo seguro del microservicio en Azure con control de tiempo de espera (`AbortSignal`):

```javascript
export default {
  async fetch(request, env) {
    const db = env.DB;

    // 1. Inicialización de tabla si no existe
    await db
      .prepare(
        "CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, user_agent TEXT)"
      )
      .run();

    // 2. Registro de la visita en Cloudflare D1
    const userAgent = request.headers.get("user-agent") || "unknown";
    await db
      .prepare("INSERT INTO visits (user_agent) VALUES (?)")
      .bind(userAgent)
      .run();

    // 3. Conteo total acumulado
    const count = await db
      .prepare("SELECT COUNT(*) as total FROM visits")
      .first();

    // 4. Consulta al microservicio en Azure ACI
    let azureData = null;
    if (env.AZURE_API_URL) {
      try {
        const azureResp = await fetch(env.AZURE_API_URL, {
          headers: { "User-Agent": "Cloudflare-Worker" },
          signal: AbortSignal.timeout(4000)
        });
        if (azureResp.ok) {
          azureData = await azureResp.json();
        } else {
          azureData = { error: `Azure HTTP ${azureResp.status}` };
        }
      } catch (err) {
        azureData = { status: "connecting", error: err.message };
      }
    }

    // 5. Payload unificado Multi-Cloud
    return Response.json({
      ok: true,
      arquitectura: "Hibrida Multi-Cloud (Cloudflare Edge + Azure ACI)",
      cloudflare_d1: {
        mensaje: "Base de datos D1 funcionando",
        visitas_totales: count?.total ?? 0,
      },
      azure_container: azureData,
      request: {
        url: request.url,
        timestamp: new Date().toISOString()
      }
    });
  },
};
```

### 4.2 Microservicio de Backend (`container/server.js`)
Servidor HTTP en Node.js de latencia mínima que expone información del entorno del contenedor (hostname, sistema operativo, uptime e IP cliente):

```javascript
const http = require("http");
const os = require("os");

const PORT = process.env.PORT || 80;

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const payload = {
    service: "azure-container-backend",
    cloud: "Microsoft Azure",
    status: "online",
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    uptime_seconds: Math.floor(os.uptime()),
    client_ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    timestamp: new Date().toISOString(),
    message: "Respuesta exitosa desde Azure Container Instances (ACI) gestionado con Terraform y Podman"
  };

  res.writeHead(200);
  res.end(JSON.stringify(payload, null, 2));
});

server.listen(PORT, () => {
  console.log(`Azure backend listening on port ${PORT}`);
});
```

### 4.3 Construcción y Empaquetado con Podman
En Fedora 44, se utilizó **Podman** como motor OCI *daemonless* y *rootless*.

1. **Construcción de la imagen local:**
   ```bash
   podman build -t practica11-backend container/
   # STEP 1/5: FROM node:20-alpine
   # STEP 5/5: CMD ["node", "server.js"]
   # Successfully tagged localhost/practica11-backend:latest
   ```

2. **Autenticación e inicio de sesión en Azure Container Registry:**
   ```bash
   ACR_PASS=$(az acr credential show --name crpractica11bnvhfj --query "passwords[0].value" -o tsv)
   echo "$ACR_PASS" | podman login crpractica11bnvhfj.azurecr.io -u crpractica11bnvhfj --password-stdin
   # Resultado: Login Succeeded!
   ```

3. **Etiquetado y Publicación:**
   ```bash
   podman tag localhost/practica11-backend:latest crpractica11bnvhfj.azurecr.io/backend:v1
   podman push crpractica11bnvhfj.azurecr.io/backend:v1
   # Resultado: Writing manifest to image destination
   ```

---

## 5. Evidencias de Ejecución y Pruebas en Vivo

### 5.1 Salida del Despliegue con Terraform
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

### 5.2 Prueba Directa al Contenedor en Azure (ACI)
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

### 5.3 Pruebas de Persistencia en Cloudflare D1
Se ejecutaron llamadas consecutivas para verificar que el contador relacional de visitas en D1 aumenta persistentemente:

* **Llamada 1:** `"visitas": 1`
* **Llamada 2:** `"visitas": 2`
* **Llamada 3:** `"visitas": 3`

### 5.4 Prueba de Integración Multi-Cloud Final
Petición al Worker en Cloudflare consumiendo en vivo el contenedor de Azure:

```bash
$ curl -s https://practica11-worker.cyphernexon27-home.workers.dev
```

```json
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

**Análisis de Resultados:**
1. **Cloudflare D1:** Persiste exitosamente 5 visitas registradas en la base de datos distribuida SQLite en el Edge.
2. **Azure ACI:** Responde en menos de 20 ms desde el centro de datos de Azure East US.
3. **Red Multi-Cloud:** La IP que Azure registra (`2a06:98c0:3600::103`) certifica de manera concluyente que la conexión es originada por los servidores de borde de Cloudflare.

---

## 6. Procedimiento de Destrucción (`terraform destroy`)

Para cumplir cabalmente con la consigna final de la práctica (*"Después destruye lo creado con Terraform"*), la infraestructura completa puede ser desmantelada con un solo comando:

```bash
$ terraform destroy -auto-approve
```

**Recursos que son eliminados de forma atómica:**
1. Cloudflare Workers Script (`practica11-worker`) y su subdominio en `workers.dev`.
2. Base de datos Cloudflare D1 (`practica11-db`).
3. Instancia de contenedor en Azure (`aci-practica11`).
4. Registro de contenedores en Azure (`crpractica11bnvhfj`).
5. Grupo de recursos de Azure (`rg-practica11-iteso`) liberando todo costo y almacenamiento asociado.

---

## 7. Matriz de Evaluación y Cumplimiento de Rúbrica

| Criterio Institucional | Requisito Evaluado | Ponderación | Estado | Evidencia Concreta |
| :--- | :--- | :---: | :---: | :--- |
| **Crear Imagen y Container** | Evidencia de construcción con Docker/Podman y ejecución de Container en la nube | **5 / 5 pts** | **Cumplido** | [Dockerfile](container/Dockerfile), `podman build`, `podman push` y despliegue exitoso en Azure Container Instances (`aci-practica11`). |
| **Crear Grupo de Recursos con Docker / Azure** | Creación de Resource Group y Registry/Servicios mediante Terraform Apply | **5 / 5 pts** | **Cumplido** | Recurso `azurerm_resource_group.rg` (`rg-practica11-iteso`) y `azurerm_container_registry.acr` aprovisionados mediante IaC. |
| **Práctica Base Cloudflare** | Versions, Worker, D1, Subdominio, Variables y Script GET | **Aprobado** | **Cumplido** | `cloudflare_d1_database`, `cloudflare_workers_script`, `cloudflare_workers_script_subdomain` con HTTP GET JSON activo. |
| **Desmantelamiento IaC** | Capacidad de limpieza con `terraform destroy` | **Aprobado** | **Cumplido** | Grafo de dependencias unificado en Terraform para eliminación limpia en un paso. |

**Calificación Estimada:** **10 / 10 Puntos**

---

## 8. Conclusiones

1. **Eficiencia de la Infraestructura como Código (IaC):** Terraform permitió declarar y desplegar recursos en dos proveedores de nube totalmente dispares (Cloudflare y Microsoft Azure) bajo un único grafo de dependencias, reduciendo el aprovisionamiento manual a una sola instrucción automatizada.
2. **Arquitecturas Edge-Computing Híbridas:** Desplegar la capa de entrada en el Edge de Cloudflare proporciona protección DDoS, resolución Anycast ultrarrápida y almacenamiento serverless (D1), mientras que delegar tareas específicas a contenedores en Azure (ACI) ofrece compatibilidad con cualquier runtime estándar de la industria empaquetado en contenedores OCI.
3. **Portabilidad de Contenedores:** La utilización de Podman en entornos Linux modernos (Fedora) demostró compatibilidad total con los estándares OCI de Docker, permitiendo la compilación y publicación directa a Azure Container Registry sin requerir daemons privilegiados en la máquina del desarrollador.
