import type { Metadata } from "next";
import { LegalDocument } from "@/components/layout/legal-document";
import { PRIVACY_POLICY_UPDATED_AT } from "@/lib/legal";

export const metadata: Metadata = { title: "Termos de uso" };

export default function TermosPage() {
  return (
    <LegalDocument title="Termos de uso" updatedAt={PRIVACY_POLICY_UPDATED_AT}>
      <h2>1. O que é este serviço</h2>
      <p>
        Um espaço digital de acolhimento emocional, com assistente virtual (inteligência artificial),
        atendimento por profissionais quando houver disponibilidade, sons e atividades tranquilas.
      </p>

      <h2>2. O que este serviço não é</h2>
      <ul>
        <li>Não é serviço de emergência. Em perigo imediato, ligue 192 (SAMU) ou 188 (CVV).</li>
        <li>A inteligência artificial não é psicóloga, não faz diagnósticos e não prescreve tratamentos.</li>
        <li>Não garantimos atendimento humano imediato nem a detecção de todas as situações de risco.</li>
      </ul>

      <h2>3. Atendimento por profissionais</h2>
      <p>
        Profissionais têm registro validado pela administração. A tela sempre informa quando você está
        falando com uma pessoa e quem é ela. O atendimento segue o Código de Ética Profissional do
        Psicólogo e as resoluções do CFP sobre serviços mediados por tecnologia [validar requisitos, como
        cadastro e-Psi].
      </p>

      <h2>4. Uso adequado</h2>
      <p>
        Não use o serviço para ofender, ameaçar, enviar conteúdo ilegal ou tentar burlar a segurança. Para
        proteger o serviço, há limites de uso.
      </p>

      <h2>5. Alterações</h2>
      <p>Mudanças relevantes serão avisadas no portal, e um novo aceite pode ser pedido antes da próxima conversa.</p>

      <h2>6. Contato e foro</h2>
      <p>[Canal de atendimento, foro e lei aplicável — preencher.]</p>
    </LegalDocument>
  );
}
