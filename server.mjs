import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const port = Number(process.env.PORT) || 4100;

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(currentFile);
const frontendPath = path.join(projectRoot, "Frontend");

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(frontendPath));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    product: "QuickAd AI",
    version: "0.1.0"
  });
});

app.get("/", (_request, response) => {
  response.sendFile(path.join(frontendPath, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`QuickAd AI is running at http://localhost:${port}`);
});
