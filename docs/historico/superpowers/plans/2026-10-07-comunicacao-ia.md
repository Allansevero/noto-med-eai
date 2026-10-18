# Comunicação Noto por IA

Objetivo autorizado: substituir mensagens fixas da conversa e avisos por geração
com o guia v2 enviado pelo usuário. Treino permanece literal; autenticação/OTP e
entrega documental continuam contratos técnicos, fora da conversa do agente.

1. Definir porta `ComunicadorNoto.enviar(EntradaComunicacaoNoto)` e gerador de
   mensagens sem ações. Implementar Groq com guia integral, contexto e histórico,
   JSON validado de até três balões, sem fallback de frase pronta. Testar envio
   real do prompt no request simulado, saída inválida e indisponibilidade.
2. Persistir `noto_comunicacoes` com reserva por médico/chave, histórico e resultados.
   Consultar destinatário e caso somente do médico correto. Gerar fora de locks,
   reservar antes de enviar, separar erro de geração de transporte incerto.
   Testar isolamento, dedupe, histórico e falha parcial; confirmar em PostgreSQL local.
3. Integrar coleta e confirmação existentes, conversas do médico no Noto Oficial,
   data/CPF/limite e avisos de rejeição. Produção usa o comunicador; os testes injetam
   fronteira IA. Manter validador, confirmação explícita recente, fila retida e RQE
   opcional. Remover catálogo fixo de mensagens, preservando somente parser seguro.
4. Copiar guia v2 integral e incluí-lo na imagem Docker. Aplicar migração pelo
   script existente. Verificar suite e TypeScript na release isolada, revisão
   independente e publicação CAS no main, sem Steel inacabado ou chamadas reais.

Riscos a provar: sem IA não enviar frase fixa; paciente/valor reais; não inventar
emissão ou encaminhamento à equipe; nenhum SQL/ação vindo do LLM; nenhuma liberação
indevida; recebimento de conversa geral não vira cadastro de paciente do médico;
nenhum retry após envio parcial/incerto. Informar implantação e testes reais não
verificados quando produção estiver inacessível.
