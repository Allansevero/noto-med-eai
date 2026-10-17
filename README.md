# Noto — aplicativo único

Painel, cadastro, WhatsApp, API de NFS-e, PDF e processamento fiscal executam no
mesmo aplicativo, iniciado com `npm start`. O worker da fila é embutido; não há
comando ou serviço separado de worker, Noto Fiscal ou Noto IA nesta versão.

## Base preservada

- Cadastro/login por OTP do Noto Oficial e autenticação Supabase.
- Certificado A1, leitura de referência fiscal e pesquisa de nome/CRM/RQE com
  OpenSerp/NVIDIA, revisão e confirmação no painel.
- Persistência dos dados no Supabase/PostgreSQL e conexão do WhatsApp do usuário.
- Recepção de eventos e histórico de WhatsApp, sem decisões dos agentes antigos.
- API de emissão (`/api/v1/nfse`, `/v2/nfse`, `/v2/nfsen`), fila, assinatura,
  transmissão, armazenamento e conversão PDF.
- Leitor TribeMD validado na área protegida `/desenvolvedor/tribemd/`, no mesmo app.
- Cofre TribeMD por conta no painel: credenciais e cookies criptografados,
  conexão, leitura da agenda, reconexão, alteração, desconexão e exclusão.

Os motores antigos de candidatos, pedidos, aprovação conversacional e varredura
foram removidos. A fila desta base consome apenas solicitações de origem `api`.
Os testes automatizados e os scripts de teste foram removidos por solicitação
do proprietário. `npm run typecheck` verifica tipos e imports não utilizados.

## Executar

Node 22+, `npm ci`, variáveis do ambiente descritas em `.env.example` e `npm start`.
O Dockerfile inclui Chromium/Xvfb para o TribeMD. Senhas e chaves devem ficar no
ambiente/gestor de segredos; volumes e chaves de cofre existentes precisam persistir.
Não criar outros processos de emissão para acompanhar este aplicativo.

As variáveis `AGENTE_FISCAL_ATIVO` e `PREPARACAO_FISCAL_ATIVA` ainda controlam
proteções da fila e validação fiscal. Preservar os valores atuais; elas não
reativam os motores de conversa removidos. As tabelas e migrações existentes
foram preservadas; esta limpeza de código não executa exclusões no banco.

## Cofre e próximas integrações

O card TribeMD e a seção **Cofre** substituem Google Planilhas no painel. O acesso
é vinculado à conta Supabase; o usuário autoriza a leitura ao salvar as credenciais.
Configuração e limites: [cofre TribeMD](docs/implementation/cofre-tribemd.md).

Adicionar conectores como iClinic após inspecionar cada portal. Em seguida integrar extração e regras
determinísticas de pagamento/consulta/emissão. iClinic e a nova emissão automática
não estão implementados nesta base.

Detalhes da limpeza: [base unificada](docs/implementation/base-unificada.md).
Os documentos anteriores descrevem decisões e versões históricas; este README
e o relatório da base unificada são a referência do funcionamento atual.
