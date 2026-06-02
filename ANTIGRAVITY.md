# Manual de Instruções para o Agente Antigravity

Olá, Agente! Este é o manual do projeto **Rummikub 6-Players Online**. Este documento foi elaborado para que você entenda de imediato a arquitetura do sistema, saiba onde estão localizados os arquivos e como continuar o desenvolvimento, correções de bugs ou deploys sem quebrar o fluxo.

---

## 1. Visão Geral do Sistema
O jogo é uma versão multiplayer web (2D interativa) de Rummikub, com suporte para até 6 jogadores, bots de IA inteligentes e salas privadas.
* **Stack Tecnológica**: Node.js, Express, Socket.io (WebSockets), HTML5, CSS3 vanilla (temas dinâmicos), JS vanilla (DOM).
* **Produção (Render.com)**: O servidor está publicado em: **[https://rummikub-6players.onrender.com/](https://rummikub-6players.onrender.com/)**
* **Repositório Git**: Vinculado ao repositório privado: **`https://github.com/tibjunior/RUMMICUBE.git`**
* **Inicialização Local**: Área de Trabalho possui o atalho `Jogar_Rummikub.bat` para subir o servidor local e o túnel SSH do `localhost.run`.

---

## 2. Estrutura do Código e Arquitetura

### 📁 Raiz do Projeto (`C:\Users\Tiberio\Desktop\RUMMICUBE`)
* **`server.js`**: O core do servidor WebSocket.
  * Gerencia estados das salas em um `Map()` global (`rooms`).
  * Processa a lógica de turnos e temporizador autoritativo de 90 segundos por jogador.
  * Contém o **Motor de IA (Bots)**: lógica que gerencia as jogadas das IAs. Suporta regras complexas como:
    * **Meld Inicial (30+ pontos)**: IA busca conjuntos válidos no seu suporte e só joga se totalizar 30+ pontos (`tryMeldInicial`).
    * **Coringas**: IA procura grupos e sequências contendo coringas (`findGroupWithKJokers`, `findRunWithKJokers`).
    * **Acoplamentos**: IA acopla peças soltas do seu suporte nas extremidades de conjuntos existentes na mesa comum (`tryAcoplarPeças`).
* **`package.json`**: Dependências (`express`, `socket.io`, `localtunnel`). Executável via `npm start`.

### 📁 Pasta do Cliente (`C:\Users\Tiberio\Desktop\RUMMICUBE\public`)
* **`index.html`**: A interface de usuário. Dividida em três telas principais:
  * `#auth-screen`: Tela de login e entrada na sala.
  * `#lobby-screen`: Sala de espera contendo o painel de configurações da partida (selects controlados pelo Host), lista de jogadores (com badges de IA e botão de remover) e o **Chat do Lobby** integrado em duas colunas responsivas.
  * `#game-screen`: O jogo ativo. Grade do tabuleiro (12x25), suporte do jogador (2x20), painel do placar e o chat do jogo ativo.
* **`style.css`**: Design System premium com cantos arredondados, sombras e glassmorphic. Contém:
  * Três temas visuais chave baseados no `body.theme-*`: Escuro Futurista (`theme-dark`), Clássico Mogno/Feltro Verde (`theme-wood`) e Cyberpunk Neon (`theme-neon`).
  * Estilos do chat do lobby estruturados em duas colunas com responsividade.
* **`client.js`**: Lógica visual do front-end.
  * Gerencia a conexão Socket.io (`socket`).
  * Efeitos sonoros sintetizados nativos no navegador (`SoundManager`).
  * Sistema de arrastar e soltar (Drag & Drop) para o tabuleiro com validação local.
  * Recebe `roomUpdate` e renderiza os estados da mesa, suporte privado e badges de IA.

---

## 3. Instruções de Desenvolvimento e Edição

### ⚠️ Regras Cruciais
1. **Língua**: Todas as interações com o usuário e os comentários/logs novos do sistema devem ser em **Português**.
2. **Estilo**: Preservar o visual premium escuro e harmônico. Ao adicionar componentes, certifique-se de que eles herdem as cores de variáveis HSL ou do design system (`--bg-card`, `--primary`, etc.).
3. **Não quebrar o fluxo de deploy**: Não remova recursos já implementados pelo usuário, como configurações do lobby ou remoção do link público do lobby.

### 🔌 Eventos do Socket.io (Comunicação)
* **Cliente -> Servidor**:
  * `createRoom` / `joinRoom`: Cria ou entra na sala.
  * `addBot` / `removeBot` `{ botId }`: Gerencia Bots na sala (exclusivo para o Host).
  * `updateSettings` `{ settings }`: Atualiza as configurações da partida de Rummikub (exclusivo para o Host).
  * `startGame`: Inicia a partida.
  * `updateBoard` `{ board }`: Envia o tabuleiro atual em tempo real enquanto o jogador edita no seu turno.
  * `endTurn` `{ board, rack }`: Conclui o turno enviando o estado final e a validação.
  * `drawTile` / `undoTurn`: Compra peça ou desfaz as ações do turno atual.
  * `sendChat` `{ msg }` / `sendReaction` `{ emoji }`: Envia mensagens de chat ou reações de emoji.
* **Servidor -> Cliente**:
  * `roomUpdate` `{ room }`: Atualização completa da sala (sincroniza jogadores, configurações, tabuleiro e o suporte do próprio jogador).
  * `boardUpdated` `{ board }`: Atualização em tempo real do tabuleiro para os espectadores da rodada.
  * `infoMsg` `{ msg }` / `errorMsg` `{ msg }`: Mensagens de sistema e notificações de toast.
  * `chatMsg` / `reaction`: Transmissão de conversas e emojis.

---

## 4. Como Executar Testes Locais
Para validar as suas modificações sem poluir o ambiente ou precisar abrir o navegador, execute testes simulando conexões através do script `test-bot.js` localizado na pasta de scratch da IA.
1. Localize a pasta `scratch` do seu ID de conversação atual:
   `<appDataDir>\brain\<conversation-id>\scratch`
2. Certifique-se de que o servidor local está rodando em segundo plano (`npm start` na pasta do projeto).
3. Execute `node test-bot.js` no terminal da pasta scratch.
4. O script conectará via WebSocket em `http://localhost:3000`, criará a sala, adicionará duas IAs, iniciará o jogo e testará 3 rodadas completas automaticamente, emitindo os logs de validação do motor.

---

## 5. Como Sincronizar e Fazer o Deploy
O Git está instalado em **`C:\Program Files\Git\cmd\git.exe`**.
Como o terminal inicializa com as variáveis de ambiente antigas, você deve chamar o Git localmente pelo caminho completo:

1. **Configuração de Autoria** (caso o Git acuse autor desconhecido):
   ```powershell
   & "C:\Program Files\Git\cmd\git.exe" config user.email "tibjunior@users.noreply.github.com"
   & "C:\Program Files\Git\cmd\git.exe" config user.name "tibjunior"
   ```
2. **Commit local**:
   ```powershell
   & "C:\Program Files\Git\cmd\git.exe" add .
   & "C:\Program Files\Git\cmd\git.exe" commit -m "sua mensagem descritiva"
   ```
3. **Enviar para o GitHub**:
   ```powershell
   & "C:\Program Files\Git\cmd\git.exe" push origin master
   ```
O Render.com detectará o push na branch `master` e fará o build e redeploy automático na nuvem.

Boa codificação!
