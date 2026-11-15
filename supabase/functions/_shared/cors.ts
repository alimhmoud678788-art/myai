// Auth uses a Bearer token (not cookies), so CORS is not the security boundary here.
// Tauri's origin on Windows is http://tauri.localhost; dev server is http://localhost:1420.
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

export function preflight(req: Request) {
  return req.method === "OPTIONS" ? new Response("ok", { headers: cors }) : null;
}

/** Converts thrown Responses (auth/quota) and unknown errors into JSON responses. */
export function handleError(e: unknown) {
  if (e instanceof Response) return e;
  console.error(e);
  return json({ error: "Server error" }, 500);
}
