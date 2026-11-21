// Loads premises licence applications from London councils' public registers into
// licence_applications and links each to a place we hold, when there is one.
//
//   node scripts/db/load-licensing.mjs work/licensing    # every <council>.json in that folder
//
// A <council>.json file is an array of { council, reference, premises_name, address, postcode,
// applicant, application_type, activities, received_on (YYYY-MM-DD), status, url } read from that
// council's own licensing register. Re-runnable: keyed on (council, reference).
// An application for premises we don't hold shows up in the upcoming_openings view.
import fs from "node:fs";
import path from "node:path";
import { connect } from "./lib.mjs";

const today = new Date().toISOString().slice(0, 10);
const DIR = process.argv[2] ?? "work/licensing";
if (!fs.existsSync(DIR)) throw new Error(`no folder ${DIR}`);
const s = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).replace(/\s+/g, " ").trim());
const date = (v) => (/^\d{4}-\d{2}-\d{2}/.test(v ?? "") ? v.slice(0, 10) : null);

const rows = [];
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort()) {
  const r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")).filter((x) => x.council && x.reference);
  rows.push(...r);
  console.log(`${f}: ${r.length} applications`);
}
const client = await connect();
await client.query("begin");
for (const r of rows) {
  await client.query(
    `insert into licence_applications (council, reference, premises_name, address, postcode, applicant, application_type,
       activities, received_on, status, url, last_checked)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     on conflict (council, reference) do update set premises_name = coalesce(excluded.premises_name, licence_applications.premises_name),
       address = coalesce(excluded.address, licence_applications.address), postcode = coalesce(excluded.postcode, licence_applications.postcode),
       applicant = coalesce(excluded.applicant, licence_applications.applicant),
       application_type = coalesce(excluded.application_type, licence_applications.application_type),
       activities = coalesce(excluded.activities, licence_applications.activities),
       received_on = coalesce(excluded.received_on, licence_applications.received_on),
       status = coalesce(excluded.status, licence_applications.status), url = coalesce(excluded.url, licence_applications.url),
       last_checked = excluded.last_checked`,
    [s(r.council), s(r.reference), s(r.premises_name), s(r.address), s(r.postcode)?.toUpperCase() ?? null, s(r.applicant),
     s(r.application_type), s(r.activities), date(r.received_on), s(r.status), s(r.url), today]);
}
// a place at the same postcode with the same core name, or one name a prefix of the other
const linked = await client.query(`
  with c as (
    select a.id, (select p.id from places p
      where p.duplicate_of is null and upper(replace(p.postcode, ' ', '')) = upper(replace(a.postcode, ' ', ''))
        and length(name_core(a.premises_name)) >= 3
        and (name_core(p.name) = name_core(a.premises_name)
             or (least(length(name_core(p.name)), length(name_core(a.premises_name))) >= 5
                 and (name_core(p.name) like name_core(a.premises_name) || '%' or name_core(a.premises_name) like name_core(p.name) || '%')))
      order by p.recommended desc, p.id limit 1) pid
    from licence_applications a where a.place_id is null and a.postcode is not null)
  update licence_applications a set place_id = c.pid from c where a.id = c.id and c.pid is not null returning a.id`);
await client.query("commit");
const sum = await client.query(`select council, count(*)::int applications, count(place_id)::int matched,
  max(received_on) latest from licence_applications group by 1 order by 1`);
console.log(`${rows.length} applications read, ${linked.rowCount} newly matched to places`);
console.table(sum.rows);
const up = await client.query("select count(*)::int n from upcoming_openings where place_id is null");
console.log(`upcoming openings (premises we don't hold yet): ${up.rows[0].n}`);
await client.end();
