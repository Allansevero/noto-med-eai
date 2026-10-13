/**
 * Lógica pura para cálculo do próximo horário de disparo do fechamento fiscal.
 * Suporta múltiplos horários configuráveis (ex: 12:00 e 18:00) no fuso de Brasília.
 * Não realiza I/O nem chamadas de sistema, garantindo testes diretos e determinísticos.
 */

export interface HorarioDisparo {
  horas: number;
  minutos: number;
}

export function parsearHorariosConfigurados(horariosTexto: string): HorarioDisparo[] {
  if (!horariosTexto || !horariosTexto.trim()) {
    return [{ horas: 18, minutos: 0 }]; // Padrão: 18:00 (fechamento comercial)
  }

  const partes = horariosTexto.split(/[,;\s]+/);
  const horarios: HorarioDisparo[] = [];

  for (const parte of partes) {
    const match = parte.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const horas = parseInt(match[1], 10);
      const minutos = parseInt(match[2], 10);
      if (horas >= 0 && horas < 24 && minutos >= 0 && minutos < 60) {
        horarios.push({ horas, minutos });
      }
    }
  }

  return horarios.length > 0 ? horarios : [{ horas: 18, minutos: 0 }];
}

export function calcularProximoDisparoMs(
  horarios: HorarioDisparo[],
  agora: Date = new Date(),
  fusoHorario: string = 'America/Sao_Paulo'
): { proximoHorario: Date; msRestantes: number } {
  // Converter instante atual para os componentes do fuso horário de Brasília
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: fusoHorario,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });

  const partes = formatter.formatToParts(agora);
  const getPart = (type: string) => parseInt(partes.find(p => p.type === type)?.value || '0', 10);

  const anoAtual = getPart('year');
  const mesAtual = getPart('month') - 1; // 0-indexed
  const diaAtual = getPart('day');
  const horaAtual = getPart('hour');
  const minutoAtual = getPart('minute');
  const segundoAtual = getPart('second');

  const minutosAgora = horaAtual * 60 + minutoAtual;

  // Ordenar horários do dia
  const ordenados = [...horarios].sort((a, b) => a.horas * 60 + a.minutos - (b.horas * 60 + b.minutos));

  // Procurar o primeiro horário de hoje que ainda não passou
  let horarioAlvo = ordenados.find(h => h.horas * 60 + h.minutos > minutosAgora);
  let diasAdicionais = 0;

  if (!horarioAlvo) {
    // Todos os horários de hoje já passaram, o próximo é o primeiro horário de amanhã
    horarioAlvo = ordenados[0];
    diasAdicionais = 1;
  }

  // Criar data alvo aproximada no fuso local e calcular a diferença real em ms
  // Como agora temos as diferenças em minutos e segundos:
  const diferencaMinutos = diasAdicionais * 24 * 60 + (horarioAlvo.horas * 60 + horarioAlvo.minutos) - minutosAgora;
  const msAteAlvo = diferencaMinutos * 60 * 1000 - segundoAtual * 1000;
  const msFinal = Math.max(1000, msAteAlvo);

  const proximoHorario = new Date(agora.getTime() + msFinal);

  return {
    proximoHorario,
    msRestantes: msFinal
  };
}
