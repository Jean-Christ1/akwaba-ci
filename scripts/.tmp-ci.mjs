import { execFileSync } from "node:child_process";
const url = execFileSync("git", ["ls-remote", "--get-url", "origin"], { encoding: "utf8" }).trim();
const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
const sortie = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
const cle = sortie.split(/\r?\n/).find((l) => l.startsWith("password=")).slice(9);
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const r = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/actions/runs?head_sha=${sha}`, {
  headers: { Authorization: `Bearer ${cle}`, Accept: "application/vnd.github+json" },
});
const d = await r.json();
if (!d.workflow_runs?.length) { console.log("aucune execution pour", sha.slice(0,8)); process.exit(0); }
for (const w of d.workflow_runs) console.log(`${w.name.padEnd(28)} ${w.status.padEnd(12)} ${w.conclusion ?? "-"}  ${w.html_url}`);
