/** A IA escreve mensagens. Esta porta não concede ações fiscais ou SQL. */
export type EventoComunicacaoNoto = 'pedir_nome' | 'pedir_crm' | 'pedir_confirmacao' | 'orientar_confirmacao'
  | 'dados_salvos' | 'retomada_autorizada' | 'pedir_data' | 'data_salva' | 'limite_emissao'
  | 'falha_emissao' | 'conversa' | 'pedir_cpf';
export interface EntradaComunicacaoNoto {
  medicoId:string;
  chave:string;
  evento:EventoComunicacaoNoto;
  solicitacaoId?:string;
  mensagemRecebida?:string;
  dados?:Record<string,unknown>;
  pacienteId?:string;
  instanciaPaciente?:string;
}
export interface ResultadoComunicacaoNoto {sucesso:boolean;envioIniciado:boolean;}
export interface ComunicadorNoto {enviar(entrada:EntradaComunicacaoNoto):Promise<ResultadoComunicacaoNoto>;}
export interface ContextoMensagemNoto {
  evento:EventoComunicacaoNoto;
  destinatario:'medico'|'paciente';
  medico:{nome:string|null;crm:string|null;rqe:string|null};
  caso:{solicitacaoId:string;nomePaciente:string|null;telefonePaciente:string|null;valorCentavos:number;datas:string|null;status:string;aguardandoDadosProfissionais:boolean;aguardandoConfirmacao:boolean}|null;
  quantidadeNotasParadas:number;
  mensagemRecebida:string|null;
  dados:Record<string,unknown>;
  historico:Array<{papel:'medico'|'noto';texto:string}>;
}
export interface GeradorMensagemNoto {gerar(contexto:ContextoMensagemNoto):Promise<string[]>;}
