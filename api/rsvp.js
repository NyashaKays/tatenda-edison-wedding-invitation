// RSVP replies for the invitation, stored in the Redis database connected to this Vercel project
// (Vercel dashboard > Storage > Upstash for Redis > Connect Project).
//   POST /api/rsvp  code=<invitation code>&response=Attending|Not attending   (from a guest's invitation)
//   GET  /api/rsvp  -> { code: { response, at } }                             (for the guest list page)
const { ready, redis, hashAll, getGuest, body, cors } = require("./_db.js");

const ANSWERS = ["Attending", "Not attending"];

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!ready) return res.status(503).json({ ok: false, error: "RSVP storage is not connected yet" });

  try {
    if (req.method === "GET") return res.status(200).json(await hashAll("rsvp"));
    if (req.method === "POST") {
      const p = body(req);
      const code = String(p.code || "").trim().toLowerCase();
      const response = ANSWERS.includes(p.response) ? p.response : "";
      const g = code && await getGuest(code);
      if (!g || g.removed) return res.status(404).json({ ok: false, error: "Unknown invitation" });
      if (!response) return res.status(400).json({ ok: false, error: "Invalid reply" });
      await redis(["HSET", "rsvp", code, JSON.stringify({ response, at: new Date().toISOString() })]);
      return res.status(200).json({ ok: true, response });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Could not save the reply" });
  }
};
