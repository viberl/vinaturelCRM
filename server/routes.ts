import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCustomerSchema, insertInteractionSchema } from "@shared/schema";
import { z } from "zod";
import { loginShopware, getCurrentUser, getCustomersForUser } from "./shopware";

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication routes
  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };

    if (!username || !password) {
      return res.status(400).json({ message: "Missing credentials" });
    }

    try {
      const token = await loginShopware(username, password);
      const user = await getCurrentUser(token.access_token);
      (req.session as any).token = token.access_token;
      (req.session as any).user = user;
      res.json(user);
    } catch (err) {
      res.status(401).json({ message: "Invalid username or password" });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/me", (req, res) => {
    if ((req.session as any).user) {
      res.json((req.session as any).user);
    } else {
      res.status(401).json({ message: "Unauthorized" });
    }
  });

  // Customer routes
  app.get("/api/customers", async (req, res) => {
    if (!(req.session as any).user || !(req.session as any).token) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const customers = await getCustomersForUser(
        (req.session as any).token,
        (req.session as any).user.id,
      );
      res.json(customers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.get("/api/customers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }

      const customer = await storage.getCustomer(id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const validatedData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(validatedData);
      res.status(201).json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid customer data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create customer" });
    }
  });

  // Interaction routes
  app.get("/api/interactions", async (req, res) => {
    try {
      const customerId = req.query.customerId ? parseInt(req.query.customerId as string) : undefined;
      if (req.query.customerId && isNaN(customerId!)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }

      const interactions = await storage.getInteractions(customerId);
      res.json(interactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch interactions" });
    }
  });

  app.post("/api/interactions", async (req, res) => {
    try {
      const validatedData = insertInteractionSchema.parse(req.body);
      const interaction = await storage.createInteraction(validatedData);
      res.status(201).json(interaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid interaction data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create interaction" });
    }
  });

  // OAuth2 preparation route (dummy implementation for future Shopware integration)
  app.post("/api/auth/oauth", async (req, res) => {
    // This is a placeholder for future OAuth2 implementation with Shopware
    res.json({ 
      message: "OAuth2 endpoint prepared for Shopware integration",
      status: "not_implemented"
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
