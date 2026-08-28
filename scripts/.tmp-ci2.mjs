import { execFileSync } from "node:child_process";
const url = execFileSync("git", ["ls-remote", "--get-url", "origin"], { encoding: "utf8" }).trim();
const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
const sortie = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
const cle = sortie.split(/\r?\n/).find((l) => l.startsWith("password=")).slice(9);
const h = { Authorization: `Bearer ${cle}`, Accept: "application/vnd.github+json" };
const run = process.argv[2];
const jobs = await (await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/actions/runs/${run}/jobs`, { headers: h })).json();
for (const j of jobs.jobs ?? []) {
  console.log(`\n=== ${j.name} : ${j.conclusion} ===`);
  for (const s of j.steps ?? []) if (s.conclusion === "failure") console.log("  etape en echec :", s.name);
}
