# Guia de Implementação e Manutenção do Docs (Noto Monorepo)

Este documento descreve como a documentação técnica da arquitetura do Noto é estruturada, como é servida no servidor e como adicionar novas sessões ou integrar com ferramentas de documentação estática.

---

## 1. Arquitetura da Página de Documentação

A documentação interativa oficial do Noto está localizada em:
- **Arquivo HTML:** `src/ui/docs.html` (no app principal `/noto`)
- **Rota Web:** `GET /docs` (atendida pelo Express em `src/server.ts`)

A página é construída no formato **Single Page Application (SPA)** leve e autossuficiente:
- Tipografia padrão do projeto com fonte `Geist` e `Geist Mono`.
- Navegação lateral (Sidebar) fixa com alternância instantânea de abas e suporte a links diretos via hash na URL (ex.: `/docs#servico-fiscal`, `/docs#servico-ia`).
- Botões de cópia em um clique para exemplos de comandos cURL e payloads JSON.
- Responsividade total para dispositivos móveis com menu drawer retrátil.

---

## 2. Como Servir a Documentação no Express

No arquivo `src/server.ts` do Noto, a rota é registrada junto às páginas institucionais:

```typescript
import { join } from 'node:path';

// Servir a página interativa de documentação
app.get('/docs', (_req: Request, res: Response) => {
  res.sendFile(join(__dirname, 'ui', 'docs.html'));
});
```

---

## 3. Como Adicionar Novas Sessões

Para adicionar uma nova seção ou endpoint na documentação, são necessários apenas dois passos dentro de `src/ui/docs.html`:

### Passo 1: Inserir o item na Sidebar
Localize a tag `<aside class="sidebar">` e adicione o novo botão de navegação com o atributo `data-target`:

```html
<li class="nav-item">
  <a class="nav-link" data-target="meu-novo-modulo">
    /meu-modulo
    <span class="nav-pill">:3003</span>
  </a>
</li>
```

### Passo 2: Inserir o container de conteúdo
Dentro de `<main class="content">`, crie a tag `<section>` correspondente utilizando o mesmo identificador no atributo `id`:

```html
<section id="meu-novo-modulo" class="section-content">
  <h1>Meu Novo Módulo (/meu-modulo)</h1>
  <p class="lead">Descrição concisa da responsabilidade do serviço.</p>

  <h2>Endpoints Disponíveis</h2>
  <div class="endpoint-row">
    <span class="method-badge method-post">POST</span>
    <span class="endpoint-path">/v1/modulo/acao</span>
    <span class="endpoint-desc">Ação principal do módulo</span>
  </div>

  <h2>Exemplo de Conexão (cURL)</h2>
  <div class="code-container">
    <button class="btn-copy" onclick="copiarCodigo(this)">Copiar</button>
    <pre><code>curl -X POST http://meu-modulo:3003/v1/modulo/acao \
  -H "Content-Type: application/json" \
  -H "X-Internal-Token: SEU_TOKEN_INTERNO" \
  -d '{"exemplo": true}'</code></pre>
  </div>
</section>
```

O script JavaScript no rodapé da página gerencia automaticamente:
1. A alternância da classe `.active`.
2. A atualização da URL no navegador (`#meu-novo-modulo`).
3. O scroll suave para o topo da seção.
4. O fechamento automático do menu em telas mobile.

---

## 4. Integração com Geradores Estáticos (Opcional)

Se no futuro for preferível separar a documentação em um serviço próprio com gerador estático (como **VitePress**, **Mintlify** ou **Docusaurus**):

1. **VitePress:**
   ```bash
   npm add -D vitepress
   npx vitepress init
   ```
2. **Build e Deploy no Easypanel:**
   - Criar uma pasta `/docs-site` com `package.json` e `docs/`.
   - Adicionar ao Easypanel como uma aplicação estática (Static Site) apontando para o output `dist/`.
   - Configurar o domínio `docs.notomed.com.br`.

---

## 5. Links Úteis e Endpoints Internos

| Serviço | Host Interno Easypanel | Porta | Healthcheck |
| :--- | :--- | :---: | :--- |
| **Noto** (App Web & WhatsApp) | `http://noto` | `3000` | `GET /health` |
| **Fiscal** (Certificado A1 & Serpro) | `http://fiscal` | `3001` | `GET /health` |
| **IA** (Detecção & Autocorreção) | `http://ia` | `3002` | `GET /health` |
| **Docs** | `https://seu-dominio.com/docs` | `3000` | `GET /docs` |
