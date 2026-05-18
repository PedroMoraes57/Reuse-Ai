<div align="center">

<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/UNIP_logo.png/200px-UNIP_logo.png" width="80" alt="UNIP Logo"/>

# 🌱 Reuse.AI — Inteligência Sustentável

**Plataforma de classificação de resíduos com IA, recomendação de descarte e assistente conversacional contextual.**

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![Django](https://img.shields.io/badge/Django-REST_Framework-092E20?style=flat-square&logo=django&logoColor=white)](https://www.django-rest-framework.org/)
[![React](https://img.shields.io/badge/React-TypeScript-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://sqlite.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

> *"Saber não é suficiente; devemos aplicar. Estar disposto não é o suficiente; devemos fazer."*
> — Leonardo da Vinci

[Sobre o Projeto](#-sobre-o-projeto) • [Funcionalidades](#-funcionalidades) • [Arquitetura](#-arquitetura) • [Como Rodar](#-como-rodar) • [API](#-endpoints-da-api) • [Equipe](#-equipe)

</div>

---

## 📖 Sobre o Projeto

O **Reuse.AI** é uma plataforma digital que combina **Inteligência Artificial**, **visão computacional** e **gamificação** para orientar usuários sobre o descarte correto de resíduos. O usuário fotografa um objeto — móvel, eletrônico, embalagem — e o sistema analisa a imagem, identifica o material predominante e fornece recomendações de reciclagem ou descarte adequado.

O projeto foi desenvolvido como trabalho semestral na **Universidade Paulista (UNIP)**, campus São José do Rio Preto – SP, em março de 2026, sob orientação da Prof.ª Lidiana Braga.

### Objetivos

- Reduzir o descarte inadequado de resíduos por meio de informação acessível e contextualizada.
- Promover educação ambiental de forma interativa e gamificada.
- Aproximar tecnologia de ponta das necessidades ambientais e educacionais da população.

---

## ✨ Funcionalidades

| Funcionalidade | Descrição |
|---|---|
| 📷 **Classificação por imagem** | Envie uma foto e receba a identificação do material, reciclabilidade e orientação de descarte |
| 🤖 **Assistente conversacional** | Chatbot contextual com histórico persistido por sessão e consciência da tela/análise atual |
| 📍 **Pontos de descarte** | Localização geográfica de ecopontos e pontos de coleta seletiva próximos ao usuário |
| 🏆 **Gamificação** | Sistema de XP, níveis, conquistas e ranking para incentivar o engajamento sustentável |
| 🧠 **Quiz ambiental** | Perguntas geradas dinamicamente após cada classificação |
| 📚 **Base de conhecimento** | Conteúdo educativo sobre sustentabilidade, reciclagem e descarte responsável |

---

## 🏗 Arquitetura

O sistema é uma aplicação full stack composta por três camadas principais:

```
reuse-ai/
├── frontend/                  # SPA — React + TypeScript (Vite)
│   └── src/
│       ├── main.tsx           # Entry point
│       ├── App.tsx            # Roteamento + Providers globais
│       ├── services/          # Integração com API (ClassificationApi, etc.)
│       └── contexts/          # AssistantProvider, ThemeProvider
│
├── backend/
│   ├── src/
│   │   ├── django_backend/    # Projeto Django (settings, urls, views)
│   │   ├── accounts/          # Auth, perfil, gamificação, histórico de chat
│   │   └── reuse_ai/          # Motor de classificação, chatbot, localização
│   └── configs/               # YAMLs declarativos (classes, regras, conhecimento)
│
├── start_reuse_ai.py          # Orquestrador local (frontend + backend em paralelo)
└── backend/db.sqlite3         # Banco de dados relacional
```

### Stack Tecnológica

**Frontend**
- React 18 + TypeScript, Vite
- BrowserRouter para roteamento
- Token JWT armazenado em `localStorage` com envio automático via `Authorization: Token <token>`

**Backend**
- Django + Django REST Framework
- Autenticação via `TokenAuthentication`
- CORS configurado por origem (`FRONTEND_URL`)
- SQLite como banco de dados

**Módulo de IA (`reuse_ai`)**
- Inferência local com `ReusePredictor` usando modelos de visão computacional (CNNs)
- Suporte opcional a GPU via CUDA
- Chatbot com `RecyclingChatbotService` e suporte a Ollama (configurável por variável de ambiente)

**Dados e Configuração**
- Catálogos de resíduos, regras de descarte e conhecimento do chatbot em arquivos `.yaml`
- Fontes de pontos de descarte: Overpass/Nominatim + catálogo local com cache

---

## 🚀 Como Rodar

### Pré-requisitos

- Python 3.10+
- Node.js 18+ e npm
- (Opcional) CUDA para inferência em GPU

### 1. Clone o repositório

```bash
git clone https://github.com/<seu-usuario>/reuse-ai.git
cd reuse-ai
```

### 2. Configure o ambiente Python

```bash
python -m venv .venv
source .venv/bin/activate       # Linux/macOS
# ou
.venv\Scripts\activate          # Windows

pip install -r backend/requirements.txt
```

### 3. Configure o ambiente do frontend

```bash
cd frontend
npm install
cd ..
```

### 4. Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Backend
FRONTEND_URL=http://localhost:5173
SECRET_KEY=sua-secret-key-aqui

# Frontend (frontend/.env)
VITE_API_URL=http://localhost:8000/api
```

### 5. Execute as migrações do banco

```bash
cd backend
python manage.py migrate
```

### 6. Inicie a aplicação

```bash
# Na raiz do projeto — sobe frontend e backend em paralelo
python start_reuse_ai.py
```

Ou separadamente:

```bash
# Backend
cd backend && python manage.py runserver

# Frontend (outro terminal)
cd frontend && npm run dev
```

Acesse em: `http://localhost:5173`

---

## 🔌 Endpoints da API

| Método | Endpoint | Descrição | Auth |
|---|---|---|---|
| `GET` | `/api/health` | Saúde da aplicação e disponibilidade do modelo | ❌ |
| `POST` | `/api/analyze` | Classifica uma ou mais imagens | ✅ |
| `POST` | `/api/chatbot` | Envia mensagem ao assistente contextual | ✅ |
| `GET` | `/api/chatbot/sessions` | Lista sessões do usuário | ✅ |
| `GET` | `/api/chatbot/sessions/{id}` | Histórico de uma sessão | ✅ |
| `POST` | `/api/chatbot/sessions/{id}/close` | Fecha sessão (somente leitura) | ✅ |
| `GET` | `/api/disposal-points/nearby` | Pontos de descarte próximos por geolocalização | ✅ |

### Exemplo — Classificar imagem

**Request**
```http
POST /api/analyze
Authorization: Token <seu-token>
Content-Type: multipart/form-data

files: <imagem.jpg>
```

**Response**
```json
{
  "best_match": {
    "class": "plastico",
    "description": "Garrafa PET",
    "disposal_stream": "reciclavel",
    "recommendation": "Descarte na lixeira amarela ou em ecopontos de reciclagem."
  },
  "confidence": 0.94,
  "uncertain_prediction": false,
  "top_predictions": [...],
  "game_update": { "xp_gained": 10, "new_level": false },
  "analysis_id": "abc123",
  "quiz": { ... }
}
```

---

## 🤖 Pipeline de IA

O ciclo de inferência de imagens segue as etapas:

1. Recebimento do arquivo via `multipart/form-data`
2. Conversão para `PIL.Image` (RGB)
3. Inferência com `ReusePredictor` — modelo CNN treinado para identificar categorias de resíduos
4. Sinalização de incerteza quando a confiança está abaixo do threshold configurado
5. Retorno estruturado com classe, confiança, recomendação e dados de gamificação
6. Registro assíncrono em gamificação e quiz público

As configurações de classes, limiares e regras de descarte são declaradas em `backend/configs/*.yaml`, permitindo evoluir o comportamento sem alterar o código.

---

## 🔒 Segurança

- Endpoints sensíveis protegidos por token DRF
- Dados de cada usuário (chat, análises, progresso) isolados por autenticação
- CORS/CSRF configurados por origem esperada
- Validação de payload aplicada nas views

---

## 📄 Artigo Científico

Este projeto foi documentado em artigo científico apresentado à UNIP:

> **Reuse.AI — Inteligência Sustentável**
> Machado, A. J. M.; Gorayeb, E. M.; Leite, I. F.; Granata, L. J.; Oliveira, M. C.; Moraes, P. H. F.
> UNIP — Universidade Paulista, São José do Rio Preto – SP, Março/2026.
> Orientadora: Prof.ª Lidiana Braga.

---

## 👥 Equipe

<table align="center">
  <tr>
    <td align="center">
      <b>Eduardo Meneghetti Gorayeb</b><br/>
      <a href="https://github.com/EduardoGorayeb">@github</a>
    </td>
    <td align="center">
      <b>Leonardo Jordão Granata</b><br/>
      <a href="https://github.com/leonardogranata">@github</a>
    </td>
    <td align="center">
      <b>Pedro Henrique Ferreira Moraes</b><br/>
      <a href="https://github.com/PedroMoraes57">@github</a>
    </td>
  </tr>
</table>

<p align="center">
  Desenvolvido com 💚 na <strong>UNIP — Universidade Paulista</strong><br/>
  São José do Rio Preto – SP • Março/2026
</p>
