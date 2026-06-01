# Guia de Deploy: HostGator (cPanel Node.js Selector)

Este guia explica como configurar e implantar o jogo Rummikub 6-Players na sua hospedagem HostGator (Planos Compartilhados Turbo, VPS ou Dedicados com cPanel).

---

## 📋 Pré-requisitos
*   Acesso ao seu painel **cPanel** na HostGator.
*   Domínio ou subdomínio configurado (ex: `rummikub.seudominio.com`).
*   O cPanel deve ter a ferramenta **"Setup Node.js App"** (Gerenciador de Aplicativos Node.js).

---

## 🚀 Passo a Passo do Deploy

### Passo 1: Compactar e Enviar os Arquivos
1.  No seu computador, selecione os seguintes arquivos e pastas do projeto e compacte-os em um arquivo `.zip`:
    *   `public/` (Diretório)
    *   `package.json`
    *   `package-lock.json`
    *   `server.js`
    > [!IMPORTANT]
    > **NÃO** inclua a pasta `node_modules/` no arquivo ZIP. Ela será recriada diretamente no servidor da HostGator para evitar incompatibilidades de arquitetura de sistema (Windows vs Linux).
2.  Acesse o cPanel da HostGator, abra o **Gerenciador de Arquivos (File Manager)** e crie uma nova pasta no diretório raiz do seu usuário (por exemplo: `/home/usuario_cpanel/rummikub`).
3.  Faça o upload do arquivo `.zip` para essa pasta e extraia os arquivos lá dentro.

### Passo 2: Criar a Aplicação Node.js no cPanel
1.  No cPanel, procure por **"Setup Node.js App"** (Configurar aplicativo Node.js) na barra de pesquisa.
2.  Clique em **"Create Application"** (Criar aplicativo).
3.  Preencha as seguintes configurações:
    *   **Node.js version**: Escolha a versão recomendada (ex: `18.x` ou `20.x`).
    *   **Application mode**: Escolha `Production`.
    *   **Application root**: O caminho da pasta onde você colocou o projeto (ex: `rummikub`).
    *   **Application URL**: Escolha o domínio ou subdomínio no qual o jogo ficará acessível.
    *   **Application startup file**: Defina exatamente como `server.js`.
4.  Clique no botão **"Create"** no canto superior direito. Isso inicializará o aplicativo e criará um ambiente virtual (virtualenv).

### Passo 3: Configurar Variáveis de Ambiente
Na mesma tela de configuração do Node.js no cPanel:
1.  Role até a seção **"Environment variables"** (Variáveis de ambiente).
2.  Clique em **"Add Variable"** e insira:
    *   **Name**: `NODE_ENV`
    *   **Value**: `production`
    > [!TIP]
    > Isso garante que o túnel público do `localhost.run` permaneça desativado na hospedagem, poupando recursos e evitando bloqueios de conexões externas.
3.  Clique em **"Save"**.

### Passo 4: Instalar as Dependências (`npm install`)
1.  Após salvar o aplicativo, o cPanel detectará o arquivo `package.json` no diretório raiz.
2.  Role a página um pouco e clique no botão **"Run JS Install"** (ou **"NPM Install"**).
3.  Aguarde até que a mensagem de sucesso apareça. Isso instalará todas as dependências (`express`, `socket.io`) necessárias.

### Passo 5: Iniciar o Aplicativo
1.  Clique no botão **"Restart Application"** no topo da página de configuração.
2.  Acesse a URL definida para o jogo (ex: `http://rummikub.seudominio.com`). O jogo deverá carregar perfeitamente!

---

## ⚠️ Observações Importantes para Hospedagem Compartilhada (HostGator)

1.  **Reinicialização / Persistência de Salas**:
    Em servidores compartilhados, o cPanel utiliza o *Phusion Passenger* para gerenciar o Node.js. Se o jogo ficar sem acessos por um período (geralmente de 5 a 15 minutos), o Passenger poderá **dormir/suspender o processo** para economizar RAM do servidor.
    *   Como as salas do Rummikub e os estados do jogo são armazenados em memória (`new Map()`), **toda vez que o processo reiniciar ou acordar do modo de hibernação, as salas ativas serão apagadas**.
    *   *Como contornar*: Caso precise de persistência total sem riscos de reinicialização no meio de uma partida, recomenda-se hospedar o jogo em um servidor **VPS** ou **Dedicado**, onde você tem controle total sobre o tempo de vida do processo Node.js e pode rodar com gerenciadores como o `pm2` para mantê-lo ativo 24/7.
2.  **WebSockets (Socket.io) sob HTTPS/SSL**:
    Certifique-se de que o SSL (Let's Encrypt gratuito fornecido pela HostGator) esteja ativo no domínio selecionado para que a conexão de WebSocket segura (`wss://`) funcione sem bloqueios de navegadores.
