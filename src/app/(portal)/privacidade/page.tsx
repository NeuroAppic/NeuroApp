import type { Metadata } from "next";
import { LegalDocument } from "@/components/layout/legal-document";
import { PRIVACY_POLICY_UPDATED_AT } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function PrivacidadePage() {
  return (
    <LegalDocument title="Política de privacidade" updatedAt={PRIVACY_POLICY_UPDATED_AT}>
      <h2>Resumo em linguagem simples</h2>
      <ul>
        <li>Você pode usar o portal sem informar nome, e-mail ou diagnóstico.</li>
        <li>As conversas ficam guardadas para dar continuidade ao apoio e para a segurança de quem usa o serviço.</li>
        <li>A conversa começa com uma inteligência artificial. Profissionais autorizados podem ler a conversa para oferecer apoio.</li>
        <li>Você pode baixar seus dados e apagar suas conversas em <a href="/conta">Minha conta</a>.</li>
      </ul>

      <h2>1. Quem trata os dados</h2>
      <p>[Razão social, CNPJ, endereço e canal do Encarregado (DPO) — preencher antes do lançamento.]</p>

      <h2>2. Quais dados tratamos</h2>
      <ul>
        <li><strong>Identificador técnico de sessão</strong> (visitante anônimo ou conta), criado quando você começa a conversar.</li>
        <li><strong>Mensagens</strong> que você envia e as respostas recebidas. Podem conter dados sensíveis de saúde, que você escolhe compartilhar.</li>
        <li><strong>Preferências</strong> de acessibilidade e comunicação.</li>
        <li><strong>Apelido e e-mail</strong>, apenas se você informar.</li>
        <li><strong>Registros de segurança</strong>: horários, mudanças de estado da conversa, nível de atenção da triagem automática (sem o conteúdo) e acessos de profissionais.</li>
        <li><strong>Metadados de uso da IA</strong> (quantidade de tokens, tempo de resposta), sem conteúdo.</li>
      </ul>

      <h2>3. Para que usamos e bases legais</h2>
      <p>
        Prestar o acolhimento solicitado, permitir atendimento por profissionais, proteger a vida e a
        integridade física (LGPD, art. 11, II, “e”) e cumprir obrigações legais e regulatórias.
        [A definição final das bases legais, inclusive a necessidade de consentimento específico para dados
        sensíveis, deve ser validada por assessoria jurídica.]
      </p>

      <h2>4. Inteligência artificial</h2>
      <p>
        Para gerar respostas, um trecho recente da conversa é enviado a um provedor de IA contratado
        [nome do provedor], que pode estar fora do Brasil. Os contratos devem prever confidencialidade,
        retenção mínima, vedação de uso para treinamento e salvaguardas de transferência internacional
        (LGPD, art. 33). A IA não toma decisões sobre você e não faz diagnósticos.
      </p>

      <h2>5. Quem pode acessar</h2>
      <p>
        Você; psicólogos com registro validado, nas situações descritas em Minha conta; e operadores técnicos
        estritamente necessários. Administradores da plataforma não leem conversas. Todo acesso de
        profissional ao conteúdo é registrado.
      </p>

      <h2>6. Por quanto tempo guardamos</h2>
      <ul>
        <li>Conversas sem atendimento profissional: até [180] dias após a última mensagem.</li>
        <li>Conversas com atendimento profissional: pelo prazo exigido para registros profissionais [ex.: 5 anos — validar com normas do Conselho Federal de Psicologia].</li>
        <li>Sessões de visitante inativas: removidas após [90] dias.</li>
        <li>Cópias de segurança: substituídas em até [30] dias. Um dado apagado pode permanecer nesse período apenas nas cópias, sem uso.</li>
      </ul>

      <h2>7. Seus direitos</h2>
      <p>
        Confirmação e acesso, correção, anonimização, portabilidade, eliminação, informação sobre
        compartilhamentos e revogação de consentimento (LGPD, art. 18). Muitos podem ser exercidos
        diretamente em Minha conta; os demais pelo canal do Encarregado.
      </p>

      <h2>8. Crianças e adolescentes</h2>
      <p>
        [Política a definir antes do lançamento, considerando o ECA, a LGPD (art. 14) e as normas
        profissionais aplicáveis. Um simples aceite não é suficiente.]
      </p>

      <h2>9. Segurança</h2>
      <p>
        Criptografia em trânsito, controle de acesso por papéis com verificação no servidor e no banco de
        dados, registros de auditoria e minimização de dados nos registros técnicos.
      </p>
    </LegalDocument>
  );
}
