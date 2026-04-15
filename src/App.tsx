import React, { useState, useEffect } from "react";
import { 
  triggerDatabricksNotebook, 
  testDatabricksConnection, 
  getDatabricksRunStatus, 
  getActiveRun, 
  clearActiveRun 
} from "./databricksService";
import { ConfigGrupo, ConfigGlobal, DEFAULT_GRUPOS, DEFAULT_GLOBAL } from "./types";
import { 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Settings,
  Clock,
  Database,
  Terminal,
  Cpu,
  Table as TableIcon,
  ChevronRight,
  Bug,
  ChevronDown,
  ChevronUp,
  History,
  Unlock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STORAGE_KEY_GRUPOS = "precificacao_grupos_v2";
const STORAGE_KEY_GLOBAL = "precificacao_global_v2";

const MainApp = () => {
  const [grupos, setGrupos] = useState<ConfigGrupo[]>([]);
  const [global, setGlobal] = useState<ConfigGlobal>(DEFAULT_GLOBAL);
  const [isTriggering, setIsTriggering] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showDebug, setShowDebug] = useState(true);
  const [debugLogs, setDebugLogs] = useState<{ time: string; msg: string; type: "info" | "error" | "success" }[]>([]);
  const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({
    type: null,
    message: "",
  });

  const currentUserEmail = "victor.bertini@aramisinc.com.br";

  // Load from localStorage on mount
  useEffect(() => {
    const savedGrupos = localStorage.getItem(STORAGE_KEY_GRUPOS);
    const savedGlobal = localStorage.getItem(STORAGE_KEY_GLOBAL);

    if (savedGrupos) {
      setGrupos(JSON.parse(savedGrupos));
    } else {
      setGrupos(DEFAULT_GRUPOS);
    }

    if (savedGlobal) {
      setGlobal(JSON.parse(savedGlobal));
    } else {
      setGlobal(DEFAULT_GLOBAL);
    }
    
    addLog("Aplicativo iniciado.", "info");
    checkActiveRun();
  }, []);

  const checkActiveRun = async () => {
    try {
      const activeRun = await getActiveRun();
      if (activeRun) {
        addLog(`Detectada execução ativa iniciada por ${activeRun.user} em ${new Date(activeRun.startTime).toLocaleTimeString()}`, "info");
        setStatus({ 
          type: "success", 
          message: `O usuário ${activeRun.user} já iniciou um processo. Monitorando progresso...` 
        });
        setIsTriggering(true);
        startPolling(activeRun.runId);
      }
    } catch (error) {
      console.error("Erro ao verificar execução ativa:", error);
    }
  };

  const addLog = (msg: string, type: "info" | "error" | "success" = "info") => {
    // Se a mensagem contém detalhes (separados por |), quebra em linhas para o log
    if (msg.includes(" | Detalhes: ")) {
      const [mainMsg, details] = msg.split(" | Detalhes: ");
      setDebugLogs(prev => [
        { time: new Date().toLocaleTimeString(), msg: mainMsg, type },
        { time: new Date().toLocaleTimeString(), msg: `DETALHES: ${details}`, type },
        ...prev
      ].slice(0, 100));
    } else {
      setDebugLogs(prev => [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev].slice(0, 100));
    }
  };

  // Save to localStorage whenever data changes
  useEffect(() => {
    if (grupos.length > 0) {
      localStorage.setItem(STORAGE_KEY_GRUPOS, JSON.stringify(grupos));
    }
  }, [grupos]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(global));
  }, [global]);

  const updateGrupo = (index: number, field: keyof ConfigGrupo, value: any) => {
    const newGrupos = [...grupos];
    newGrupos[index] = { ...newGrupos[index], [field]: value };
    setGrupos(newGrupos);
  };

  const updateGlobal = (field: keyof ConfigGlobal, value: any) => {
    setGlobal({ ...global, [field]: value });
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    addLog("Iniciando diagnóstico de conexão...", "info");
    try {
      const result = await testDatabricksConnection();
      
      addLog("1. Acesso à API: OK", "success");
      
      if (result.cluster.ok) {
        addLog(`2. Cluster (${import.meta.env.VITE_DATABRICKS_CLUSTER_ID}): OK (Status: ${result.cluster.state})`, "success");
      } else {
        addLog(`2. Cluster: ERRO - ${result.cluster.message}`, "error");
      }

      if (result.notebook.ok) {
        addLog(`3. Notebook (${import.meta.env.VITE_DATABRICKS_NOTEBOOK_PATH}): OK`, "success");
      } else {
        addLog(`3. Notebook: ERRO - ${result.notebook.message}`, "error");
      }

      if (result.api && result.cluster.ok && result.notebook.ok) {
        setStatus({ type: "success", message: "Diagnóstico concluído: Todos os recursos estão acessíveis!" });
      } else {
        setStatus({ type: "error", message: "Diagnóstico concluído: Alguns recursos falharam. Verifique o console de debug para detalhes técnicos." });
      }
    } catch (error: any) {
      addLog(`Falha crítica: ${error.message}`, "error");
      setStatus({ type: "error", message: `Erro de diagnóstico: ${error.message.split(" | ")[0]}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTriggerDatabricks = async () => {
    setIsTriggering(true);
    setStatus({ type: null, message: "" });
    addLog("Preparando variáveis para o Notebook...", "info");

    try {
      // Payload simplificado contendo apenas as configurações da UI
      const payload = {
        grupos: grupos.filter(g => g.participa), // Envia apenas os grupos ativos
        global: global,
        timestamp: new Date().toISOString(),
        user: currentUserEmail
      };

      addLog(`Payload: ${JSON.stringify(payload).substring(0, 50)}...`, "info");
      addLog("Chamando API de execução do Notebook...", "info");
      
      const response = await triggerDatabricksNotebook(payload);
      const runId = response.run_id;
      
      addLog(`Notebook iniciado! Run ID: ${runId}`, "success");
      setStatus({ 
        type: "success", 
        message: `Notebook em execução! Run ID: ${runId}. Monitorando progresso...` 
      });

      // Inicia monitoramento do status
      startPolling(runId);

    } catch (error: any) {
      addLog(`Erro no disparo: ${error.message}`, "error");
      console.error(error);
      setStatus({ 
        type: "error", 
        message: `Erro ao processar: ${error.message.split(" | ")[0]}` 
      });
      setIsTriggering(false);
    }
  };

  const startPolling = async (runId: number) => {
    let finished = false;
    let attempts = 0;
    const maxAttempts = 360; // 30 minutos (5s * 360) - Hardcap

    const poll = async () => {
      if (finished) return;
      
      if (attempts === 240) { // 20 minutos
        addLog("Aviso: O processamento está demorando muito (20 min). Tente atualizar a página mais tarde.", "error");
        setStatus({ 
          type: "error", 
          message: "O processamento está demorando mais que o esperado. Tente atualizar a página mais tarde se necessário." 
        });
      }

      if (attempts >= maxAttempts) { // 30 minutos
        addLog("Hardcap: Tempo limite de 30 minutos atingido. A requisição falhou ou travou no Databricks.", "error");
        setStatus({ 
          type: "error", 
          message: "O tempo limite de 30 minutos foi atingido. A requisição foi pro krl (falhou ou travou). O botão foi liberado." 
        });
        setIsTriggering(false);
        try { await clearActiveRun(runId); } catch (e) {}
        return;
      }
      
      attempts++;
      try {
        const data = await getDatabricksRunStatus(runId);
        const state = data.state;
        const lifeCycleState = state.life_cycle_state;
        const resultState = state.result_state;

        // Tradução amigável dos estados do Databricks
        let statusMsg = lifeCycleState;
        if (lifeCycleState === "PENDING") statusMsg = "Aguardando Cluster (Iniciando...)";
        if (lifeCycleState === "RUNNING") statusMsg = "Executando Notebook...";
        
        addLog(`Status [${runId}]: ${statusMsg}${resultState ? ` (${resultState})` : ""}`, "info");

        if (lifeCycleState === "TERMINATED" || lifeCycleState === "SKIPPED" || lifeCycleState === "INTERNAL_ERROR") {
          finished = true;
          setIsTriggering(false);
          
          // Notifica o servidor para liberar o bloqueio global
          try {
            await clearActiveRun(runId);
            addLog("Bloqueio global liberado no servidor.", "info");
          } catch (e) {
            console.error("Erro ao liberar bloqueio no servidor:", e);
          }
          
          if (resultState === "SUCCESS") {
            addLog(`Notebook [${runId}] finalizado com SUCESSO!`, "success");
            setStatus({ type: "success", message: `Processamento concluído com sucesso! (Run ID: ${runId})` });
          } else {
            const errorDetail = state.state_message ? ` | Detalhes: ${state.state_message}` : "";
            addLog(`Notebook [${runId}] finalizado com ERRO: ${resultState || lifeCycleState}${errorDetail}`, "error");
            setStatus({ 
              type: "error", 
              message: `O processamento falhou ou foi cancelado. (Status: ${resultState || lifeCycleState})` 
            });
          }
        } else {
          // Continua monitorando
          setTimeout(poll, 5000);
        }
      } catch (error: any) {
        addLog(`Erro ao monitorar status: ${error.message}`, "error");
        // Tenta novamente mesmo com erro de rede temporário
        setTimeout(poll, 5000);
      }
    };

    setTimeout(poll, 5000);
  };

  const handleForceUnlock = async () => {
    if (!window.confirm("Isso irá liberar o botão para todos os usuários, mesmo que o notebook ainda esteja rodando no Databricks. Deseja continuar?")) return;
    
    try {
      const active = await getActiveRun();
      if (active && active.runId) {
        await clearActiveRun(active.runId);
        addLog("Bloqueio liberado manualmente.", "info");
        setIsTriggering(false);
      } else {
        setIsTriggering(false);
        addLog("Estado local resetado.", "info");
      }
    } catch (error: any) {
      addLog(`Erro ao liberar: ${error.message}`, "error");
      setIsTriggering(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E5E5] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FF3621] rounded-lg flex items-center justify-center text-white shadow-lg shadow-[#FF3621]/20">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Aramis Front Precificação Outlet</h1>
              <p className="text-[10px] text-[#666] uppercase tracking-wider font-semibold">Precificação Dinâmica</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#F3F3F3] rounded-full">
            <div className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              isTriggering ? "bg-amber-500" : "bg-emerald-500"
            )}></div>
            <span className="text-[10px] font-bold text-[#666] uppercase tracking-wider">
              {isTriggering ? "Processamento Ativo" : "Conectado ao Databricks"}
            </span>
            {isTriggering && (
              <button 
                onClick={handleForceUnlock}
                className="ml-2 p-1 hover:bg-red-100 rounded text-red-500 transition-colors"
                title="Forçar Liberação do Botão"
              >
                <Unlock className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Filling Fields */}
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden shadow-xl shadow-black/5">
              <div className="px-8 py-6 border-b border-[#E5E5E5] flex items-center justify-between bg-[#FAFAFA]">
                <div className="flex items-center gap-3">
                  <TableIcon className="w-5 h-5 text-[#FF3621]" />
                  <h2 className="font-bold text-lg">Configuração por Grupo</h2>
                </div>
                <div className="text-[10px] font-bold text-[#666] bg-white px-3 py-1 rounded-full border border-[#E5E5E5]">
                  {grupos.length} GRUPOS ATIVOS
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F9F9F9] text-[#666] font-bold text-[10px] uppercase tracking-widest">
                      <th className="px-8 py-4 text-left">Grupo</th>
                      <th className="px-8 py-4 text-center">Participa</th>
                      <th className="px-8 py-4 text-right">Alta</th>
                      <th className="px-8 py-4 text-right">Baixa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5]">
                    {grupos.map((grupo, idx) => (
                      <tr key={idx} className="hover:bg-[#FAFAFA] transition-colors group">
                        <td className="px-8 py-4 font-bold text-[#1A1A1A]">{grupo.grupo}</td>
                        <td className="px-8 py-4 text-center">
                          <input 
                            type="checkbox" 
                            checked={grupo.participa}
                            onChange={(e) => updateGrupo(idx, "participa", e.target.checked)}
                            className="w-5 h-5 rounded border-[#D1D1D1] text-[#FF3621] focus:ring-[#FF3621]/20 transition-all"
                          />
                        </td>
                        <td className="px-8 py-4 text-right">
                          <input 
                            type="number" 
                            step="0.01"
                            value={grupo.Alta}
                            onChange={(e) => updateGrupo(idx, "Alta", parseFloat(e.target.value))}
                            className="w-24 text-right border-none bg-transparent focus:ring-2 focus:ring-[#FF3621]/20 rounded-lg px-3 py-1 font-mono font-bold text-[#FF3621]"
                          />
                        </td>
                        <td className="px-8 py-4 text-right">
                          <input 
                            type="number" 
                            step="0.01"
                            value={grupo.Baixa}
                            onChange={(e) => updateGrupo(idx, "Baixa", parseFloat(e.target.value))}
                            className="w-24 text-right border-none bg-transparent focus:ring-2 focus:ring-[#FF3621]/20 rounded-lg px-3 py-1 font-mono font-bold text-[#0078D4]"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden shadow-xl shadow-black/5">
              <div className="px-8 py-6 border-b border-[#E5E5E5] flex items-center gap-3 bg-[#FAFAFA]">
                <Settings className="w-5 h-5 text-[#FF3621]" />
                <h2 className="font-bold text-lg">Configuração Global</h2>
              </div>
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[#666] uppercase tracking-wider">Cutoff Date</label>
                    <input 
                      type="text" 
                      value={global.cutoff_date}
                      onChange={(e) => updateGlobal("cutoff_date", e.target.value)}
                      className="w-full text-sm border-[#D1D1D1] rounded-xl focus:ring-2 focus:ring-[#FF3621]/20 focus:border-[#FF3621] transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[#666] uppercase tracking-wider">Start Date Forecast</label>
                    <input 
                      type="text" 
                      value={global.start_date_forecast}
                      onChange={(e) => updateGlobal("start_date_forecast", e.target.value)}
                      className="w-full text-sm border-[#D1D1D1] rounded-xl focus:ring-2 focus:ring-[#FF3621]/20 focus:border-[#FF3621] transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[#666] uppercase tracking-wider">Variable to Optimizer</label>
                    <input 
                      type="text" 
                      value={global.variable_to_optimizer}
                      onChange={(e) => updateGlobal("variable_to_optimizer", e.target.value)}
                      className="w-full text-sm border-[#D1D1D1] rounded-xl focus:ring-2 focus:ring-[#FF3621]/20 focus:border-[#FF3621] transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[#666] uppercase tracking-wider">How to Optimize</label>
                    <input 
                      type="text" 
                      value={global.how_to_optimize}
                      onChange={(e) => updateGlobal("how_to_optimize", e.target.value)}
                      className="w-full text-sm border-[#D1D1D1] rounded-xl focus:ring-2 focus:ring-[#FF3621]/20 focus:border-[#FF3621] transition-all"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E5E5E5] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Rev. Constraint", field: "constraint_revenue" },
                    { label: "Profit Constraint", field: "constraint_profit" },
                    { label: "Margin Constraint", field: "constraint_margin" },
                    { label: "Price Constraint", field: "constraint_price" },
                    { label: "Rev. Tolerance", field: "revenue_tolerance" },
                    { label: "Margin Tolerance", field: "margin_tolerance" },
                    { label: "Price Tolerance", field: "price_tolerance" },
                    { label: "Time Window", field: "time_window" },
                    { label: "Max Iterations", field: "max_iterations" },
                    { label: "Verbose After", field: "verbose_after" },
                    { label: "Min Price %", field: "min_price_perc" },
                    { label: "Max Price %", field: "max_price_perc" },
                  ].map((item) => (
                    <div key={item.field} className="space-y-2">
                      <label className="text-[10px] font-bold text-[#666] uppercase tracking-wider">{item.label}</label>
                      <input 
                        type="number" 
                        step="0.001"
                        value={global[item.field as keyof ConfigGlobal]}
                        onChange={(e) => updateGlobal(item.field as keyof ConfigGlobal, parseFloat(e.target.value))}
                        className="w-full text-sm border-[#D1D1D1] rounded-xl focus:ring-2 focus:ring-[#FF3621]/20 focus:border-[#FF3621] transition-all font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Controls & Logs */}
          <div className="space-y-6">
            {/* Actions */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button 
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className={cn(
                    "flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-bold transition-all border-2",
                    isTesting
                      ? "bg-[#F3F3F3] text-[#999] border-[#E5E5E5] cursor-not-allowed"
                      : "bg-white text-[#666] border-[#E5E5E5] hover:border-[#FF3621] hover:text-[#FF3621]"
                  )}
                >
                  {isTesting ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-5 h-5" />
                  )}
                  TESTAR CONEXÃO
                </button>

                <button 
                  onClick={handleTriggerDatabricks}
                  disabled={isTriggering}
                  className={cn(
                    "flex items-center justify-center gap-3 py-4 px-6 rounded-2xl font-bold transition-all shadow-xl active:scale-[0.98]",
                    isTriggering
                      ? "bg-[#E5E5E5] text-[#999] cursor-not-allowed"
                      : "bg-[#FF3621] hover:bg-[#E02D1A] text-white shadow-[#FF3621]/20"
                  )}
                >
                  {isTriggering ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Play className="w-5 h-5 fill-current" />
                  )}
                  {isTriggering ? "PROCESSANDO..." : "EXECUTAR"}
                </button>
              </div>

              <AnimatePresence>
                {status.type && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className={cn(
                      "p-6 rounded-2xl flex items-start gap-4 border shadow-lg",
                      status.type === "success" 
                        ? "bg-[#F0F9F1] border-[#B7E1CD] text-[#0D652D]" 
                        : "bg-[#FDF2F2] border-[#F8B4B4] text-[#9B1C1C]"
                    )}
                  >
                    {status.type === "success" ? (
                      <CheckCircle2 className="w-6 h-6 shrink-0" />
                    ) : (
                      <AlertCircle className="w-6 h-6 shrink-0" />
                    )}
                    <div>
                      <p className="font-bold">{status.type === "success" ? "Sucesso" : "Erro no Processo"}</p>
                      <p className="text-sm opacity-90">{status.message}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Debug Interface */}
              <section className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden shadow-lg">
                <button 
                  onClick={() => setShowDebug(!showDebug)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#FAFAFA] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Bug className="w-5 h-5 text-[#666]" />
                    <h3 className="font-bold text-sm uppercase tracking-wider text-[#666]">Console de Debug</h3>
                  </div>
                  {showDebug ? <ChevronUp className="w-5 h-5 text-[#999]" /> : <ChevronDown className="w-5 h-5 text-[#999]" />}
                </button>
                
                <AnimatePresence>
                  {showDebug && (
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 pt-0">
                        <div className="bg-[#1A1A1A] rounded-xl p-4 h-48 overflow-y-auto font-mono text-[10px] space-y-1 custom-scrollbar">
                          {debugLogs.length === 0 ? (
                            <p className="text-[#444]">Aguardando ações...</p>
                          ) : (
                            debugLogs.map((log, i) => (
                              <div key={i} className="flex gap-3">
                                <span className="text-[#666] shrink-0">[{log.time}]</span>
                                <span className={cn(
                                  log.type === "error" ? "text-[#FF4444]" : 
                                  log.type === "success" ? "text-[#00FF00]" : 
                                  "text-[#AAAAAA]"
                                )}>
                                  {log.msg}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] flex items-center gap-4">
                <div className="w-12 h-12 bg-[#F3F3F3] rounded-xl flex items-center justify-center text-[#666]">
                  <Clock className="w-6 h-6" />
                </div>
                <div className="text-xs text-[#666]">
                  <p className="font-bold uppercase tracking-widest opacity-50">Última Sincronização</p>
                  <p className="text-sm font-semibold">{new Date().toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default function App() {
  return <MainApp />;
}
