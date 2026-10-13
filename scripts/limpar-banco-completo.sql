-- ==============================================================================
-- Script de Limpeza Total do Banco de Dados (Ambiente de Testes / Reset Completo)
-- ==============================================================================
-- ATENÇÃO: Este script apaga TODOS os dados de usuários, médicos, pacientes,
-- conversas, mensagens de WhatsApp, notas fiscais, certificados e autenticações.
-- ==============================================================================

BEGIN;

-- 1. Limpar todas as tabelas de aplicação no schema public com CASCADE
TRUNCATE TABLE 
  public.cadastro_certificado_respostas,
  public.cadastro_certificado_avisos,
  public.cadastro_certificado_trabalhos,
  public.noto_assistente_turnos,
  public.noto_assistente_sessoes,
  public.google_planilhas_previas,
  public.google_planilhas_oauth,
  public.google_planilhas_conexoes,
  public.noto_comunicacoes,
  public.emissoes_pendentes_confirmacoes,
  public.dados_profissionais_mensagens,
  public.dados_profissionais_pendencias,
  public.onboarding_treinos_whatsapp,
  public.investigacoes_emissao,
  public.auditoria,
  public.consentimentos,
  public.solicitacao_nota_agendamentos,
  public.solicitacoes_nota,
  public.notas_fiscais,
  public.pagamentos,
  public.agenda_slots,
  public.agendamentos,
  public.whatsapp_mensagens,
  public.whatsapp_conversas,
  public.medico_respostas_rapidas,
  public.whatsapp_instancias,
  public.pacientes,
  public.medico_certificados,
  public.medico_servicos_fiscais,
  public.medico_perfil_fiscal,
  public.uso_mensal_medico,
  public.faturas_assinatura,
  public.assinaturas,
  public.planos,
  public.contador_medico,
  public.contadores,
  public.secretaria_medico,
  public.secretarias,
  public.medicos,
  public.otp_verificacoes,
  public.usuarios,
  public.contas
CASCADE;

-- 2. Limpar os usuários do Supabase Auth (auth.users)
-- Necessário para que o mesmo número de telefone / e-mail possa se cadastrar novamente do zero
DELETE FROM auth.users;

COMMIT;
