export default {
  async fetch(request, env) {
    const db = env.DB;

    // 1. Registrar la visita actual en Cloudflare D1
    await db
      .prepare(
        "CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, user_agent TEXT)"
      )
      .run();

    const userAgent = request.headers.get("user-agent") || "unknown";
    await db
      .prepare("INSERT INTO visits (user_agent) VALUES (?)")
      .bind(userAgent)
      .run();

    // 2. Consultar el total de visitas acumuladas en D1
    const count = await db
      .prepare("SELECT COUNT(*) as total FROM visits")
      .first();

    // 3. Consultar el microservicio en Azure Container Instances (ACI)
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

    // 4. Respuesta combinada Multi-Cloud (Cloudflare + Azure)
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
