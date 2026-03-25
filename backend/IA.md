# Reuse.AI

Backend inicial em Python para:

- treinar um classificador visual com cerca de 30 classes de objetos e alimentos;
- analisar uma ou varias imagens do mesmo item;
- considerar geolocalizacao do usuario para personalizar a orientacao de descarte;
- informar o que o item e, como descartar e qual canal de descarte procurar.

O projeto foi preparado para rodar com `python3` 3.12.8 e acelerar treino/inferencia com CUDA na RTX 2060.

## Ambiente

A `venv` ja foi criada em `.venv` e as bibliotecas principais ja foram instaladas.

Para repetir a instalacao do zero:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip setuptools wheel
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install -e .
```

## Estrutura do projeto

```text
configs/                  Configuracoes do projeto, classes e regras de descarte
data/datasets/recycle30/  Dataset plugavel para treino/validacao/teste
artifacts/                Checkpoints, capturas e arquivos gerados
scripts/                  Scripts executaveis para scaffold, treino e inferencia
src/reuse_ai/             Codigo fonte do backend
```

## 30 classes iniciais

As classes foram definidas em `configs/class_catalog.yaml` e cobrem embalagens reciclaveis, organicos, itens sanitarios e objetos de descarte especial.

Exemplos:

- `plastic_bottle`
- `glass_bottle`
- `metal_can`
- `milk_carton`
- `earphones`
- `pizza_box`
- `toilet_brush`

## Preparar as pastas do dataset

O scaffold das pastas foi automatizado. Execute:

```bash
.venv/bin/python scripts/scaffold_dataset.py
```

Agora o fluxo recomendado e automatico ficou assim:

1. Coloque todas as imagens brutas em `raw/<classe>/`
2. Execute o script de divisao automatica
3. O projeto vai preencher `train/`, `val/` e `test/`
4. Inicie o treino

Estrutura esperada apos o scaffold:

```text
data/datasets/recycle30/
  raw/
    plastic_bottle/
    glass_bottle/
    ...
  train/
    plastic_bottle/
    glass_bottle/
    ...
  val/
    plastic_bottle/
    glass_bottle/
    ...
  test/
    plastic_bottle/
    glass_bottle/
    ...
```

Coloque primeiro as imagens em `raw/<classe>/`.

Depois execute a divisao automatica:

```bash
.venv/bin/python scripts/split_dataset.py
```

Exemplo com parametros explicitos:

```bash
.venv/bin/python scripts/split_dataset.py \
  --train-ratio 0.70 \
  --val-ratio 0.15 \
  --test-ratio 0.15 \
  --seed 42 \
  --mode copy
```

Guia detalhado:

- `docs/guia_execucao_dataset.md`

## Treinar o modelo

```bash
.venv/bin/python scripts/train.py
```

O treino usa:

- `timm` com modelo pretreinado;
- `PyTorch` com CUDA quando disponivel;
- mixed precision;
- `AdamW`;
- early stopping;
- checkpoint do melhor modelo em `artifacts/checkpoints/reuse_ai_best.pt`.

## Analisar imagens ja salvas

```bash
.venv/bin/python scripts/analyze_images.py \
  --images caminho/imagem1.jpg caminho/imagem2.jpg \
  --latitude -23.5505 \
  --longitude -46.6333
```

Voce tambem pode informar manualmente:

```bash
.venv/bin/python scripts/analyze_images.py \
  --images caminho/imagem.jpg \
  --country-code BR \
  --state "Sao Paulo" \
  --city "Sao Paulo"
```

## Capturar pela camera

```bash
.venv/bin/python scripts/capture_and_analyze.py --camera-index 0
```

Controles:

- `espaco`: captura uma imagem
- `enter`: analisa as imagens capturadas
- `c`: limpa as capturas atuais
- `q`: sai

## Subir API local

```bash
.venv/bin/python scripts/run_api.py --host 0.0.0.0 --port 8000
```

Endpoint principal:

- `POST /analyze`

Campos aceitos:

- `files`: uma ou varias imagens
- `latitude`
- `longitude`
- `country_code`
- `state`
- `state_code`
- `city`

## Observacoes importantes

- Sem imagens em `raw/` e sem a etapa de divisao automatica, o treino nao vai iniciar.
- Cada classe precisa ter pelo menos 3 imagens para que o split gere `train`, `val` e `test`.
- O script de divisao espera que todas as classes listadas em `configs/class_catalog.yaml` estejam presentes em `raw/`.
- As regras de descarte por regiao sao configuraveis em `configs/disposal_rules.yaml`.
- A geolocalizacao usa reverse geocoding quando latitude e longitude forem informados.
- Pontos de coleta especificos por cidade devem ser alimentados por voce em configuracao futura ou integrados a uma base municipal confiavel.
