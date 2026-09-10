import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

await rm("dist", { recursive: true, force: true });
await mkdir("frontend/assets/vendor", { recursive: true });
const vendors = [
  ["node_modules/chart.js/dist/chart.umd.js", "frontend/assets/vendor/chart.umd.js"],
  ["node_modules/jspdf/dist/jspdf.umd.min.js", "frontend/assets/vendor/jspdf.umd.min.js"]
];
for (const [source, target] of vendors) {
  if (!existsSync(source)) throw new Error(`Missing ${source}. Run npm install first.`);
  await cp(source, target);
}
await cp("frontend", "dist", { recursive: true });
console.log("SmritiAI static build written to dist/");
