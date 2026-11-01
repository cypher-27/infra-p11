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

output "azure_resource_group_name" {
  value = azurerm_resource_group.rg.name
}

output "azure_acr_login_server" {
  value = azurerm_container_registry.acr.login_server
}

output "azure_acr_name" {
  value = azurerm_container_registry.acr.name
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

output "azure_aci_fqdn" {
  value = azurerm_container_group.aci.fqdn
}

output "azure_aci_url" {
  value = "http://${azurerm_container_group.aci.fqdn}"
}

