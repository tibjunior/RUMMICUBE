# Guia de Deploy: Render.com (Hospedagem Node.js Gratuita)

Este guia explica como hospedar o jogo Rummikub 6-Players na plataforma **Render.com** de forma 100% gratuita, com deploy automatizado diretamente pelo seu GitHub.

---

## 🚀 Método 1: Deploy com Blueprint (Recomendado - 1 Clique)

O projeto já inclui o arquivo `render.yaml` na raiz, o que permite o deploy automatizado de todos os recursos necessários com poucos cliques:

1.  Crie um repositório **privado ou público** no seu **GitHub** (ex: `rummikub-6players`) e envie todos os arquivos do projeto para lá (exceto a pasta `node_modules`).
2.  Crie uma conta gratuita em [Render.com](https://render.com/).
3.  No painel da Render, clique no botão **"New +"** no canto superior direito e selecione **"Blueprint"**.
4.  Conecte sua conta do GitHub e selecione o repositório do jogo.
5.  Dê um nome ao seu projeto e clique em **"Apply"**.
6.  A Render irá criar e configurar o serviço web automaticamente. Em poucos minutos o jogo estará no ar!

---

## 🛠️ Método 2: Configuração Manual de Web Service

Se preferir configurar o serviço manualmente sem ler o arquivo `render.yaml`:

1.  Envie o código para o seu **GitHub**.
2.  No painel do Render, clique em **"New +"** e selecione **"Web Service"**.
3.  Conecte seu repositório do GitHub.
4.  Configure as seguintes opções na tela de criação:
    *   **Name**: `rummikub-6players` (ou qualquer nome de sua preferência).
    *   **Region**: Escolha a mais próxima de você (ex: `Ohio (us-east-2)` ou `Oregon (us-west-2)`).
    *   **Branch**: `main` (ou a branch padrão do seu repositório).
    *   **Runtime**: `Node`.
    *   **Build Command**: `npm install`.
    *   **Start Command**: `node server.js`.
    *   **Instance Type**: `Free`.
5.  Clique em **"Create Web Service"** no final da página.

---

## 💡 Informações Úteis sobre o Plano Gratuito da Render

*   **Persistência de Salas**:
    A Render roda a sua aplicação em containers temporários. Toda vez que a aplicação fizer deploy de um código novo ou reiniciar devido à inatividade, as salas de jogo na memória RAM serão apagadas. Isto é perfeitamente aceitável para um jogo casual de Rummikub, mas certifique-se de que os jogadores finalizem a partida antes de deixar o servidor inativo.
*   **Modo de Suspensão (Spin-down)**:
    Se a aplicação ficar sem receber acessos por **15 minutos**, a Render colocará o container para "dormir" para economizar recursos.
    *   Quando o primeiro jogador entrar após esse período, o Render demorará de **40 a 50 segundos** para reiniciar o servidor e carregar a página.
    *   Assim que o servidor estiver acordado, as partidas rodarão de forma rápida e fluida com suporte nativo a WebSockets.
*   **WebSockets e SSL**:
    A Render configura automaticamente certificados SSL gratuitos (HTTPS). Isso significa que as conexões WebSocket seguras (`wss://`) funcionarão sem nenhum tipo de configuração extra ou erros de segurança.
