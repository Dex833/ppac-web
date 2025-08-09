import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import serveStatic from "serve-static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

// serve the /dist folder (Vite build output)
const distPath = path.join(__dirname, "dist");
app.use(serveStatic(distPath, { index: false }));

// SPA fallback to index.html
app.get("*", (_, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
