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

variable "azure_subscription_id" {
  description = "Azure Subscription ID"
  type        = string
  default     = "1da3cf62-9090-42cb-b1e5-926eb08cd88c"
}

variable "azure_location" {
  description = "Región de Azure para los recursos"
  type        = string
  default     = "eastus"
}

variable "azure_resource_group_name" {
  description = "Nombre del Resource Group en Azure"
  type        = string
  default     = "rg-practica11-iteso"
}

