// Guest list changes made by the bride on the guest links page.
//   GET  /api/guests?g=<code>   -> { name, entry } for one invitation (public; used by the invitation page)
//   GET  /api/guests            -> { code: {name, entry, added?, removed?} } all changes   (passcode)
//   POST /api/guests  {action: "save", code?, name, entry}  add (no code) or correct a guest (passcode)
//   POST /api/guests  {action: "remove", code}                remove an invitation           (passcode)
const crypto = require("crypto");
const { BASE, ready, redis, hashAll, getGuest, body, cors, isAdmin } = require("./_db.js");

const ENTRIES = ["", "VIP Entry"];
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // same as the generator: no look-alike characters

async function newCode() {
  for (let i = 0; i < 20; i++) {
    const code = Array.from(crypto.randomBytes(6), b => ALPHABET[b % ALPHABET.length]).join("");
    if (!BASE[code] && !(await redis(["HEXISTS", "guests", code]))) return code;
  }
  throw new Error("Could not make a new code");
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!ready) return res.status(503).json({ ok: false, error: "Storage is not connected yet" });

  try {
    const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
    if (req.method === "GET" && q.g) {
      const g = await getGuest(String(q.g).trim().toLowerCase());
      if (!g) return res.status(404).json({ ok: false });
      if (g.removed) return res.status(404).json({ ok: false, removed: true });
      return res.status(200).json({ name: g.name, entry: g.entry || "" });
    }

    if (!process.env.ADMIN_PASSCODE) return res.status(503).json({ ok: false, error: "ADMIN_PASSCODE is not set in Vercel yet" });
    if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "Wrong passcode" });

    if (req.method === "GET") return res.status(200).json(await hashAll("guests"));

    if (req.method === "POST") {
      const p = body(req);
      const at = new Date().toISOString();
      if (p.action === "remove") {
        const code = String(p.code || "").trim().toLowerCase();
        const g = await getGuest(code);
        if (!g || g.removed) return res.status(404).json({ ok: false, error: "Guest not found" });
        await redis(["HSET", "guests", code, JSON.stringify({ removed: true, name: g.name, at })]);
        await redis(["HDEL", "rsvp", code]);
        return res.status(200).json({ ok: true });
      }
      if (p.action === "save") {
        const name = String(p.name || "").replace(/\s+/g, " ").trim();
        const entry = ENTRIES.includes(p.entry) ? p.entry : "";
        if (!name || name.length > 120) return res.status(400).json({ ok: false, error: "Please enter a name (up to 120 characters)" });
        let code = String(p.code || "").trim().toLowerCase(), added = false;
        if (code) {
          const g = await getGuest(code);
          if (!g || g.removed) return res.status(404).json({ ok: false, error: "Guest not found" });
          added = !!g.added;
        } else {
          code = await newCode(); added = true;
        }
        const rec = { name, entry, at, ...(added ? { added: true } : {}) };
        await redis(["HSET", "guests", code, JSON.stringify(rec)]);
        return res.status(200).json({ ok: true, code, guest: rec });
      }
      return res.status(400).json({ ok: false, error: "Unknown action" });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Something went wrong, please try again" });
  }
};
