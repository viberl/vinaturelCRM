import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger, type ViteDevServer } from "vite";
import http from "http";
import type { Server as HttpServer } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, httpServer: HttpServer): Promise<ViteDevServer> {
  // Create Vite server in middleware mode
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...createLogger(),
      error: (msg, options) => {
        createLogger().error(msg, options);
        process.exit(1);
      },
    },
    server: {
      middlewareMode: true,
      hmr: {
        server: httpServer,
      },
      // @ts-ignore - The types are compatible
      allowedHosts: 'all',
    },
    appType: 'custom',
  });

  // Use Vite's middleware
  app.use(vite.middlewares);
  
  // Handle SPA fallback
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = fs.readFileSync(clientTemplate, "utf-8");
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
  
  // Return the Vite server instance
  return vite;
}

export function serveStatic(app: Express): void {
  // Serve static files from the dist/public directory
  const staticPath = path.resolve(import.meta.dirname, "..", "dist", "public");
  app.use(express.static(staticPath));
  
  // Handle SPA fallback
  app.use("*", (req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });
}
