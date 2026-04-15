export interface ConfigGrupo {
  grupo: string;
  participa: boolean;
  Alta: number;
  Baixa: number;
}

export interface ConfigGlobal {
  cutoff_date: string;
  start_date_forecast: string;
  variable_to_optimizer: string;
  how_to_optimize: string;
  constraint_revenue: number;
  constraint_profit: number;
  constraint_margin: number;
  constraint_price: number;
  revenue_tolerance: number;
  margin_tolerance: number;
  price_tolerance: number;
  time_window: number;
  max_iterations: number;
  verbose_after: number;
  min_price_perc: number;
  max_price_perc: number;
}

export const DEFAULT_GRUPOS: ConfigGrupo[] = [
  { grupo: "CAMISA ML", participa: true, Alta: 1.0, Baixa: 1.0 },
  { grupo: "POLO", participa: true, Alta: 1.0, Baixa: 1.0 },
  { grupo: "CAMISETA", participa: true, Alta: 1.0, Baixa: 1.0 },
  { grupo: "CAMISA MC", participa: true, Alta: 1.0, Baixa: 1.0 },
  { grupo: "CALCA JEANS", participa: true, Alta: 1.0, Baixa: 1.0 },
  { grupo: "CALCA", participa: true, Alta: 1.0, Baixa: 1.0 },
  { grupo: "COSTUME", participa: true, Alta: 1.0, Baixa: 1.0 },
  { grupo: "BERMUDA", participa: true, Alta: 1.0, Baixa: 1.0 },
];

export const DEFAULT_GLOBAL: ConfigGlobal = {
  cutoff_date: "09/11/2025",
  start_date_forecast: "02/03/2026",
  variable_to_optimizer: "gross_profit",
  how_to_optimize: "revenue_var_perc",
  constraint_revenue: 0.5,
  constraint_profit: 0.1,
  constraint_margin: 0.05,
  constraint_price: 0.2,
  revenue_tolerance: 0.005,
  margin_tolerance: 0.001,
  price_tolerance: 0.005,
  time_window: 1,
  max_iterations: 10000,
  verbose_after: 100,
  min_price_perc: 0.5,
  max_price_perc: 1.5,
};
