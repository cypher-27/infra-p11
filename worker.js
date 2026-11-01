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
