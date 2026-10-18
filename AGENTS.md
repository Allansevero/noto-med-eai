# REGRAS PRIMÁRIAS (acima de todas as outras; só mudam com aprovação explícita do dono)

1. TRAVAR: o que funciona não quebra.
Antes de mudar qualquer coisa, rode a suíte e registre o resultado. Emissão de nota, login/OTP, preferências e parâmetros só mudam com teste que prove o comportamento antes e depois. Se não há teste cobrindo, escreva o teste primeiro. Refatoração nunca muda comportamento e nunca vai no mesmo commit de mudança de comportamento. Nunca altere teste para fazê-lo passar, nunca enfraqueça assert, nunca adicione mock para esconder falha.

2. ENXUGAR: a menor mudança que resolve, sem camadas novas.
Um objetivo por vez, menor diff possível, um commit por passo. Reutilize o que existe, não duplique, remova código morto (commit separado). Só enxugue o que a Regra 1 já travou. Testes e código novos também seguem esta regra: sem helper genérico, sem camada nova, sem teste inflado.

3. PROVAR: nada está pronto sem evidência.
Toda entrega mostra a saída real da suíte antes e depois, o diff pequeno e a lista do que foi verificado versus hipótese. "Deve funcionar" não é evidência. Sem prova de que as Regras 1 e 2 foram cumpridas, a tarefa não terminou. A IA analisa, decide e explica; a regra determinística valida e assina.

Como se protegem: a 1 limita a 2 (não enxuga o que não está travado por teste); a 2 limita a 1 e a 3 (teste e prova não viram burocracia nem camada); a 3 fiscaliza a 1 e a 2.

# REGRAS SECUNDÁRIAS (valem só se não contradisserem as primárias)

4. Antes de codar, escreva o plano em linguagem natural (arquivos, o que muda, como verificar). Se tocar mais de 2 arquivos, mostre o plano antes de implementar.
5. Não crie abstração para um único uso. Não trate casos que não foram pedidos. Não crie "utils" genéricos.
6. Emissão de nota, validação e tudo que envolve dinheiro ficam em código determinístico. Não mova decisão fiscal para o modelo sem validação por regra. Dúvida fiscal ou de comprovante vai para o médico, não é chutada.
7. Se a mesma correção falhar 2 vezes, pare e mostre o erro em vez de tentar uma terceira variante.
8. Escreva para quem lê: nomes com palavras completas, funções curtas que fazem uma coisa só, no máximo 2 níveis de aninhamento (prefira early return).
9. Antes de escrever código novo, procure no repo quem já faz isso e reutilize. Se já existem duas cópias parecidas, não crie a terceira; proponha extrair a comum.
10. Função, arquivo, export ou dependência sem chamador sai, em commit separado, com a suíte igual antes e depois.
11. Sem tamanho sagrado, mas com direção: função acima de ~50 linhas ou com muitos desvios aninhados é candidata a dividir. Arquivo novo só se não couber num existente.
12. Primeiro correto e claro, depois rápido. Otimize só com evidência concreta (query em loop, await serial que podia ser paralelo). Nada de otimização especulativa.
13. Comentário só para o "porquê" não óbvio (regra fiscal, decisão, workaround). Se o código precisa de comentário para ser entendido, simplifique o código.
