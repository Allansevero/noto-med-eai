/**
 * Montagem da descrição do serviço (xdesc_serv) impressa na NFS-e.
 * Segue o padrão legal e sanitizado definido na seção 3.2 do plano,
 * consolidando dados do médico (especialidade, CRM/RQE) e datas das consultas.
 */

export interface DadosDescricaoMedico {
  nomeCompleto: string;
  especialidade?: string | null;
  crm?: string | null;
  rqe?: string | null;
}

export function formatarRegistroProfissional(crm?: string | null, rqe?: string | null): string {
  const crmFormatado = crm ? `CRM ${crm.trim()}` : '';
  const rqeFormatado = rqe ? `RQE ${rqe.trim()}` : '';

  if (crmFormatado && rqeFormatado) return `${crmFormatado} / ${rqeFormatado}`;
  if (crmFormatado) return crmFormatado;
  if (rqeFormatado) return rqeFormatado;
  return '';
}

export function formatarDatasConsultas(datas: Date[]): string {
  if (datas.length === 0) return 'DATA A CONFIRMAR';

  return datas
    .map((d) => {
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const ano = d.getFullYear();
      return `${dia}/${mes}/${ano}`;
    })
    .join(', ');
}

export function montarDescricaoServico(
  medico: DadosDescricaoMedico,
  datasConsultas: Date[]
): string {
  const especialidade = medico.especialidade ? medico.especialidade.trim().toUpperCase() : 'MÉDICA';
  const nome = medico.nomeCompleto.trim().toUpperCase();
  const registro = formatarRegistroProfissional(medico.crm, medico.rqe);
  const vinculo = registro ? ` VINCULADO ${registro}` : '';
  const datas = formatarDatasConsultas(datasConsultas);

  return `REFERENTE A CONSULTAS ${especialidade} COM DR.(A) ${nome}${vinculo} NAS DATAS ${datas}`;
}
