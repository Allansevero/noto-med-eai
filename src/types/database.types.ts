export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agenda_slots: {
        Row: {
          agendamento_id: string | null
          criado_em: string
          data: string
          disponivel: boolean
          hora_fim: string
          hora_inicio: string
          id: string
          medico_id: string
        }
        Insert: {
          agendamento_id?: string | null
          criado_em?: string
          data: string
          disponivel?: boolean
          hora_fim: string
          hora_inicio: string
          id?: string
          medico_id: string
        }
        Update: {
          agendamento_id?: string | null
          criado_em?: string
          data?: string
          disponivel?: boolean
          hora_fim?: string
          hora_inicio?: string
          id?: string
          medico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_slots_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_slots_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamentos: {
        Row: {
          atualizado_em: string
          conversa_id: string | null
          criado_em: string
          data_hora: string
          id: string
          medico_id: string
          origem: string
          paciente_id: string
          servico_fiscal_id: string | null
          status: Database["public"]["Enums"]["status_agendamento"]
          valor_consulta_centavos: number | null
        }
        Insert: {
          atualizado_em?: string
          conversa_id?: string | null
          criado_em?: string
          data_hora: string
          id?: string
          medico_id: string
          origem?: string
          paciente_id: string
          servico_fiscal_id?: string | null
          status?: Database["public"]["Enums"]["status_agendamento"]
          valor_consulta_centavos?: number | null
        }
        Update: {
          atualizado_em?: string
          conversa_id?: string | null
          criado_em?: string
          data_hora?: string
          id?: string
          medico_id?: string
          origem?: string
          paciente_id?: string
          servico_fiscal_id?: string | null
          status?: Database["public"]["Enums"]["status_agendamento"]
          valor_consulta_centavos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_servico_fiscal_id_fkey"
            columns: ["servico_fiscal_id"]
            isOneToOne: false
            referencedRelation: "medico_servicos_fiscais"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas: {
        Row: {
          atualizado_em: string
          cancelada_em: string | null
          ciclo: Database["public"]["Enums"]["ciclo_cobranca"]
          conta_id: string
          criado_em: string
          data_fim_trial: string | null
          data_inicio: string
          data_proxima_cobranca: string | null
          id: string
          plano_id: string
          status: Database["public"]["Enums"]["status_assinatura"]
          trava_emissao: boolean
        }
        Insert: {
          atualizado_em?: string
          cancelada_em?: string | null
          ciclo?: Database["public"]["Enums"]["ciclo_cobranca"]
          conta_id: string
          criado_em?: string
          data_fim_trial?: string | null
          data_inicio?: string
          data_proxima_cobranca?: string | null
          id?: string
          plano_id: string
          status?: Database["public"]["Enums"]["status_assinatura"]
          trava_emissao?: boolean
        }
        Update: {
          atualizado_em?: string
          cancelada_em?: string | null
          ciclo?: Database["public"]["Enums"]["ciclo_cobranca"]
          conta_id?: string
          criado_em?: string
          data_fim_trial?: string | null
          data_inicio?: string
          data_proxima_cobranca?: string | null
          id?: string
          plano_id?: string
          status?: Database["public"]["Enums"]["status_assinatura"]
          trava_emissao?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: true
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          acao: string
          conta_id: string | null
          criado_em: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          entidade: string
          entidade_id: string | null
          id: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          conta_id?: string | null
          criado_em?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          conta_id?: string | null
          criado_em?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      consentimentos: {
        Row: {
          aceito_em: string
          id: string
          ip_origem: unknown
          tipo: Database["public"]["Enums"]["tipo_consentimento"]
          usuario_id: string
          versao_documento: string
        }
        Insert: {
          aceito_em?: string
          id?: string
          ip_origem?: unknown
          tipo: Database["public"]["Enums"]["tipo_consentimento"]
          usuario_id: string
          versao_documento: string
        }
        Update: {
          aceito_em?: string
          id?: string
          ip_origem?: unknown
          tipo?: Database["public"]["Enums"]["tipo_consentimento"]
          usuario_id?: string
          versao_documento?: string
        }
        Relationships: [
          {
            foreignKeyName: "consentimentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      contador_medico: {
        Row: {
          contador_id: string
          medico_id: string
        }
        Insert: {
          contador_id: string
          medico_id: string
        }
        Update: {
          contador_id?: string
          medico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contador_medico_contador_id_fkey"
            columns: ["contador_id"]
            isOneToOne: false
            referencedRelation: "contadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contador_medico_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      contadores: {
        Row: {
          conta_id: string
          criado_em: string
          id: string
          usuario_id: string
        }
        Insert: {
          conta_id: string
          criado_em?: string
          id?: string
          usuario_id: string
        }
        Update: {
          conta_id?: string
          criado_em?: string
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contadores_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contadores_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      contas: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["tipo_conta"]
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome: string
          tipo?: Database["public"]["Enums"]["tipo_conta"]
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["tipo_conta"]
        }
        Relationships: []
      }
      faturas_assinatura: {
        Row: {
          assinatura_id: string
          criado_em: string
          gateway_referencia: string | null
          id: string
          metodo_pagamento: string | null
          pago_em: string | null
          status: Database["public"]["Enums"]["status_fatura_assinatura"]
          valor_centavos: number
          vencimento: string
        }
        Insert: {
          assinatura_id: string
          criado_em?: string
          gateway_referencia?: string | null
          id?: string
          metodo_pagamento?: string | null
          pago_em?: string | null
          status?: Database["public"]["Enums"]["status_fatura_assinatura"]
          valor_centavos: number
          vencimento: string
        }
        Update: {
          assinatura_id?: string
          criado_em?: string
          gateway_referencia?: string | null
          id?: string
          metodo_pagamento?: string | null
          pago_em?: string | null
          status?: Database["public"]["Enums"]["status_fatura_assinatura"]
          valor_centavos?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "faturas_assinatura_assinatura_id_fkey"
            columns: ["assinatura_id"]
            isOneToOne: false
            referencedRelation: "assinaturas"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_certificados: {
        Row: {
          alias: string | null
          arquivo_storage_path: string
          atualizado_em: string
          criado_em: string
          erro_validacao: string | null
          id: string
          medico_id: string
          senha_secret_id: string
          status: Database["public"]["Enums"]["status_certificado"]
          valido_ate: string
          valido_de: string | null
        }
        Insert: {
          alias?: string | null
          arquivo_storage_path: string
          atualizado_em?: string
          criado_em?: string
          erro_validacao?: string | null
          id?: string
          medico_id: string
          senha_secret_id: string
          status?: Database["public"]["Enums"]["status_certificado"]
          valido_ate: string
          valido_de?: string | null
        }
        Update: {
          alias?: string | null
          arquivo_storage_path?: string
          atualizado_em?: string
          criado_em?: string
          erro_validacao?: string | null
          id?: string
          medico_id?: string
          senha_secret_id?: string
          status?: Database["public"]["Enums"]["status_certificado"]
          valido_ate?: string
          valido_de?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_certificados_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_perfil_fiscal: {
        Row: {
          ambiente: Database["public"]["Enums"]["ambiente_emissao"]
          atualizado_em: string
          cclass_trib_padrao: string | null
          cind_op_padrao: string | null
          cnae: string | null
          cod_municipio_ibge: string
          confirmado_pelo_medico: boolean
          cpf_cnpj_encriptado: string
          cpf_cnpj_hash: string
          criado_em: string
          dados_reforma_tributaria: Json
          extraido_automaticamente: boolean
          inscricao_municipal: string
          medico_id: string
          nome_fantasia: string | null
          opcao_simples_nacional: Database["public"]["Enums"]["opcao_simples_nacional"]
          percentual_tot_trib_sn: number
          proximo_numero_dps: number | null
          razao_social: string | null
          regime_apuracao_sn:
            | Database["public"]["Enums"]["regime_apuracao_sn"]
            | null
          regime_especial_tributacao: number
          serie_dps: string
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"]
          uf: string
          xml_nota_referencia_url: string | null
        }
        Insert: {
          ambiente?: Database["public"]["Enums"]["ambiente_emissao"]
          atualizado_em?: string
          cclass_trib_padrao?: string | null
          cind_op_padrao?: string | null
          cnae?: string | null
          cod_municipio_ibge: string
          confirmado_pelo_medico?: boolean
          cpf_cnpj_encriptado: string
          cpf_cnpj_hash: string
          criado_em?: string
          dados_reforma_tributaria?: Json
          extraido_automaticamente?: boolean
          inscricao_municipal: string
          medico_id: string
          nome_fantasia?: string | null
          opcao_simples_nacional?: Database["public"]["Enums"]["opcao_simples_nacional"]
          percentual_tot_trib_sn?: number
          proximo_numero_dps?: number | null
          razao_social?: string | null
          regime_apuracao_sn?:
            | Database["public"]["Enums"]["regime_apuracao_sn"]
            | null
          regime_especial_tributacao?: number
          serie_dps?: string
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          uf: string
          xml_nota_referencia_url?: string | null
        }
        Update: {
          ambiente?: Database["public"]["Enums"]["ambiente_emissao"]
          atualizado_em?: string
          cclass_trib_padrao?: string | null
          cind_op_padrao?: string | null
          cnae?: string | null
          cod_municipio_ibge?: string
          confirmado_pelo_medico?: boolean
          cpf_cnpj_encriptado?: string
          cpf_cnpj_hash?: string
          criado_em?: string
          dados_reforma_tributaria?: Json
          extraido_automaticamente?: boolean
          inscricao_municipal?: string
          medico_id?: string
          nome_fantasia?: string | null
          opcao_simples_nacional?: Database["public"]["Enums"]["opcao_simples_nacional"]
          percentual_tot_trib_sn?: number
          proximo_numero_dps?: number | null
          razao_social?: string | null
          regime_apuracao_sn?:
            | Database["public"]["Enums"]["regime_apuracao_sn"]
            | null
          regime_especial_tributacao?: number
          serie_dps?: string
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          uf?: string
          xml_nota_referencia_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_perfil_fiscal_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: true
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_respostas_rapidas: {
        Row: {
          id: string
          medico_id: string
          texto_modelo: string
          tipo: string
        }
        Insert: {
          id?: string
          medico_id: string
          texto_modelo: string
          tipo: string
        }
        Update: {
          id?: string
          medico_id?: string
          texto_modelo?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "medico_respostas_rapidas_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_servicos_fiscais: {
        Row: {
          aliquota_iss: number | null
          ativo: boolean
          cnbs: string | null
          ctrib_mun: string | null
          ctrib_nac: string
          id: string
          medico_id: string
          nome_servico: string
          padrao: boolean
          valor_padrao_centavos: number | null
          xdesc_serv: string
        }
        Insert: {
          aliquota_iss?: number | null
          ativo?: boolean
          cnbs?: string | null
          ctrib_mun?: string | null
          ctrib_nac: string
          id?: string
          medico_id: string
          nome_servico: string
          padrao?: boolean
          valor_padrao_centavos?: number | null
          xdesc_serv: string
        }
        Update: {
          aliquota_iss?: number | null
          ativo?: boolean
          cnbs?: string | null
          ctrib_mun?: string | null
          ctrib_nac?: string
          id?: string
          medico_id?: string
          nome_servico?: string
          padrao?: boolean
          valor_padrao_centavos?: number | null
          xdesc_serv?: string
        }
        Relationships: [
          {
            foreignKeyName: "medico_servicos_fiscais_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medicos: {
        Row: {
          conta_id: string
          criado_em: string
          crm: string | null
          especialidade: string | null
          id: string
          nome_completo: string
          rqe: string | null
          usuario_id: string
        }
        Insert: {
          conta_id: string
          criado_em?: string
          crm?: string | null
          especialidade?: string | null
          id?: string
          nome_completo: string
          rqe?: string | null
          usuario_id: string
        }
        Update: {
          conta_id?: string
          criado_em?: string
          crm?: string | null
          especialidade?: string | null
          id?: string
          nome_completo?: string
          rqe?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais: {
        Row: {
          cancelada_em: string | null
          chave_acesso: string
          competencia: string
          criado_em: string
          data_emissao: string
          enviada_por_email_em: string | null
          id: string
          medico_id: string
          motivo_cancelamento: string | null
          ndps: number
          pdf_storage_path: string | null
          resposta_sefin_raw: Json | null
          serie: string
          solicitacao_id: string
          status: Database["public"]["Enums"]["status_nota_fiscal"]
          valor_cbs_centavos: number | null
          valor_ibs_centavos: number | null
          valor_iss_centavos: number | null
          valor_servicos_centavos: number
          xml_storage_path: string | null
        }
        Insert: {
          cancelada_em?: string | null
          chave_acesso: string
          competencia: string
          criado_em?: string
          data_emissao: string
          enviada_por_email_em?: string | null
          id?: string
          medico_id: string
          motivo_cancelamento?: string | null
          ndps: number
          pdf_storage_path?: string | null
          resposta_sefin_raw?: Json | null
          serie?: string
          solicitacao_id: string
          status?: Database["public"]["Enums"]["status_nota_fiscal"]
          valor_cbs_centavos?: number | null
          valor_ibs_centavos?: number | null
          valor_iss_centavos?: number | null
          valor_servicos_centavos: number
          xml_storage_path?: string | null
        }
        Update: {
          cancelada_em?: string | null
          chave_acesso?: string
          competencia?: string
          criado_em?: string
          data_emissao?: string
          enviada_por_email_em?: string | null
          id?: string
          medico_id?: string
          motivo_cancelamento?: string | null
          ndps?: number
          pdf_storage_path?: string | null
          resposta_sefin_raw?: Json | null
          serie?: string
          solicitacao_id?: string
          status?: Database["public"]["Enums"]["status_nota_fiscal"]
          valor_cbs_centavos?: number | null
          valor_ibs_centavos?: number | null
          valor_iss_centavos?: number | null
          valor_servicos_centavos?: number
          xml_storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_nota"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_verificacoes: {
        Row: {
          codigo_hash: string
          criado_em: string
          expira_em: string
          id: string
          telefone: string
          tentativas: number
          verificado_em: string | null
        }
        Insert: {
          codigo_hash: string
          criado_em?: string
          expira_em: string
          id?: string
          telefone: string
          tentativas?: number
          verificado_em?: string | null
        }
        Update: {
          codigo_hash?: string
          criado_em?: string
          expira_em?: string
          id?: string
          telefone?: string
          tentativas?: number
          verificado_em?: string | null
        }
        Relationships: []
      }
      pacientes: {
        Row: {
          atualizado_em: string
          bairro: string | null
          cep: string | null
          cod_municipio_ibge: string | null
          complemento: string | null
          cpf_cnpj_encriptado: string | null
          cpf_cnpj_hash: string | null
          criado_em: string
          data_nascimento: string | null
          email: string | null
          id: string
          logradouro: string | null
          medico_id: string
          nome: string | null
          numero: string | null
          origem_cadastro: string
          telefone: string
        }
        Insert: {
          atualizado_em?: string
          bairro?: string | null
          cep?: string | null
          cod_municipio_ibge?: string | null
          complemento?: string | null
          cpf_cnpj_encriptado?: string | null
          cpf_cnpj_hash?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          medico_id: string
          nome?: string | null
          numero?: string | null
          origem_cadastro?: string
          telefone: string
        }
        Update: {
          atualizado_em?: string
          bairro?: string | null
          cep?: string | null
          cod_municipio_ibge?: string | null
          complemento?: string | null
          cpf_cnpj_encriptado?: string | null
          cpf_cnpj_hash?: string | null
          criado_em?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          medico_id?: string
          nome?: string | null
          numero?: string | null
          origem_cadastro?: string
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos: {
        Row: {
          agendamento_id: string | null
          comprovante_storage_path: string | null
          confirmado_em: string | null
          criado_em: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"]
          id: string
          medico_id: string
          open_finance_transacao_id: string | null
          paciente_id: string
          status: Database["public"]["Enums"]["status_pagamento"]
          valor_centavos: number
        }
        Insert: {
          agendamento_id?: string | null
          comprovante_storage_path?: string | null
          confirmado_em?: string | null
          criado_em?: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"]
          id?: string
          medico_id: string
          open_finance_transacao_id?: string | null
          paciente_id: string
          status?: Database["public"]["Enums"]["status_pagamento"]
          valor_centavos: number
        }
        Update: {
          agendamento_id?: string | null
          comprovante_storage_path?: string | null
          confirmado_em?: string | null
          criado_em?: string
          forma_pagamento?: Database["public"]["Enums"]["forma_pagamento"]
          id?: string
          medico_id?: string
          open_finance_transacao_id?: string | null
          paciente_id?: string
          status?: Database["public"]["Enums"]["status_pagamento"]
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ativo: boolean
          criado_em: string
          descricao: string | null
          id: string
          limite_conexoes_whatsapp: number
          limite_medicos: number
          limite_notas_mes: number | null
          nome: string
          preco_anual_centavos: number | null
          preco_mensal_centavos: number
          recursos: Json
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          id?: string
          limite_conexoes_whatsapp?: number
          limite_medicos?: number
          limite_notas_mes?: number | null
          nome: string
          preco_anual_centavos?: number | null
          preco_mensal_centavos: number
          recursos?: Json
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          id?: string
          limite_conexoes_whatsapp?: number
          limite_medicos?: number
          limite_notas_mes?: number | null
          nome?: string
          preco_anual_centavos?: number | null
          preco_mensal_centavos?: number
          recursos?: Json
        }
        Relationships: []
      }
      secretaria_medico: {
        Row: {
          medico_id: string
          secretaria_id: string
        }
        Insert: {
          medico_id: string
          secretaria_id: string
        }
        Update: {
          medico_id?: string
          secretaria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "secretaria_medico_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "secretaria_medico_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "secretarias"
            referencedColumns: ["id"]
          },
        ]
      }
      secretarias: {
        Row: {
          conta_id: string
          criado_em: string
          id: string
          usuario_id: string
        }
        Insert: {
          conta_id: string
          criado_em?: string
          id?: string
          usuario_id: string
        }
        Update: {
          conta_id?: string
          criado_em?: string
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "secretarias_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "secretarias_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacao_nota_agendamentos: {
        Row: {
          agendamento_id: string
          solicitacao_id: string
        }
        Insert: {
          agendamento_id: string
          solicitacao_id: string
        }
        Update: {
          agendamento_id?: string
          solicitacao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacao_nota_agendamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacao_nota_agendamentos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_nota"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_nota: {
        Row: {
          atualizado_em: string
          bloqueada_em: string | null
          bloqueada_por_worker: string | null
          cclass_trib: string | null
          cind_op: string | null
          cnbs: string | null
          criado_em: string
          ctrib_nac: string
          erro: string | null
          fila: Database["public"]["Enums"]["fila_solicitacao_nota"] | null
          id: string
          medico_id: string
          origem: string
          paciente_id: string
          pagamento_id: string | null
          proxima_tentativa_em: string | null
          servico_fiscal_id: string | null
          status: Database["public"]["Enums"]["status_solicitacao_nota"]
          tentativas: number
          valor_servico_centavos: number
          xdesc_serv: string
        }
        Insert: {
          atualizado_em?: string
          bloqueada_em?: string | null
          bloqueada_por_worker?: string | null
          cclass_trib?: string | null
          cind_op?: string | null
          cnbs?: string | null
          criado_em?: string
          ctrib_nac: string
          erro?: string | null
          fila?: Database["public"]["Enums"]["fila_solicitacao_nota"] | null
          id?: string
          medico_id: string
          origem?: string
          paciente_id: string
          pagamento_id?: string | null
          proxima_tentativa_em?: string | null
          servico_fiscal_id?: string | null
          status?: Database["public"]["Enums"]["status_solicitacao_nota"]
          tentativas?: number
          valor_servico_centavos: number
          xdesc_serv: string
        }
        Update: {
          atualizado_em?: string
          bloqueada_em?: string | null
          bloqueada_por_worker?: string | null
          cclass_trib?: string | null
          cind_op?: string | null
          cnbs?: string | null
          criado_em?: string
          ctrib_nac?: string
          erro?: string | null
          fila?: Database["public"]["Enums"]["fila_solicitacao_nota"] | null
          id?: string
          medico_id?: string
          origem?: string
          paciente_id?: string
          pagamento_id?: string | null
          proxima_tentativa_em?: string | null
          servico_fiscal_id?: string | null
          status?: Database["public"]["Enums"]["status_solicitacao_nota"]
          tentativas?: number
          valor_servico_centavos?: number
          xdesc_serv?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_nota_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_nota_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_nota_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_nota_servico_fiscal_id_fkey"
            columns: ["servico_fiscal_id"]
            isOneToOne: false
            referencedRelation: "medico_servicos_fiscais"
            referencedColumns: ["id"]
          },
        ]
      }
      uso_mensal_medico: {
        Row: {
          competencia: string
          medico_id: string
          notas_emitidas: number
        }
        Insert: {
          competencia: string
          medico_id: string
          notas_emitidas?: number
        }
        Update: {
          competencia?: string
          medico_id?: string
          notas_emitidas?: number
        }
        Relationships: [
          {
            foreignKeyName: "uso_mensal_medico_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          ativo: boolean
          atualizado_em: string
          auth_user_id: string
          conta_id: string
          criado_em: string
          email: string
          id: string
          nome: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          telefone: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          auth_user_id: string
          conta_id: string
          criado_em?: string
          email: string
          id?: string
          nome: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          telefone: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          auth_user_id?: string
          conta_id?: string
          criado_em?: string
          email?: string
          id?: string
          nome?: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversas: {
        Row: {
          aguardando_cpf_desde: string | null
          contato_nome: string | null
          contato_telefone: string
          criado_em: string
          id: string
          instancia_id: string
          medico_id: string
          paciente_id: string | null
          ultima_mensagem_em: string | null
        }
        Insert: {
          aguardando_cpf_desde?: string | null
          contato_nome?: string | null
          contato_telefone: string
          criado_em?: string
          id?: string
          instancia_id: string
          medico_id: string
          paciente_id?: string | null
          ultima_mensagem_em?: string | null
        }
        Update: {
          aguardando_cpf_desde?: string | null
          contato_nome?: string | null
          contato_telefone?: string
          criado_em?: string
          id?: string
          instancia_id?: string
          medico_id?: string
          paciente_id?: string | null
          ultima_mensagem_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_whatsapp_conversas_paciente"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversas_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversas_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instancias: {
        Row: {
          conectado_em: string | null
          conta_id: string | null
          criado_em: string
          id: string
          medico_id: string | null
          nome_instancia: string
          numero_telefone: string | null
          oficial: boolean
          status: Database["public"]["Enums"]["status_conexao_whatsapp"]
          webhook_configurado: boolean
        }
        Insert: {
          conectado_em?: string | null
          conta_id?: string | null
          criado_em?: string
          id?: string
          medico_id?: string | null
          nome_instancia: string
          numero_telefone?: string | null
          oficial?: boolean
          status?: Database["public"]["Enums"]["status_conexao_whatsapp"]
          webhook_configurado?: boolean
        }
        Update: {
          conectado_em?: string | null
          conta_id?: string | null
          criado_em?: string
          id?: string
          medico_id?: string | null
          nome_instancia?: string
          numero_telefone?: string | null
          oficial?: boolean
          status?: Database["public"]["Enums"]["status_conexao_whatsapp"]
          webhook_configurado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instancias_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instancias_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_mensagens: {
        Row: {
          comando_detectado: string | null
          conteudo: string | null
          conversa_id: string
          criado_em: string
          direcao: string
          id: string
          payload_bruto: Json | null
          processada: boolean
          tipo_mensagem: string
        }
        Insert: {
          comando_detectado?: string | null
          conteudo?: string | null
          conversa_id: string
          criado_em?: string
          direcao: string
          id?: string
          payload_bruto?: Json | null
          processada?: boolean
          tipo_mensagem?: string
        }
        Update: {
          comando_detectado?: string | null
          conteudo?: string | null
          conversa_id?: string
          criado_em?: string
          direcao?: string
          id?: string
          payload_bruto?: Json | null
          processada?: boolean
          tipo_mensagem?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      medicos_visiveis_para: {
        Args: { p_auth_user_id: string }
        Returns: string[]
      }
    }
    Enums: {
      ambiente_emissao: "producao" | "homologacao"
      ciclo_cobranca: "mensal" | "anual"
      fila_solicitacao_nota:
        | "pronta"
        | "pendente_cadastro"
        | "aguardando_garantia"
        | "excecao"
        | "pronta_sem_endereco"
      forma_pagamento:
        | "open_finance"
        | "pix_manual"
        | "comprovante_manual"
        | "dinheiro"
        | "outro"
      opcao_simples_nacional: "nao_optante" | "mei" | "me_epp"
      papel_usuario: "medico" | "secretaria" | "contador" | "admin"
      regime_apuracao_sn: "regime_1" | "regime_2" | "regime_3"
      status_agendamento:
        | "agendado"
        | "confirmado"
        | "realizado"
        | "cancelado"
        | "faltou"
      status_assinatura:
        | "trial"
        | "ativa"
        | "inadimplente"
        | "suspensa"
        | "cancelada"
      status_certificado: "pendente" | "ativo" | "vencido" | "revogado" | "erro"
      status_conexao_whatsapp:
        | "pendente"
        | "conectado"
        | "desconectado"
        | "erro"
      status_fatura_assinatura: "pendente" | "paga" | "atrasada" | "cancelada"
      status_nota_fiscal: "autorizada" | "cancelada" | "erro" | "substituida"
      status_pagamento: "pendente" | "confirmado" | "estornado"
      status_solicitacao_nota:
        | "pendente"
        | "pronta"
        | "simulada"
        | "emitida"
        | "erro"
        | "excecao"
        | "aguardando_garantia"
        | "pendente_cadastro"
        | "pronta_sem_endereco"
      tipo_consentimento:
        | "termos_uso"
        | "politica_privacidade"
        | "consentimento_dados_sensiveis"
      tipo_conta: "individual" | "clinica"
      tipo_pessoa: "PF" | "PJ"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ambiente_emissao: ["producao", "homologacao"],
      ciclo_cobranca: ["mensal", "anual"],
      fila_solicitacao_nota: [
        "pronta",
        "pendente_cadastro",
        "aguardando_garantia",
        "excecao",
        "pronta_sem_endereco",
      ],
      forma_pagamento: [
        "open_finance",
        "pix_manual",
        "comprovante_manual",
        "dinheiro",
        "outro",
      ],
      opcao_simples_nacional: ["nao_optante", "mei", "me_epp"],
      papel_usuario: ["medico", "secretaria", "contador", "admin"],
      regime_apuracao_sn: ["regime_1", "regime_2", "regime_3"],
      status_agendamento: [
        "agendado",
        "confirmado",
        "realizado",
        "cancelado",
        "faltou",
      ],
      status_assinatura: [
        "trial",
        "ativa",
        "inadimplente",
        "suspensa",
        "cancelada",
      ],
      status_certificado: ["pendente", "ativo", "vencido", "revogado", "erro"],
      status_conexao_whatsapp: [
        "pendente",
        "conectado",
        "desconectado",
        "erro",
      ],
      status_fatura_assinatura: ["pendente", "paga", "atrasada", "cancelada"],
      status_nota_fiscal: ["autorizada", "cancelada", "erro", "substituida"],
      status_pagamento: ["pendente", "confirmado", "estornado"],
      status_solicitacao_nota: [
        "pendente",
        "pronta",
        "simulada",
        "emitida",
        "erro",
        "excecao",
        "aguardando_garantia",
        "pendente_cadastro",
        "pronta_sem_endereco",
      ],
      tipo_consentimento: [
        "termos_uso",
        "politica_privacidade",
        "consentimento_dados_sensiveis",
      ],
      tipo_conta: ["individual", "clinica"],
      tipo_pessoa: ["PF", "PJ"],
    },
  },
} as const
