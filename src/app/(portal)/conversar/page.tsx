import { permanentRedirect } from "next/navigation";

/** A conversa agora é a tela inicial; o endereço antigo continua funcionando. */
export default function ConversarPage() {
  permanentRedirect("/");
}
