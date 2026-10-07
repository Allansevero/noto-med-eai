import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import forge from 'node-forge';
import { gunzipSync } from 'node:zlib';
import { PostgresEmissorDpsService } from './postgres-emissor-dps-service.js';
import { SefinNacionalClient } from './sefin-nacional-client.js';
import type { SolicitacaoEmissaoItem } from '../../worker/emissor-dps-service.js';

describe('PostgresEmissorDpsService', () => {
  const chaveCriptografia = 'chave-teste-32-chars-long-01234';

  const itemMock: SolicitacaoEmissaoItem = {
    id: 'solic-1',
    medicoId: 'medico-1',
    pacienteId: 'paciente-1',
    valorServicoCentavos: 15000,
    ctribNac: '080201',
    cnbs: '122051900',
    cindOp: '100301',
    cclassTrib: '000001',
    xdescServ: 'CONSULTA MÉDICA DERMATOLOGIA'
  };

  it('deve emitir em modo simulado quando supabaseClient e sefinClient não forem injetados', async () => {
    const fakePool: any = {
      async query(sql: string) {
        if (sql.startsWith('select nome_completo, crm, rqe, especialidade from medicos')) return { rows: [{ nome_completo: 'João da Silva', crm: '12345/SP' }] };
        if (sql.includes('medico_perfil_fiscal')) {
          return {
            rows: [
              {
                nome_completo: 'Dr. João Silva',
                razao_social: 'João Silva Serviços Médicos',
                documento_limpo: '12345678000195',
                inscricao_municipal: '104467',
                uf: 'SP',
                cod_municipio_ibge: '3550308',
                serie_dps: '00001',
                ambiente: 'producao',
                opcao_simples_nacional: 'me_epp',
                regime_apuracao_sn: 'regime_1',
                regime_especial_tributacao: 0,
                percentual_tot_trib_sn: '6.00'
              }
            ]
          };
        }
        if (sql.includes('pacientes')) {
          return {
            rows: [
              {
                cpf_limpo: '12345678909',
                nome: 'Maria Souza',
                telefone: '11988887777',
                cep: '01001000',
                cod_municipio_ibge: '3550308',
                logradouro: 'Rua A',
                numero: '10',
                bairro: 'Centro'
              }
            ]
          };
        }
        if (sql.includes('notas_fiscais')) {
          return { rows: [{ proximo: 5 }] };
        }
        return { rows: [] };
      }
    };

    const service = new PostgresEmissorDpsService(fakePool, chaveCriptografia);
    const resultado = await service.emitir(itemMock);

    assert.equal(resultado.sucesso, true);
    assert.equal(resultado.ndps, 5);
    assert.equal(resultado.chaveAcesso.length, 50);
  });

  it('deve retornar erro se médico não possuir certificado A1 ativo no modo SEFIN real', async () => {
    const fakePool: any = {
      async query(sql: string) {
        if (sql.startsWith('select nome_completo, crm, rqe, especialidade from medicos')) return { rows: [{ nome_completo: 'João da Silva', crm: '12345/SP' }] };
        if (sql.includes('medico_perfil_fiscal')) {
          return {
            rows: [
              {
                nome_completo: 'Dr. João Silva',
                razao_social: 'João Silva Serviços Médicos',
                documento_limpo: '12345678000195',
                inscricao_municipal: '104467',
                uf: 'SP',
                cod_municipio_ibge: '3550308',
                ambiente: 'producao',
                opcao_simples_nacional: 'me_epp'
              }
            ]
          };
        }
        if (sql.includes('pacientes')) {
          return {
            rows: [{ cpf_limpo: '12345678909', nome: 'Maria Souza' }]
          };
        }
        if (sql.includes('medico_certificados')) {
          return { rows: [] }; // Sem certificado ativo
        }
        if (sql.includes('notas_fiscais')) {
          return { rows: [{ proximo: 1 }] };
        }
        return { rows: [] };
      }
    };

    const fakeSupabase: any = {};
    const fakeSefinClient = new SefinNacionalClient();

    const service = new PostgresEmissorDpsService(
      fakePool,
      chaveCriptografia,
      undefined,
      undefined,
      fakeSupabase,
      fakeSefinClient
    );

    const resultado = await service.emitir(itemMock);
    assert.equal(resultado.sucesso, false);
    assert.ok(resultado.erro.includes('não possui certificado digital A1 ativo'));
  });

  it('deve assinar e emitir com sucesso na SEFIN quando médico possuir certificado ativo', async () => {
    // 1. Gera chaves e certificado de teste
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    cert.setSubject([{ name: 'commonName', value: 'CLINICA SILVA LTDA:12345678000195' }]);
    cert.setIssuer([{ name: 'commonName', value: 'CLINICA SILVA LTDA:12345678000195' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const senha = 'senha-teste-123';
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha);
    const p12Buffer = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');

    const fakePool: any = {
      async query(sql: string) {
        if (sql.startsWith('select nome_completo, crm, rqe, especialidade from medicos')) return { rows: [{ nome_completo: 'João da Silva', crm: '12345/SP' }] };
        if (sql.includes('medico_perfil_fiscal')) {
          return {
            rows: [
              {
                nome_completo: 'Dr. João Silva',
                razao_social: 'João Silva Serviços Médicos',
                documento_limpo: '12345678000195',
                inscricao_municipal: '104467',
                uf: 'SP',
                cod_municipio_ibge: '3550308',
                serie_dps: '00001',
                proximo_numero_dps: 12,
                ambiente: 'producao',
                opcao_simples_nacional: 'me_epp'
              }
            ]
          };
        }
        if (sql.includes('pacientes')) {
          return {
            rows: [{ cpf_limpo: '12345678909', nome: 'Maria Souza' }]
          };
        }
        if (sql.includes('medico_certificados')) {
          return {
            rows: [
              {
                id: 'cert-1',
                medico_id: 'medico-1',
                arquivo_storage_path: 'certificados/medico-1/cert.pfx',
                senha_secret_id: 'sec-1',
                valido_ate: '2027-01-01'
              }
            ]
          };
        }
        if (sql.includes('vault.decrypted_secrets')) {
          return { rows: [{ secret: senha }] };
        }
        if (sql.includes('notas_fiscais')) {
          return { rows: [{ proximo: 10 }] };
        }
        return { rows: [] };
      }
    };

    let xmlSalvoNoStorage = '';
    const fakeSupabase: any = {
      storage: {
        from(bucket: string) {
          return {
            async download() {
              const u8 = new Uint8Array(p12Buffer);
              return { data: { async arrayBuffer() { return u8.buffer; } }, error: null };
            },
            async upload(_path: string, buffer: Buffer) {
              xmlSalvoNoStorage = buffer.toString('utf-8');
              return { data: {}, error: null };
            }
          };
        }
      }
    };

    const chaveOficialSefin = '35260912345678000195550010000000101234567890123456';
    const fakeTransmissor = async (_url: string, payload: string) => {
      const parsed = JSON.parse(payload);
      assert.ok(parsed.dpsXmlGZipB64);
      return {
        status: 200,
        corpo: JSON.stringify({
          chNFSe: chaveOficialSefin,
          nNFSe: 100,
          nProt: 'PROT-SEFIN-2026-999'
        })
      };
    };

    const fakeSefinClient = new SefinNacionalClient(fakeTransmissor);
    const service = new PostgresEmissorDpsService(
      fakePool,
      chaveCriptografia,
      undefined,
      undefined,
      fakeSupabase,
      fakeSefinClient
    );

    const resultado = await service.emitir(itemMock);
    assert.equal(resultado.sucesso, true);
    assert.equal(resultado.chaveAcesso, chaveOficialSefin);
    assert.equal(resultado.ndps, 12);
    assert.ok(xmlSalvoNoStorage.includes('Signature'));
  });

  it('deve avançar sequencial da DPS e emitir com sucesso se receber E0014 (duplicidade)', async () => {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    cert.setSubject([{ name: 'commonName', value: 'CLINICA TESTE LTDA:12345678000195' }]);
    cert.setIssuer([{ name: 'commonName', value: 'CLINICA TESTE LTDA:12345678000195' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const senha = 'senha-teste-123';
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha);
    const p12Buffer = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');

    let queriesExecutadas: string[] = [];
    const fakePool: any = {
      async query(sql: string) {
        if (sql.startsWith('select nome_completo, crm, rqe, especialidade from medicos')) return { rows: [{ nome_completo: 'João da Silva', crm: '12345/SP' }] };
        queriesExecutadas.push(sql);
        if (sql.includes('medico_perfil_fiscal') && sql.includes('select')) {
          return {
            rows: [
              {
                documento_limpo: '12345678000195',
                inscricao_municipal: '123456',
                razao_social: 'Clinica Teste LTDA',
                uf: 'SP',
                cod_municipio_ibge: '3550308',
                serie_dps: '00001',
                proximo_numero_dps: 12,
                ambiente: 'producao',
                opcao_simples_nacional: 'me_epp'
              }
            ]
          };
        }
        if (sql.includes('notas_fiscais') && sql.includes('max(ndps)')) {
          return { rows: [{ proximo: '5' }] };
        }
        if (sql.includes('pacientes')) {
          return {
            rows: [
              {
                cpf_limpo: '12345678909',
                nome: 'Paciente Teste'
              }
            ]
          };
        }
        if (sql.includes('medico_certificados')) {
          return {
            rows: [
              {
                id: 'cert-1',
                medico_id: 'medico-1',
                arquivo_storage_path: 'certificados/medico-1/cert.pfx',
                senha_secret_id: 'sec-1',
                valido_ate: '2027-01-01'
              }
            ]
          };
        }
        if (sql.includes('vault.decrypted_secrets')) {
          return { rows: [{ secret: senha }] };
        }
        return { rows: [] };
      }
    };

    const fakeSupabase: any = {
      storage: {
        from() {
          return {
            async download() {
              const u8 = new Uint8Array(p12Buffer);
              return { data: { async arrayBuffer() { return u8.buffer; } }, error: null };
            },
            async upload() {
              return { data: {}, error: null };
            }
          };
        }
      }
    };

    let chamadasTransmissor = 0;
    const chaveOficialSefin = '35260912345678000195550010000000131234567890123456';
    const fakeTransmissor = async () => {
      chamadasTransmissor++;
      if (chamadasTransmissor === 1) {
        return {
          status: 422,
          corpo: JSON.stringify({
            erros: [{ Codigo: 'E0014', Descricao: 'DPS já existe em uma NFS-e gerada anteriormente.' }]
          })
        };
      }
      return {
        status: 200,
        corpo: JSON.stringify({
          chNFSe: chaveOficialSefin,
          nNFSe: 101,
          nProt: 'PROT-SEFIN-2026-1000'
        })
      };
    };

    const fakeSefinClient = new SefinNacionalClient(fakeTransmissor as any);
    const service = new PostgresEmissorDpsService(
      fakePool,
      chaveCriptografia,
      undefined,
      undefined,
      fakeSupabase,
      fakeSefinClient
    );

    const resultado = await service.emitir(itemMock);
    assert.equal(resultado.sucesso, true);
    assert.equal(chamadasTransmissor, 2);
    assert.equal(resultado.ndps, 13);
    assert.equal(resultado.chaveAcesso, chaveOficialSefin);
    assert.ok(queriesExecutadas.some((q) => q.includes('update medico_perfil_fiscal')));

    chamadasTransmissor = 0;
    queriesExecutadas.length = 0;
    const conservador = new PostgresEmissorDpsService(fakePool, chaveCriptografia,
      undefined, undefined, fakeSupabase, fakeSefinClient, true);
    const rejeicao = await conservador.emitir(itemMock);
    assert.equal(rejeicao.sucesso, false);
    if (!rejeicao.sucesso) assert.equal(rejeicao.codigoErroSefin, 'E0014');
    assert.equal(chamadasTransmissor, 1);
    assert.ok(!queriesExecutadas.some(q => q.includes('update medico_perfil_fiscal')));
  });

  it('deve auto-recuperar erro E0676 atualizando perfil para MEI e retransmitindo com sucesso', async () => {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    cert.setSubject([{ name: 'commonName', value: 'DR TESTE MEI:12345678000195' }]);
    cert.setIssuer([{ name: 'commonName', value: 'DR TESTE MEI:12345678000195' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const senha = 'senha-teste-123';
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha);
    const p12Buffer = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');

    let queriesExecutadas: string[] = [];
    const fakePool: any = {
      async query(sql: string) {
        if (sql.startsWith('select nome_completo, crm, rqe, especialidade from medicos')) return { rows: [{ nome_completo: 'João da Silva', crm: '12345/SP' }] };
        queriesExecutadas.push(sql);
        if (sql.includes('medico_perfil_fiscal') && sql.includes('select')) {
          return {
            rows: [
              {
                documento_limpo: '12345678000195',
                inscricao_municipal: '123456',
                razao_social: 'Dr Teste MEI',
                uf: 'SP',
                cod_municipio_ibge: '3550308',
                serie_dps: '00001',
                proximo_numero_dps: 20,
                ambiente: 'producao',
                opcao_simples_nacional: 'me_epp' // inicialmente cadastrado como me_epp
              }
            ]
          };
        }
        if (sql.includes('notas_fiscais') && sql.includes('max(ndps)')) {
          return { rows: [{ proximo: '1' }] };
        }
        if (sql.includes('pacientes')) {
          return {
            rows: [
              {
                cpf_limpo: '12345678909',
                nome: 'Paciente Teste'
              }
            ]
          };
        }
        if (sql.includes('medico_certificados')) {
          return {
            rows: [
              {
                id: 'cert-1',
                medico_id: 'medico-1',
                arquivo_storage_path: 'certificados/medico-1/cert.pfx',
                senha_secret_id: 'sec-1',
                valido_ate: '2027-01-01'
              }
            ]
          };
        }
        if (sql.includes('vault.decrypted_secrets')) {
          return { rows: [{ secret: senha }] };
        }
        return { rows: [] };
      }
    };

    const fakeSupabase: any = {
      storage: {
        from() {
          return {
            async download() {
              const u8 = new Uint8Array(p12Buffer);
              return { data: { async arrayBuffer() { return u8.buffer; } }, error: null };
            },
            async upload() {
              return { data: {}, error: null };
            }
          };
        }
      }
    };

    let chamadasTransmissor = 0;
    const chaveOficialSefin = '35260912345678000195550010000000201234567890123456';
    const xmlsTransmitidos: string[] = [];
    const fakeTransmissor = async (_url: string, payload: string) => {
      xmlsTransmitidos.push(gunzipSync(Buffer.from(JSON.parse(payload).dpsXmlGZipB64, 'base64')).toString());
      chamadasTransmissor++;
      if (chamadasTransmissor === 1) {
        return {
          status: 422,
          corpo: JSON.stringify({
            erros: [
              {
                Codigo: 'E0676',
                Descricao:
                  'Não é permitido o preenchimento das informações relativas aos tributos federais quando o emitente for identificado como MEI na data de competência informada na DPS.'
              }
            ]
          })
        };
      }
      return {
        status: 200,
        corpo: JSON.stringify({
          chNFSe: chaveOficialSefin,
          nNFSe: 201,
          nProt: 'PROT-SEFIN-2026-2000'
        })
      };
    };

    const fakeSefinClient = new SefinNacionalClient(fakeTransmissor as any);
    const service = new PostgresEmissorDpsService(
      fakePool,
      chaveCriptografia,
      undefined,
      undefined,
      fakeSupabase,
      fakeSefinClient
    );

    const resultado = await service.emitir(itemMock);
    assert.equal(resultado.sucesso, true);
    assert.equal(chamadasTransmissor, 2);
    assert.equal(resultado.ndps, 20);
    assert.equal(resultado.chaveAcesso, chaveOficialSefin);
    assert.ok(
      queriesExecutadas.some(
        (q) => q.includes('update medico_perfil_fiscal') && q.includes("opcao_simples_nacional = 'mei'")
      )
    );

    chamadasTransmissor = 0;
    queriesExecutadas.length = 0;
    const conservador = new PostgresEmissorDpsService(fakePool, chaveCriptografia,
      undefined, undefined, fakeSupabase, fakeSefinClient, true);
    const rejeicao = await conservador.emitir(itemMock);
    assert.equal(rejeicao.sucesso, false);
    if (!rejeicao.sucesso) assert.equal(rejeicao.codigoErroSefin, 'E0676');
    assert.equal(chamadasTransmissor, 1);
    assert.ok(!queriesExecutadas.some(q => q.includes('update medico_perfil_fiscal')));

    if (rejeicao.sucesso) throw new Error('Esperava rejeição');
    const corrigida = await conservador.corrigirRejeicao(itemMock, rejeicao);
    assert.equal(corrigida.sucesso, true);
    assert.equal(chamadasTransmissor, 2);
    const antes = xmlsTransmitidos.at(-2)!;
    const depois = xmlsTransmitidos.at(-1)!;
    assert.ok(antes.includes('<tribFed>'));
    assert.ok(!depois.includes('<tribFed>'));
    assert.equal(antes.match(/<opSimpNac>.*?<\/opSimpNac>/)?.[0], depois.match(/<opSimpNac>.*?<\/opSimpNac>/)?.[0]);
    assert.equal(antes.match(/<nDPS>.*?<\/nDPS>/)?.[0], depois.match(/<nDPS>.*?<\/nDPS>/)?.[0]);
    assert.ok(!queriesExecutadas.some(q => q.includes('update medico_perfil_fiscal')));

    const alterada = await conservador.corrigirRejeicao({ ...itemMock, valorServicoCentavos: 99999 }, rejeicao);
    assert.equal(alterada.sucesso, false);
    assert.equal(chamadasTransmissor, 2, 'Mudança de dados bloqueia envio');
  });

  it('deve auto-recuperar erro E0160 atualizando perfil para ME/EPP quando prestador estava como MEI e retransmitindo com sucesso', async () => {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    cert.setSubject([{ name: 'commonName', value: 'DR TESTE ME/EPP:12345678000195' }]);
    cert.setIssuer([{ name: 'commonName', value: 'DR TESTE ME/EPP:12345678000195' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const senha = 'senha-teste-123';
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha);
    const p12Buffer = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');

    let queriesExecutadas: string[] = [];
    const fakePool: any = {
      async query(sql: string) {
        if (sql.startsWith('select nome_completo, crm, rqe, especialidade from medicos')) return { rows: [{ nome_completo: 'João da Silva', crm: '12345/SP' }] };
        queriesExecutadas.push(sql);
        if (sql.includes('medico_perfil_fiscal') && sql.includes('select')) {
          return {
            rows: [
              {
                documento_limpo: '12345678000195',
                inscricao_municipal: '123456',
                razao_social: 'Dr Teste ME/EPP',
                uf: 'SP',
                cod_municipio_ibge: '3550308',
                serie_dps: '00001',
                proximo_numero_dps: 30,
                ambiente: 'producao',
                opcao_simples_nacional: 'mei' // inicialmente configurado como mei
              }
            ]
          };
        }
        if (sql.includes('notas_fiscais') && sql.includes('max(ndps)')) {
          return { rows: [{ proximo: '1' }] };
        }
        if (sql.includes('pacientes')) {
          return {
            rows: [
              {
                cpf_limpo: '12345678909',
                nome: 'Paciente Teste'
              }
            ]
          };
        }
        if (sql.includes('medico_certificados')) {
          return {
            rows: [
              {
                id: 'cert-1',
                medico_id: 'medico-1',
                arquivo_storage_path: 'certificados/medico-1/cert.pfx',
                senha_secret_id: 'sec-1',
                valido_ate: '2027-01-01'
              }
            ]
          };
        }
        if (sql.includes('vault.decrypted_secrets')) {
          return { rows: [{ secret: senha }] };
        }
        return { rows: [] };
      }
    };

    const fakeSupabase: any = {
      storage: {
        from() {
          return {
            async download() {
              const u8 = new Uint8Array(p12Buffer);
              return { data: { async arrayBuffer() { return u8.buffer; } }, error: null };
            },
            async upload() {
              return { data: {}, error: null };
            }
          };
        }
      }
    };

    let chamadasTransmissor = 0;
    const chaveOficialSefin = '35260912345678000195550010000000301234567890123456';
    const fakeTransmissor = async () => {
      chamadasTransmissor++;
      if (chamadasTransmissor === 1) {
        return {
          status: 422,
          corpo: JSON.stringify({
            erros: [
              {
                Codigo: 'E0160',
                Descricao:
                  'No mês de competência da NFS-e, a opção de situação perante o Simples Nacional, do prestador, informada na DPS não está de acordo com o cadastro Simples Nacional.'
              }
            ]
          })
        };
      }
      return {
        status: 200,
        corpo: JSON.stringify({
          chNFSe: chaveOficialSefin,
          nNFSe: 301,
          nProt: 'PROT-SEFIN-2026-3000'
        })
      };
    };

    const fakeSefinClient = new SefinNacionalClient(fakeTransmissor as any);
    const service = new PostgresEmissorDpsService(
      fakePool,
      chaveCriptografia,
      undefined,
      undefined,
      fakeSupabase,
      fakeSefinClient
    );

    const resultado = await service.emitir(itemMock);
    assert.equal(resultado.sucesso, true);
    assert.equal(chamadasTransmissor, 2);
    assert.equal(resultado.ndps, 30);
    assert.equal(resultado.chaveAcesso, chaveOficialSefin);
    assert.ok(
      queriesExecutadas.some(
        (q) => q.includes('update medico_perfil_fiscal') && q.includes("opcao_simples_nacional = 'me_epp'")
      )
    );
  });

  it('deve retornar erro impeditivo se o paciente não possuir nome civil válido e consulta externa falhar', async () => {
    const fakePool: any = {
      async query(sql: string) {
        if (sql.startsWith('select nome_completo, crm, rqe, especialidade from medicos')) return { rows: [{ nome_completo: 'João da Silva', crm: '12345/SP' }] };
        if (sql.includes('medico_perfil_fiscal')) {
          return {
            rows: [
              {
                nome_completo: 'Dr. João Silva',
                razao_social: 'João Silva Serviços Médicos',
                documento_limpo: '12345678000195',
                inscricao_municipal: '104467',
                uf: 'SP',
                cod_municipio_ibge: '3550308',
                serie_dps: '00001',
                ambiente: 'producao',
                opcao_simples_nacional: 'me_epp',
                regime_apuracao_sn: 'regime_1',
                regime_especial_tributacao: 0,
                percentual_tot_trib_sn: '6.00'
              }
            ]
          };
        }
        if (sql.includes('from pacientes')) {
          return {
            rows: [
              {
                cpf_limpo: '12345678909',
                nome: null, // Sem nome
                nome_validado: false,
                telefone: '11988887777'
              }
            ]
          };
        }
        return { rows: [] };
      }
    };

    const service = new PostgresEmissorDpsService(
      fakePool,
      chaveCriptografia
    );

    const resultado = await service.emitir(itemMock);
    assert.equal(resultado.sucesso, false);
    assert.ok(resultado.erro?.includes('sem nome civil completo válido'));
  });

  it('não deve consultar a API de CPF se o paciente já possuir nomeValidado = true', async () => {
    const fakePool: any = {
      async query(sql: string) {
        if (sql.startsWith('select nome_completo, crm, rqe, especialidade from medicos')) return { rows: [{ nome_completo: 'João da Silva', crm: '12345/SP' }] };
        if (sql.includes('medico_perfil_fiscal')) {
          return {
            rows: [
              {
                nome_completo: 'Dr. João Silva',
                razao_social: 'João Silva Serviços Médicos',
                documento_limpo: '12345678000195',
                inscricao_municipal: '104467',
                uf: 'SP',
                cod_municipio_ibge: '3550308',
                serie_dps: '00001',
                ambiente: 'producao',
                opcao_simples_nacional: 'me_epp',
                regime_apuracao_sn: 'regime_1',
                regime_especial_tributacao: 0,
                percentual_tot_trib_sn: '6.00'
              }
            ]
          };
        }
        if (sql.includes('from pacientes')) {
          return {
            rows: [
              {
                cpf_limpo: '12345678909',
                nome: 'Maria Souza Silva',
                nome_validado: true,
                telefone: '11988887777',
                cep: '01001000',
                cod_municipio_ibge: '3550308',
                logradouro: 'Rua A',
                numero: '10',
                bairro: 'Centro'
              }
            ]
          };
        }
        if (sql.includes('notas_fiscais')) {
          return { rows: [{ proximo: 1 }] };
        }
        return { rows: [] };
      }
    };

    let chamadasCpf = 0;
    const fakeCpfProvider: any = {
      async consultar() {
        chamadasCpf++;
        return { nome: 'OUTRO NOME' };
      }
    };

    const service = new PostgresEmissorDpsService(
      fakePool,
      chaveCriptografia,
      undefined,
      fakeCpfProvider
    );

    const resultado = await service.emitir(itemMock);
    assert.equal(resultado.sucesso, true);
    assert.equal(chamadasCpf, 0); // ZERO consultas à API pois já estava validado!
  });

  it('deve realizar a 2ª verificação quando o paciente tiver CPF mas não tiver nome (ex: puxado do histórico), gravando o nome e a TAG válido na emissão', async () => {
    let pacienteNoBanco = {
      cpf_limpo: '12345678909',
      nome: null as string | null,
      nome_validado: false,
      telefone: '11988887777',
      cep: '01001000',
      cod_municipio_ibge: '3550308',
      logradouro: 'Rua A',
      numero: '10',
      bairro: 'Centro'
    };

    let queriesExecutadas: string[] = [];
    const fakePool: any = {
      async query(sql: string, params?: any[]) {
        if (sql.startsWith('select nome_completo, crm, rqe, especialidade from medicos')) return { rows: [{ nome_completo: 'João da Silva', crm: '12345/SP' }] };
        queriesExecutadas.push(sql);
        if (sql.includes('medico_perfil_fiscal')) {
          return {
            rows: [
              {
                nome_completo: 'Dr. João Silva',
                razao_social: 'João Silva Serviços Médicos',
                documento_limpo: '12345678000195',
                inscricao_municipal: '104467',
                uf: 'SP',
                cod_municipio_ibge: '3550308',
                serie_dps: '00001',
                ambiente: 'producao',
                opcao_simples_nacional: 'me_epp',
                regime_apuracao_sn: 'regime_1',
                regime_especial_tributacao: 0,
                percentual_tot_trib_sn: '6.00'
              }
            ]
          };
        }
        if (sql.includes('from pacientes')) {
          return {
            rows: [pacienteNoBanco]
          };
        }
        if (sql.includes('update pacientes set nome = $1, nome_validado = true')) {
          pacienteNoBanco.nome = params![0];
          pacienteNoBanco.nome_validado = true;
          return { rowCount: 1 };
        }
        if (sql.includes('notas_fiscais')) {
          return { rows: [{ proximo: 1 }] };
        }
        return { rows: [] };
      }
    };

    let chamadasCpf = 0;
    const fakeCpfProvider: any = {
      async consultar() {
        chamadasCpf++;
        return { nome: 'Carlos Eduardo Oliveira' };
      }
    };

    const service = new PostgresEmissorDpsService(
      fakePool,
      chaveCriptografia,
      undefined,
      fakeCpfProvider
    );

    const resultado = await service.emitir(itemMock);
    assert.equal(resultado.sucesso, true);
    assert.equal(chamadasCpf, 1); // Realizou a 2ª verificação com sucesso
    assert.equal(pacienteNoBanco.nome, 'Carlos Eduardo Oliveira');
    assert.equal(pacienteNoBanco.nome_validado, true); // TAG 'válido' inserida!
  });
});
