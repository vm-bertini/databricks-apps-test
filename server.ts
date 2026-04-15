import express from "express";
import path from "path";
import { WorkspaceClient } from "@databricks/sdk";

// Para desenvolvimento local, carrega variáveis do .env
// Em Databricks Apps, as variáveis são injetadas automaticamente
import dotenv from "dotenv";
dotenv.config();

let activeRun: { runId: number; user: string; startTime: string } | null = null;

async function startServer() {
  const app = express();
  // Databricks Apps usa porta 8080 por padrão
  const PORT = parseInt(process.env.PORT || "8080");

  app.use(express.json());

  // Databricks SDK - autenticação automática em Databricks Apps (via service principal)
  // Para dev local, defina DATABRICKS_HOST e DATABRICKS_TOKEN no .env
  const w = new WorkspaceClient();

  const notebookPath = process.env.DATABRICKS_NOTEBOOK_PATH;
  const clusterId = process.env.DATABRICKS_CLUSTER_ID;

  if (!notebookPath || !clusterId) {
    console.warn("AVISO: DATABRICKS_NOTEBOOK_PATH ou DATABRICKS_CLUSTER_ID não configurados.");
  }

  // --- Gerenciamento de Run Ativa ---
  app.get("/api/databricks/active-run", (_req, res) => {
    if (activeRun) {
      const elapsed = (Date.now() - new Date(activeRun.startTime).getTime()) / 60000;
      if (elapsed > 30) {
        console.log(`[Timeout] Liberando execução ${activeRun.runId} após 30 minutos.`);
        activeRun = null;
      }
    }
    res.json(activeRun);
  });

  app.post("/api/databricks/clear-run", (req, res) => {
    const { runId } = req.body;
    if (activeRun && activeRun.runId === runId) {
      activeRun = null;
      res.json({ success: true, message: "Bloqueio liberado." });
    } else {
      res.status(400).json({ error: "Run ID não corresponde à execução ativa ou já foi liberada." });
    }
  });

  // --- Teste de Conexão com Databricks ---
  app.get("/api/databricks/test", async (_req, res) => {
    if (!clusterId || !notebookPath) {
      return res.status(400).json({ error: "DATABRICKS_NOTEBOOK_PATH ou DATABRICKS_CLUSTER_ID não configurados." });
    }

    const result: {
      api: boolean;
      cluster: { ok: boolean; state?: string; message?: string };
      notebook: { ok: boolean; message?: string };
    } = {
      api: false,
      cluster: { ok: false },
      notebook: { ok: false },
    };

    try {
      // 1. Testar acesso ao cluster (valida API + cluster de uma vez)
      try {
        const clusterInfo = await w.clusters.get({ cluster_id: clusterId });
        result.api = true;
        result.cluster = { ok: true, state: clusterInfo.state as string };
      } catch (err: any) {
        // Se recebeu resposta HTTP, a API está acessível mas o cluster pode não existir
        if (err.statusCode || err.status) {
          result.api = true;
        }
        result.cluster = { ok: false, message: err.message };
      }

      // 2. Testar acesso ao notebook
      try {
        await w.workspace.getStatus({ path: notebookPath });
        if (!result.api) result.api = true;
        result.notebook = { ok: true };
      } catch (err: any) {
        if (err.statusCode || err.status) {
          if (!result.api) result.api = true;
        }
        result.notebook = { ok: false, message: err.message };
      }

      res.json(result);
    } catch (error: any) {
      console.error("[Databricks Test Critical Error]", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Disparar Notebook ---
  app.post("/api/databricks/run", async (req, res) => {
    if (!clusterId || !notebookPath) {
      return res.status(400).json({ error: "Configuração incompleta no servidor." });
    }

    if (activeRun) {
      return res.status(409).json({
        error: "Já existe um processo em execução.",
        activeRun,
      });
    }

    try {
      const response = await w.jobs.submit({
        run_name: `Precificacao_Trigger_${new Date().toISOString()}`,
        tasks: [
          {
            task_key: "precificacao_notebook",
            existing_cluster_id: clusterId,
            notebook_task: {
              notebook_path: notebookPath,
              base_parameters: {
                config_data: JSON.stringify(req.body),
              },
            },
          },
        ],
      });

      const runId = response.run_id!;

      activeRun = {
        runId,
        user: req.body.user || "Usuário Desconhecido",
        startTime: new Date().toISOString(),
      };

      res.json({ run_id: runId });
    } catch (error: any) {
      console.error("[Databricks Run Error]", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Status de Execução ---
  app.get("/api/databricks/status/:runId", async (req, res) => {
    try {
      const data = await w.jobs.getRun({ run_id: parseInt(req.params.runId) });
      res.json(data);
    } catch (error: any) {
      console.error("[Databricks Status Error]", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Endpoint de info (para debug no frontend) ---
  app.get("/api/databricks/config-info", (_req, res) => {
    res.json({
      clusterId: clusterId || "(não configurado)",
      notebookPath: notebookPath || "(não configurado)",
    });
  });

  // --- Arquivos Estáticos & SPA ---
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
