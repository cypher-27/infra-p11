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
