variable "account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "api_token" {
  description = "Cloudflare API token with Workers and D1 permissions"
  type        = string
  sensitive   = true
}

variable "worker_name" {
  description = "Nombre del worker"
  type        = string
  default     = "practica11-worker"
}

variable "d1_database_name" {
  description = "Nombre de la base de datos D1"
  type        = string
  default     = "practica11-db"
}
