import { validarCpf } from '../paciente/validar-cpf.js';
import { extrairTelefoneJid } from '../whatsapp/extrair-telefone-jid.js';
import { extrairTextoMensagem, type DadosMensagemEvolution } from '../whatsapp/payload-webhook-schema.js';
interface Origem { mensagemId: string; conversaId: string; enviadaPeloUsuario: boolean; em: string | null }
interface Dado { valor: string; origens: Origem[]; ocorrencias: number }
interface Contato { conversaIds: string[]; whatsapp: string | null; cpfs: Dado[]; emails: Dado[]; mensagensAnalisadas: number; associacaoPendente: true }
/** Coleta evidências textuais; não vincula identidades, não consulta CPF e não grava pacientes. */
export class ColetorWhatsapp {
  private vistos = new Set<string>();
  private contatos = new Map<string, Contato>();
  private analisadas = 0; private repetidas = 0; private ignoradas = 0; private invalidos = 0; private textosLimitados = 0;
  adicionar(m: DadosMensagemEvolution) {
    const jid = m.key.remoteJid;
    if (jid.endsWith('@g.us') || jid.includes('@broadcast')) { this.ignoradas++; return; }
    const telefone = (v?: string | null) => v && /@(s\.whatsapp\.net|c\.us)$/.test(v) ? extrairTelefoneJid(v) : null;
    const whatsapp = telefone(m.key.remoteJidAlt) || telefone(jid);
    const chave = whatsapp || jid, id = `${chave}:${m.key.id}`;
    if (this.vistos.has(id)) { this.repetidas++; return; }
    this.vistos.add(id); this.analisadas++;
    let contato = this.contatos.get(chave);
    if (!contato) { contato = { conversaIds: [], whatsapp, cpfs: [], emails: [], mensagensAnalisadas: 0, associacaoPendente: true }; this.contatos.set(chave, contato); }
    if (!contato.conversaIds.includes(jid)) contato.conversaIds.push(jid);
    contato.mensagensAnalisadas++;
    const original = extrairTextoMensagem(m) || '';
    if (original.length > 10000) this.textosLimitados++;
    const texto = original.slice(0, 10000);
    const ts = Number(m.messageTimestamp), data = new Date(ts > 1e12 ? ts : ts * 1000);
    const origem: Origem = { mensagemId: m.key.id, conversaId: jid, enviadaPeloUsuario: m.key.fromMe,
      em: m.messageTimestamp != null && Number.isFinite(data.getTime()) ? data.toISOString() : null };
    const cpfs = new Set([...texto.matchAll(/\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})\b/g)].map(m => m[0].replace(/\D/g, '')));
    for (const cpf of cpfs) { if (validarCpf(cpf)) this.inserir(contato.cpfs, cpf, origem); else this.invalidos++; }
    const emails = new Set([...texto.matchAll(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi)].map(m => m[0].toLowerCase()));
    for (const email of emails) if (email.length <= 254 && email.split('@')[0].length <= 64 && !email.startsWith('.') && !email.includes('..')) this.inserir(contato.emails, email, origem);
  }
  private inserir(lista: Dado[], valor: string, origem: Origem) {
    let dado = lista.find(d => d.valor === valor);
    if (!dado) { dado = { valor, origens: [], ocorrencias: 0 }; lista.push(dado); }
    dado.ocorrencias++;
    // Evita resposta ilimitada; a contagem informa quando as evidências foram limitadas.
    if (dado.origens.length < 20) dado.origens.push(origem);
  }
  resultado() { return { mensagensAnalisadas: this.analisadas, mensagensRepetidas: this.repetidas,
    mensagensIgnoradas: this.ignoradas, cpfsInvalidos: this.invalidos, textosLimitados: this.textosLimitados,
    limiteOrigensPorDado: 20, contatos: [...this.contatos.values()] }; }
}
