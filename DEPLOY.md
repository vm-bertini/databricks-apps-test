# Deploy no Databricks Apps

Guia completo para levar este app (Aramis Front Precificação Outlet) para rodar como um **Databricks App** diretamente no seu workspace.

---

## Pré-requisitos

- **Databricks CLI** instalado e autenticado via OAuth
- **Workspace Databricks** com Databricks Apps habilitado (disponível em workspaces Premium/Enterprise)
- **Cluster existente** no workspace (o ID será necessário)
- **Notebook** já criado no workspace com a lógica de precificação
- **Node.js 18+** instalado localmente (para testar antes do deploy)

### Instalar Databricks CLI

```bash
# macOS/Linux
curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh | sh

# Ou via pip
pip install databricks-cli

# Verificar instalação
databricks --version
```

### Configurar autenticação (OAuth)

A autenticação usa OAuth U2M (User-to-Machine) — abre o navegador para login via SSO do seu workspace. Nenhum token manual é necessário.

```bash
databricks auth login --host https://seu-workspace.cloud.databricks.com
# Abre o navegador para autenticar via SSO
# O token OAuth é gerenciado automaticamente pelo CLI e pelo SDK
```

Verifique que funcionou:

```bash
databricks clusters list
```

---

## Passo 1: Testar localmente

Antes de fazer deploy, certifique-se que o app roda corretamente na sua máquina.

```bash
# 1. Instalar dependências
npm install

# 2. Criar arquivo .env com suas credenciais locais
cp .env.example .env
```

Edite o `.env`:
```env
DATABRICKS_NOTEBOOK_PATH=/Repos/user/project/notebook
DATABRICKS_CLUSTER_ID=1234-567890-abcdefgh
```

> **Autenticação local:** O SDK usa automaticamente o token OAuth que você configurou com `databricks auth login`. Não precisa de nenhuma variável de token no `.env`.

```bash
# 3. Rodar em modo dev
npm run dev

# App estará em http://localhost:8080
# Teste a conexão e execute um notebook para validar
```

---

## Passo 2: Criar o App no Databricks

### Opção A: Via Databricks CLI (recomendado)

```bash
# Criar o app
databricks apps create aramis-precificacao-outlet \
  --description "Frontend de Precificação Dinâmica Outlet"
```

### Opção B: Via UI do Databricks

1. No workspace Databricks, vá em **Compute** > **Apps**
2. Clique em **Create App**
3. Preencha:
   - **Name:** `aramis-precificacao-outlet`
   - **Description:** `Frontend de Precificação Dinâmica Outlet`
4. Clique em **Create**

---

## Passo 3: Configurar variáveis de ambiente

As variáveis de ambiente são definidas no `app.yaml` e configuradas no momento do deploy.

O app precisa de duas variáveis:

| Variável | Descrição | Exemplo |
|---|---|---|
| `DATABRICKS_NOTEBOOK_PATH` | Caminho do notebook no workspace | `/Repos/data-team/precificacao/notebook_outlet` |
| `DATABRICKS_CLUSTER_ID` | ID do cluster existente | `1234-567890-abcdefgh` |

> **Nota:** Você **NÃO** precisa configurar tokens ou credenciais manuais. O Databricks Apps injeta automaticamente a URL do workspace e usa um **service principal** para autenticação. O SDK (`@databricks/sdk`) detecta essas credenciais sem configuração adicional.

---

## Passo 4: Conceder permissões ao Service Principal

Quando você cria um Databricks App, o sistema cria automaticamente um **service principal** para o app. Esse SP precisa de permissões para acessar os recursos:

### 4.1 Permissão no Cluster

1. Vá em **Compute** > selecione seu cluster
2. Clique em **Permissions**
3. Adicione o service principal do app (nome parecido com `app-aramis-precificacao-outlet`)
4. Conceda permissão **Can Attach To**

### 4.2 Permissão no Notebook/Repo

1. Vá em **Workspace** > navegue até o notebook
2. Clique com botão direito > **Permissions**
3. Adicione o service principal do app
4. Conceda permissão **Can Run**

### 4.3 Permissão na Jobs API

O service principal precisa de permissão para submeter jobs. Isso geralmente é concedido automaticamente, mas se necessário:

1. Vá em **Settings** > **Identity and Access** > **Service Principals**
2. Encontre o SP do app
3. Verifique que ele tem **Workspace access**

---

## Passo 5: Deploy

### Via Databricks CLI

```bash
# Na raiz do projeto, execute:
databricks apps deploy aramis-precificacao-outlet \
  --source-code-path .
```

O CLI vai:
1. Empacotar o código fonte
2. Enviar para o workspace
3. Executar o comando definido em `app.yaml` (`bash start.sh`)
4. O `start.sh` vai: instalar deps → buildar frontend → iniciar servidor

### Acompanhar o status do deploy

```bash
# Ver status
databricks apps get aramis-precificacao-outlet

# Ver logs do deploy
databricks apps logs aramis-precificacao-outlet
```

O deploy leva alguns minutos na primeira vez (por causa do `npm install`).

---

## Passo 6: Configurar variáveis de ambiente no App

Após o primeiro deploy, configure as variáveis:

### Via CLI

```bash
databricks apps update aramis-precificacao-outlet \
  --env-vars '{
    "DATABRICKS_NOTEBOOK_PATH": "/Repos/data-team/precificacao/notebook_outlet",
    "DATABRICKS_CLUSTER_ID": "1234-567890-abcdefgh"
  }'
```

### Via UI

1. Vá em **Compute** > **Apps** > clique no app
2. Clique em **Settings** ou **Configuration**
3. Adicione as variáveis de ambiente:
   - `DATABRICKS_NOTEBOOK_PATH` = caminho do seu notebook
   - `DATABRICKS_CLUSTER_ID` = ID do seu cluster

---

## Passo 7: Acessar o App

Depois que o deploy finalizar com status **RUNNING**:

```bash
# Ver a URL do app
databricks apps get aramis-precificacao-outlet
```

A URL terá o formato:
```
https://aramis-precificacao-outlet-<workspace-id>.cloud.databricks.com
```

Todos os usuários do workspace com permissão poderão acessar o app por essa URL.

---

## Passo 8: Validar

1. Acesse a URL do app no navegador
2. Clique em **TESTAR CONEXÃO** — deve mostrar:
   - API: OK
   - Cluster: OK (com estado do cluster)
   - Notebook: OK
3. Configure os parâmetros de precificação
4. Clique em **EXECUTAR** e acompanhe o status no console de debug

---

## Atualizações futuras

Para atualizar o app após mudanças no código:

```bash
# Fazer o deploy novamente (mesmo comando)
databricks apps deploy aramis-precificacao-outlet \
  --source-code-path .
```

O Databricks Apps faz **zero-downtime deploy** — a versão antiga continua rodando até a nova estar pronta.

---

## Troubleshooting

### App não inicia

```bash
# Verificar logs
databricks apps logs aramis-precificacao-outlet
```

Causas comuns:
- `npm install` falhou (verificar `package.json`)
- Porta errada (deve ser 8080)
- Dependência nativa não disponível no container

### Erro de autenticação no Databricks

- Verifique se o service principal do app tem as permissões corretas (Passo 4)
- O SP precisa de acesso ao cluster E ao notebook

### Cluster não encontrado

- Verifique se o `DATABRICKS_CLUSTER_ID` está correto
- Clusters serverless usam ID diferente
- O cluster não precisa estar ligado — o app pode iniciar ele

### Notebook não encontrado

- Verifique o caminho completo no workspace
- Caminhos são case-sensitive
- Repos usam formato `/Repos/user/repo/notebook`

### Timeout na execução

- O app tem um hardcap de 30 minutos para execução de notebooks
- Se o notebook demora mais, ajuste o `maxAttempts` em `App.tsx`
- Verifique se o cluster está dimensionado corretamente

---

## Estrutura do projeto

```
├── app.yaml              # Configuração do Databricks Apps
├── start.sh              # Script de inicialização (install + build + start)
├── server.ts             # Express server (usa @databricks/sdk)
├── package.json          # Dependências e scripts
├── vite.config.ts        # Config do Vite (build do frontend)
├── index.html            # Entry point HTML
├── .env.example          # Template de variáveis de ambiente
├── metadata.json         # Metadados do app
├── tsconfig.json         # Config do TypeScript
└── src/
    ├── App.tsx           # Componente React principal
    ├── main.tsx          # Entry point do React
    ├── databricksService.ts  # Serviço de API (frontend → backend)
    ├── types.ts          # Tipos e defaults
    ├── index.css         # Estilos globais (Tailwind)
    └── vite-env.d.ts     # Tipos do Vite
```

---

## Diferenças: Dev Local vs Databricks Apps

| Aspecto | Dev Local | Databricks Apps |
|---|---|---|
| **Autenticação** | OAuth via `databricks auth login` | Service principal automático |
| **Porta** | 8080 (ou custom via PORT) | 8080 (padrão do runtime) |
| **DATABRICKS_HOST** | Detectado do perfil OAuth | Injetado automaticamente |
| **Frontend** | Vite dev server (HMR) | Build estático servido pelo Express |
| **NODE_ENV** | development | production |
| **HTTPS** | Não | Sim (gerenciado pelo Databricks) |
| **Acesso** | localhost | URL pública no workspace |
