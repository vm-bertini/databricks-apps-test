export interface DatabricksRunResponse {
  run_id: number;
}

export interface TestConnectionResult {
  api: boolean;
  cluster: {
    ok: boolean;
    state?: string;
    message?: string;
  };
  notebook: {
    ok: boolean;
    message?: string;
  };
}

export const testDatabricksConnection = async (): Promise<TestConnectionResult> => {
  const response = await fetch("/api/databricks/test", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    const errorMsg = errorData.error || errorData.message || `Erro de diagnóstico: ${response.status}`;
    const details = errorData.details ? ` | Detalhes: ${JSON.stringify(errorData.details)}` : "";
    throw new Error(`${errorMsg}${details}`);
  }

  return response.json();
};

export const triggerDatabricksNotebook = async (payload: any): Promise<DatabricksRunResponse> => {
  const response = await fetch("/api/databricks/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    const errorMsg = errorData.error || errorData.message || `Erro no Databricks: ${response.statusText}`;
    const details = errorData.details ? ` | Detalhes: ${JSON.stringify(errorData.details)}` : "";
    throw new Error(`${errorMsg}${details}`);
  }

  return response.json();
};

export const getDatabricksRunStatus = async (runId: number): Promise<any> => {
  const response = await fetch(`/api/databricks/status/${runId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    const errorMsg = errorData.error || errorData.message || `Erro ao consultar status: ${response.statusText}`;
    const details = errorData.details ? ` | Detalhes: ${JSON.stringify(errorData.details)}` : "";
    throw new Error(`${errorMsg}${details}`);
  }

  return response.json();
};

export const getActiveRun = async (): Promise<any> => {
  const response = await fetch("/api/databricks/active-run", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao verificar execução ativa: ${response.status}`);
  }

  return response.json();
};

export const clearActiveRun = async (runId: number): Promise<any> => {
  const response = await fetch("/api/databricks/clear-run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ runId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    const errorMsg = errorData.error || errorData.message || `Erro ao liberar bloqueio: ${response.statusText}`;
    const details = errorData.details ? ` | Detalhes: ${JSON.stringify(errorData.details)}` : "";
    throw new Error(`${errorMsg}${details}`);
  }

  return response.json();
};
