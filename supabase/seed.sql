-- =============================================================================
-- Dados iniciais (idempotentes). Não contém dados pessoais.
-- =============================================================================

-- Configurações -------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('public.emergency_contacts', '{
     "country": "BR",
     "contacts": [
       {"id": "cvv", "name": "CVV — Centro de Valorização da Vida", "phone": "188",
        "description": "Apoio emocional e prevenção do suicídio. Ligação gratuita, 24 horas.",
        "url": "https://cvv.org.br"},
       {"id": "samu", "name": "SAMU", "phone": "192",
        "description": "Emergências médicas, inclusive crises de saúde mental com risco imediato."},
       {"id": "policia", "name": "Polícia Militar", "phone": "190",
        "description": "Se você ou outra pessoa estiver em perigo por violência."}
     ]
   }'::jsonb, 'Contatos de emergência exibidos no portal. Ajuste conforme o país de operação.'),
  ('public.locale', '{"timezone": "America/Sao_Paulo", "language": "pt-BR"}'::jsonb,
   'Fuso horário usado nas métricas.'),
  ('public.service_info', '{
     "service_hours": "Profissionais podem não estar disponíveis o tempo todo. Quando ninguém estiver disponível, isso será informado com clareza.",
     "is_emergency_service": false
   }'::jsonb, 'Texto informativo sobre a disponibilidade humana.'),
  ('safety.auto_escalate', '{"enabled": true}'::jsonb,
   'Se verdadeiro, mensagens com risco alto entram na fila prioritária quando houver profissional disponível.'),
  ('retention', '{
     "conversation_days": 180,
     "professional_record_days": 1825,
     "anonymous_inactive_days": 90,
     "ai_usage_days": 400,
     "auto_close_idle_hours": 24,
     "backup_window_days": 30
   }'::jsonb, 'Prazos de retenção. professional_record_days deve ser validado juridicamente (ex.: normas do CFP).'),
  ('ai.limits', '{
     "user_messages_per_minute": 8,
     "user_messages_per_day": 300,
     "global_requests_per_day": 20000
   }'::jsonb, 'Limites de uso da IA para controle de custos e abuso.')
on conflict (key) do nothing;

-- Mensagens rápidas ----------------------------------------------------------
insert into public.quick_messages (category, label, message, sort_order) values
  ('essenciais', 'Preciso de ajuda', 'Preciso de ajuda.', 10),
  ('essenciais', 'Estou em crise', 'Estou em crise.', 20),
  ('essenciais', 'Não consigo escrever agora', 'Não consigo escrever agora.', 30),
  ('essenciais', 'Quero falar com uma pessoa', 'Quero falar com uma pessoa.', 40),
  ('essenciais', 'Preciso me acalmar', 'Preciso me acalmar.', 50),
  ('essenciais', 'Quero conversar', 'Quero conversar.', 60),
  ('sentimentos', 'Estou com medo', 'Estou com medo.', 10),
  ('sentimentos', 'Estou muito ansioso(a)', 'Estou muito ansioso(a).', 20),
  ('sentimentos', 'Estou sobrecarregado(a)', 'Estou sobrecarregado(a).', 30),
  ('sentimentos', 'Estou triste', 'Estou triste.', 40),
  ('sentimentos', 'Não sei explicar o que sinto', 'Não consigo explicar o que estou sentindo.', 50),
  ('pedidos', 'Quero ficar em silêncio', 'Quero ficar em silêncio por um momento.', 10),
  ('pedidos', 'Só quero que me escute', 'Prefiro que você apenas me escute agora.', 20),
  ('pedidos', 'Me dê uma sugestão', 'Você pode me dar uma sugestão simples?', 30),
  ('pedidos', 'Respostas mais curtas', 'Por favor, responda com frases curtas.', 40)
on conflict (category, label) do nothing;

-- Sons demonstrativos: gerados no navegador, sem arquivos. -------------------
insert into public.audio_tracks (title, description, category, is_demo, demo_generator, color, icon, is_published, sort_order) values
  ('Ruído marrom', 'Som grave e contínuo. Demonstração gerada no navegador.', 'brown_noise', true, 'brown', '#A68A7B', 'waves', true, 10),
  ('Ruído rosa', 'Som equilibrado e suave. Demonstração gerada no navegador.', 'pink_noise', true, 'pink', '#C9A9B8', 'waves', true, 20),
  ('Ruído branco', 'Som uniforme, ajuda a mascarar ruídos. Demonstração gerada no navegador.', 'white_noise', true, 'white', '#B9C2CC', 'waves', true, 30),
  ('Chuva leve', 'Aproximação de chuva gerada no navegador. Demonstração.', 'rain', true, 'rain', '#8FA4B8', 'cloud-rain', true, 40),
  ('Ventilador', 'Zumbido baixo e constante. Demonstração gerada no navegador.', 'fan', true, 'fan', '#9AAFA2', 'fan', true, 50),
  ('Água corrente', 'Aproximação de água corrente. Demonstração gerada no navegador.', 'water', true, 'water', '#87A9A6', 'droplets', true, 60),
  ('Vento suave', 'Vento ao longe. Demonstração gerada no navegador.', 'nature', true, 'wind', '#A9B79B', 'wind', true, 70)
on conflict (title) where is_demo do nothing;
