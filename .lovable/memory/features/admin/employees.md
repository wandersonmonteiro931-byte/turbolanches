---
name: Controle de Funcionários
description: Módulo RH com ponto biométrico (face-api.js), geofencing, ocorrências e holerites
type: feature
---
Módulo `/admin/funcionarios` (5 abas: Funcionários, Histórico, Ocorrências, Holerites, Config) e portal `/funcionario` (acesso por código pessoal F0001+).

**Tabelas imutáveis** (sem UPDATE/DELETE via RLS): `time_clock_punches`, `time_clock_occurrences`, `payslips`. Justificativas de ocorrências são append-only via `occurrence_justifications`.

**Ponto biométrico**: face-api.js carrega modelos do CDN (justadudewhohacks.github.io) e gera descritor 128-D salvo em `employees.face_descriptor`. Match por distância Euclidiana, threshold padrão 0.55 (configurável).

**Geofencing**: Haversine entre GPS do funcionário e `time_clock_settings.store_lat/lng`, raio padrão 100m configurável. Admin captura coordenadas com botão "Capturar localização atual".

**Edge Functions** (`verify_jwt = false`):
- `employee-clock-in`: valida face/GPS, faz upload da selfie em `clock-selfies` (privado) e insere ponto via service role
- `employee-portal`: ações `auth`, `history`, `payslip_url` (signed URL 5min para PDF privado)

**Buckets**: `employee-photos` (público, foto referência), `clock-selfies` (privado), `payslips` (privado).

Códigos sequenciais via função `next_employee_code()` (F0001, F0002...). Business day cutoff 06:00 Brasília preservado nos pontos.
