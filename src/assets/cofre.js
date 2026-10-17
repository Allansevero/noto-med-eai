'use strict';
window.NotoCofre = (() => {
    const el = id => document.getElementById(id), modal = el('modalCofre'), form = el('formCofre'), exclusao = el('modalExcluirCofre');
    let obterToken = () => null, gerenciar = () => { }, atual = null, timer = null, versao = 0, ocupado = false;
    const mensagens = { SESSAO_INVALIDA: 'Sua sessão expirou. Entre novamente no Noto.', COFRE_INDISPONIVEL: 'O cofre está temporariamente indisponível. Tente novamente ou fale com o suporte.', ORIGEM_INVALIDA: 'Não foi possível validar esta conexão. Reabra o Noto pelo endereço oficial.', ENTRADA_INVALIDA: 'Confira o e-mail, a senha e a autorização de acesso.', COFRE_OCUPADO: 'Uma operação está em andamento. Aguarde um instante.', NAVEGADORES_OCUPADOS: 'O acesso está ocupado agora. Tente novamente em instantes.', CONSENTIMENTO_NECESSARIO: 'Atualize seu acesso e autorize a consulta ao TribeMD.', CREDENCIAL_AUSENTE: 'Cadastre seu e-mail e senha do TribeMD.', COFRE_DESCONECTADO: 'Conecte o TribeMD para consultar a agenda.' };
    function avisar(texto) { for (const id of ['cofreMensagem', 'cofreCardMensagem'])
        el(id).textContent = texto; }
    function renderizar(s) {
        atual = s;
        const trabalhando = s?.estado === 'conectando', tem = s?.salvo === true;
        const textos = { vazio: 'Conecte sua agenda e os dados dos pacientes para preparar suas notas.', salvo: 'Credenciais salvas. Conecte para verificar o acesso.', conectando: 'Conectando ao TribeMD e consultando sua agenda…', conectado: 'Acesso validado. Sua agenda pode ser consultada pelo Noto.', desconectado: 'Desconectado. Sua credencial continua criptografada no cofre.', atencao: 'Não foi possível concluir o acesso. Confira as credenciais ou fale com o suporte.' };
        let texto = textos[s?.estado] || textos.vazio;
        if (s?.estado === 'conectado' && s.codigo)
            texto = 'Acesso validado, mas não conseguimos atualizar a agenda. Tente novamente.';
        else if (s?.consultasDisponiveis !== null && s?.consultasDisponiveis !== undefined)
            texto += ` ${s.consultasDisponiveis} consultas atendidas ou finalizadas no intervalo carregado.`;
        el('cofreCardDescricao').textContent = texto;
        el('cofreEstado').textContent = texto;
        el('btnCofreConectar').textContent = trabalhando ? 'Conectando…' : tem ? 'Gerenciar' : 'Conectar';
        el('btnCofreConectar').disabled = ocupado || trabalhando;
        el('btnCofreGerenciarConexao').textContent = tem ? (s.ativo ? 'Atualizar agenda' : 'Reconectar') : 'Conectar';
        el('btnCofreGerenciarConexao').disabled = ocupado || trabalhando;
        el('btnCofreAlterar').hidden = !tem;
        el('btnCofreAlterar').disabled = ocupado || trabalhando;
        el('btnCofreDesconectar').hidden = !tem || !s.ativo;
        el('btnCofreDesconectar').disabled = ocupado;
        el('btnCofreExcluir').hidden = !tem;
        el('btnCofreExcluir').disabled = ocupado;
        el('cofreSalvar').disabled = ocupado;
    }
    async function api(sufixo = '', method = 'GET', body, token = obterToken()) {
        if (!token)
            throw Error(mensagens.SESSAO_INVALIDA);
        const r = await fetch('/api/conta/cofre/tribemd' + sufixo, { method, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
            headers: { Authorization: 'Bearer ' + token, ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Noto-Cofre': '1' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok || !d.ok)
            throw Error(mensagens[d.codigo] || 'Não foi possível concluir a operação do cofre.');
        return d;
    }
    function parar() { clearTimeout(timer); timer = null; }
    function agendar() { parar(); if (atual?.estado === 'conectando')
        timer = setTimeout(() => void atualizar(), 2000); }
    async function atualizar() {
        const token = obterToken(), v = versao;
        if (!token)
            return;
        try {
            const d = await api('', 'GET', undefined, token);
            if (v !== versao || token !== obterToken())
                return;
            avisar('');
            renderizar(d.cofre);
            agendar();
        }
        catch (e) {
            if (v === versao && token === obterToken()) {
                avisar(e.message);
                parar();
            }
        }
    }
    function abrir() { form.reset(); el('cofreModalMensagem').textContent = ''; el('tituloModalCofre').textContent = atual?.salvo ? 'Alterar acesso TribeMD' : 'Conectar TribeMD'; modal.showModal(); }
    async function agir(fn) {
        if (ocupado)
            return;
        const v = versao, token = obterToken();
        ocupado = true;
        avisar('');
        renderizar(atual);
        try {
            const d = await fn(token);
            if (v !== versao || token !== obterToken())
                return;
            renderizar(d.cofre);
            agendar();
        }
        catch (e) {
            if (v === versao && token === obterToken())
                avisar(e.message);
        }
        finally {
            if (v === versao) {
                ocupado = false;
                renderizar(atual);
            }
        }
    }
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (ocupado || !form.reportValidity())
            return;
        const dados = { email: form.elements.email.value.trim(), senha: form.elements.senha.value, consentimento: 'tribemd-leitura-v1' };
        form.reset();
        modal.close();
        try {
            await agir(token => api('', 'POST', dados, token));
        }
        finally {
            dados.email = '';
            dados.senha = '';
        }
    });
    modal.addEventListener('close', () => form.reset());
    el('fecharModalCofre').onclick = () => modal.close();
    el('btnCofreConectar').onclick = () => atual?.salvo ? gerenciar() : abrir();
    el('btnCofreGerenciarConexao').onclick = () => {
        if (!atual?.salvo) {
            abrir();
            return;
        }
        void agir(token => api(atual.ativo ? '/consultas' : '/reconectar', 'POST', {}, token));
    };
    el('btnCofreAlterar').onclick = abrir;
    el('btnCofreDesconectar').onclick = () => void agir(token => api('/desconectar', 'POST', {}, token));
    el('btnCofreExcluir').onclick = () => exclusao.showModal();
    el('cancelarExcluirCofre').onclick = () => exclusao.close();
    el('confirmarExcluirCofre').onclick = () => { exclusao.close(); void agir(token => api('', 'DELETE', {}, token)); };
    function limpar() { versao++; parar(); ocupado = false; atual = null; form.reset(); if (modal.open)
        modal.close(); if (exclusao.open)
        exclusao.close(); avisar(''); renderizar(null); }
    return { configurar(token, abrirGerenciamento) { obterToken = token; gerenciar = abrirGerenciamento; }, atualizar, limpar };
})();
