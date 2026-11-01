output "worker_url" {
  description = "URL predeterminada del Worker en workers.dev"
  value       = data.cloudflare_worker.hello.subdomain.url
}
