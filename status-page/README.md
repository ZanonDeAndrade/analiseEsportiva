# Status page independente

Este diretório é um artefato estático sem dependência da API, PostgreSQL, Redis,
Auth0 ou bundle principal. Deve ser publicado em conta/projeto e origem separados,
com credenciais de emergência guardadas fora da infraestrutura do produto.

Para atualizar durante um incidente, valide `status.json`, publique somente este
diretório no host estático independente e confirme a página por uma rede externa.
Não inclua nomes, e-mails, IPs, IDs internos, causa ainda não confirmada ou evidência
sensível. O histórico técnico completo permanece no registro de incidente cifrado.
