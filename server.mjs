import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import {
  cleanFailedUpload,
  createProjectRouter
} from "./backend/projectRoutes.mjs";

const app = express();
const port = Number(process.env.PORT) || 4100;

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(currentFile);
const frontendPath = path.join(projectRoot, "Frontend");
const environmentPath = path.join(projectRoot, ".env");

if (fs.existsSync(environmentPath)) {
  loadEnvFile(environmentPath);
}

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(frontendPath));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    product: "QuickAd AI",
    version: "0.8.0"
  });
});

const projectRouter = await createProjectRouter({
  projectRoot
});

app.use("/api/projects", projectRouter);

app.get("/", (_request, response) => {
  response.sendFile(
    path.join(frontendPath, "index.html")
  );
});

app.use("/api", (_request, response) => {
  response.status(404).json({
    ok: false,
    error: "API endpoint not found."
  });
});

app.use(async (error, request, response, next) => {
  await cleanFailedUpload(request);

  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE:
        "Each image must be 10 MB or smaller.",
      LIMIT_FILE_COUNT:
        "Too many files were uploaded.",
      LIMIT_UNEXPECTED_FILE:
        "Use no more than 10 JPG, PNG, or WebP product images and one logo."
    };

    response.status(400).json({
      ok: false,
      error:
        messages[error.code] ||
        "The uploaded files could not be accepted."
    });
    return;
  }

  console.error("QuickAd AI server error:", error);

  response.status(500).json({
    ok: false,
    error:
      "QuickAd AI could not create the project. Please try again."
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(
    `QuickAd AI is running at http://localhost:${port}`
  );
});
