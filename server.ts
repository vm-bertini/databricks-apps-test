import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

let activeRun: { runId: number; user: string; startTime: string } | null = null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Databricks API Proxy ---
  app.get("/api/databricks/active-run", (req, res) => {
    // Verificar timeout de 30 minutos
    if (activeRun) {
      const startTime = new Date(activeRun.startTime).getTime();
      const now = new Date().getTime();
      const diffMinutes = (now - startTime) / (1000 * 60);
      
      if (diffMinutes > 30) {
        console.log(`[Timeout] Liberando execução ${activeRun.runId} após 30 minutos.`);
        activeRun = null;
      }
    }
    res.json(activeRun);
  });

  // Endpoint para liberar o bloqueio manualmente ou via polling
  app.post("/api/databricks/clear-run", (req, res) => {
    const { runId } = req.body;
    if (activeRun && activeRun.runId === runId) {
      activeRun = null;
      res.json({ success: true, message: "Bloqueio liberado." });
    } else {
      res.status(400).json({ error: "Run ID não corresponde à execução ativa ou já foi liberada." });
    }
  });

  // Proxy Databricks API to avoid CORS issues and hide token
  app.get("/api/databricks/test", async (req, res) => {
    const workspaceUrl = process.env.VITE_DATABRICKS_WORKSPACE_URL?.replace(/\/$/, "");
    const token = process.env.VITE_DATABRICKS_TOKEN;
    const clusterId = process.env.VITE_DATABRICKS_CLUSTER_ID?.split('?')[0];
    const notebookPath = process.env.VITE_DATABRICKS_NOTEBOOK_PATH;

    if (!workspaceUrl || !token || !clusterId || !notebookPath) {
      return res.status(400).json({ error: "Configuração incompleta no servidor." });
    }

    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const result: {
      api: boolean;
      cluster: { ok: boolean; state?: string; message?: string };
      notebook: { ok: boolean; message?: string };
    } = {
      api: false,
      cluster: { ok: false },
      notebook: { ok: false }
    };

    try {
      // 1. Test API Access
      const apiRes = await fetch(`${workspaceUrl}/api/2.0/clusters/list`, { method: "GET", headers });
      if (!apiRes.ok) {
        const errorBody = await apiRes.json().catch(() => ({ message: apiRes.statusText }));
        console.error("[Databricks API Test Error]", { status: apiRes.status, body: errorBody });
        throw new Error(`API Test failed: HTTP ${apiRes.status} - ${JSON.stringify(errorBody)}`);
      }
      result.api = true;

      // 2. Test Specific Cluster
      const clusterRes = await fetch(`${workspaceUrl}/api/2.0/clusters/get?cluster_id=${clusterId}`, { method: "GET", headers });
      if (clusterRes.ok) {
        const data = await clusterRes.json();
        result.cluster = { ok: true, state: data.state };
      } else {
        const err = await clusterRes.json().catch(() => ({ message: clusterRes.statusText }));
        console.error("[Databricks Cluster Test Error]", { status: clusterRes.status, body: err });
        result.cluster = { ok: false, message: err.message || JSON.stringify(err) };
      }

      // 3. Test Specific Notebook
      const notebookRes = await fetch(`${workspaceUrl}/api/2.0/workspace/get-status?path=${encodeURIComponent(notebookPath)}`, { method: "GET", headers });
      if (notebookRes.ok) {
        result.notebook = { ok: true };
      } else {
        const err = await notebookRes.json().catch(() => ({ message: notebookRes.statusText }));
        console.error("[Databricks Notebook Test Error]", { status: notebookRes.status, body: err });
        result.notebook = { ok: false, message: err.message || JSON.stringify(err) };
      }

      res.json(result);
    } catch (error: any) {
      console.error("[Databricks Test Critical Error]", error);
      res.status(500).json({ error: error.message, details: error.stack });
    }
  });

  app.post("/api/databricks/run", async (req, res) => {
    const workspaceUrl = process.env.VITE_DATABRICKS_WORKSPACE_URL?.replace(/\/$/, "");
    const notebookPath = process.env.VITE_DATABRICKS_NOTEBOOK_PATH;
    const clusterId = process.env.VITE_DATABRICKS_CLUSTER_ID?.split('?')[0];
    const token = process.env.VITE_DATABRICKS_TOKEN;

    if (!workspaceUrl || !notebookPath || !clusterId || !token) {
      return res.status(400).json({ error: "Configuração incompleta no servidor." });
    }

    // Verificar se já existe uma execução ativa
    if (activeRun) {
      return res.status(409).json({ 
        error: "Já existe um processo em execução.", 
        activeRun 
      });
    }

    const url = `${workspaceUrl}/api/2.1/jobs/runs/submit`;
    const body = {
      run_name: `Databricks_Hub_Trigger_${new Date().toISOString()}`,
      existing_cluster_id: clusterId,
      notebook_task: {
        notebook_path: notebookPath,
        base_parameters: {
          config_data: JSON.stringify(req.body)
        }
      }
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("[Databricks Run Error]", { status: response.status, body: data });
        return res.status(response.status).json({ 
          error: "Erro ao disparar notebook no Databricks", 
          details: data,
          status: response.status 
        });
      }

      // Registrar a execução ativa
      activeRun = {
        runId: data.run_id,
        user: req.body.user || "Usuário Desconhecido",
        startTime: new Date().toISOString()
      };

      res.json(data);
    } catch (error: any) {
      console.error("[Databricks Run Critical Error]", error);
      res.status(500).json({ error: error.message, details: error.stack });
    }
  });

  app.get("/api/databricks/status/:runId", async (req, res) => {
    const workspaceUrl = process.env.VITE_DATABRICKS_WORKSPACE_URL?.replace(/\/$/, "");
    const token = process.env.VITE_DATABRICKS_TOKEN;
    const { runId } = req.params;

    if (!workspaceUrl || !token) {
      return res.status(400).json({ error: "Configuração incompleta no servidor." });
    }

    const url = `${workspaceUrl}/api/2.1/jobs/runs/get?run_id=${runId}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("[Databricks Status Error]", { status: response.status, body: data });
        return res.status(response.status).json({ 
          error: "Erro ao consultar status no Databricks", 
          details: data,
          status: response.status 
        });
      }
      res.json(data);
    } catch (error: any) {
      console.error("[Databricks Status Critical Error]", error);
      res.status(500).json({ error: error.message, details: error.stack });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
