# Cadastro automático a partir do certificado A1

## Objetivo e escopo aprovado na conversa

Suspender todo o onboarding conversacional: apresentação, perguntas de nome, CRM, RQE, pacientes, período sem emitir e preferências. Manter o Noto apenas para confirmar resultados cadastrais ambíguos ou solicitar um dado indispensável que as consultas não consigam obter. Preservar autenticação por OTP, integração WhatsApp, importação de pacientes e emissão de notas existentes.

## Arquitetura proposta

O recebimento do A1 continua validando o arquivo e a senha, salvando o certificado e buscando a referência fiscal no ADN. A consulta cadastral é um trabalho persistente separado, agendado após salvar o certificado. Não deve aumentar a espera da resposta de upload, condicionar o sucesso fiscal ou modificar parâmetros fiscais provenientes da referência.

O trabalho recebe o identificador do médico e do certificado e o CPF/CNPJ extraído, nunca a chave privada ou a senha. Seu estado registra etapas, origem dos resultados, candidatos, confirmações e erros sanitizados. Uma chave única por certificado evita duplicação em novas tentativas. Antes de aplicar resultados, verifica se o certificado ainda é o atual e se algum dado foi confirmado ou alterado pelo usuário desde o início.

## Consulta da empresa e identificação do médico

Primeiro verificar a documentação pública e o contrato da consulta de CNPJ do Hub do Desenvolvedor: endpoint, autenticação, campos do quadro societário e disponibilidade para a credencial existente. A integração atual do Hub contempla apenas CPF. Não presumir que esse acesso inclui CNPJ nem inventar formatos de resposta.

Validar se a resposta corresponde ao documento solicitado. Razão social e dados da empresa permanecem separados dos dados pessoais do médico. Um nome na razão social ou no quadro societário é candidato, não prova de que aquele indivíduo é o médico responsável. CPF mascarado não será reconstruído.

Se houver uma pessoa candidata, pedir confirmação de que é o médico responsável antes de promover seu nome ao cadastro pessoal. Se houver várias, apresentar uma escolha. Se nenhum candidato estiver disponível, pedir apenas o nome completo necessário à busca. Dados pessoais já confirmados dispensam essa pergunta e não serão sobrescritos.

## Pesquisa profissional

Após identificar o médico, pesquisar nome completo em fonte pública oficial do CFM/CRM, usando UF quando conhecida. A ferramenta existente é apenas um adaptador sem endpoint configurado; portanto, a fonte e seu mecanismo de consulta devem ser verificados antes de habilitar a busca em produção. Não usar um endpoint presumido, resolver desafios de acesso por contorno ou tratar texto gerado pelo modelo como resultado de pesquisa.

Guardar fonte, data e registros candidatos. Um resultado único que corresponda ao nome confirmado e aos critérios de identificação poderá preencher CRM e UF ausentes; homônimos, múltiplos registros ou divergências exigem confirmação. Não presumir UF ou situação profissional. Não adicionar RQE à descrição sem preferência explícita já registrada ou confirmação específica solicitada pelo usuário.

## Confirmação e suspensão das conversas antigas

Desabilitar todos os disparos de apresentação ao conectar WhatsApp, incluindo verificações de status, callbacks e recuperação na inicialização. Não desativar o cliente de WhatsApp nem o envio de OTP pela instância oficial.

O assistente só responde no contexto de uma pendência cadastral aberta. Pergunta uma coisa por vez, reconhece respostas naturais em relação à pergunta pendente e aplica apenas os campos confirmados. Sem pendência, não inicia nem retoma a sequência antiga de cadastro. A mudança não deve capturar conversas destinadas aos fluxos existentes de comprovantes e emissão.

Suspender a recuperação e o envio dos turnos antigos de onboarding, preservando seu histórico. Mensagens já confirmadas não são reenviadas. Pendências novas ficam vinculadas ao trabalho de enriquecimento; não reaproveitar uma pergunta antiga sem contexto.

Pacientes, período de busca e preferências continuam disponíveis pelos fluxos do painel. Não definir retroativamente um período de emissão nem executar uma varredura de notas como consequência do enriquecimento.

## Falhas e dados fiscais

Indisponibilidade do Hub ou da pesquisa registra uma falha técnica e admite novas tentativas limitadas; não dispara imediatamente pedidos repetidos ao usuário. Ao esgotar tentativas, solicitar somente o dado cadastral realmente necessário, respeitando uma pendência única. A importação fiscal mantém seu próprio resultado e não depende dessas consultas.

Não enviar certificado, senha ou XML aos provedores cadastrais. Não registrar tokens, documentos completos ou conteúdo sensível em logs técnicos. As consultas usam credenciais já configuradas no servidor; requisitos novos serão informados por nome para configuração segura.

## Verificação e entrega

Testar isolamento entre sucesso fiscal e falha cadastral, identificação da empresa versus pessoa, candidatos múltiplos, resultados profissionais conflitantes, respostas naturais, preservação de dados confirmados, certificado substituído, idempotência, suspensão dos turnos antigos e ausência de apresentação automática. Executar os testes relevantes, integração com banco local quando houver migração e typecheck.

Validar contratos externos com documentação e consultas controladas, sem enviar dados de pacientes ou mensagens reais para testar. Se a fonte de CRM não permitir consulta automatizada ou o Hub não disponibilizar CNPJ, relatar a limitação antes de habilitar esse recurso; não anunciar o fluxo completo como funcionando.

Entregar alterações revisáveis e migrações compatíveis em `feat/nvidia-only`. A publicação no GitHub não representa deploy no Easypanel. Manter possibilidade de reativar o comportamento anterior por configuração, sem apagar cadastros ou histórico.

## Estado desta proposta

Este documento descreve a mudança para revisão. A suspensão integral do onboarding foi confirmada pelo usuário; contratos externos e implementação ainda não foram validados ou executados.
