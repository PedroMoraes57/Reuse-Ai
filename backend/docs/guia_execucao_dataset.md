# Guia de Execucao do Dataset

Este e o fluxo recomendado depois que voce decidir quais classes vai usar e comecar a inserir as imagens.

## 1. Criar a estrutura das pastas

```bash
.venv/bin/python scripts/scaffold_dataset.py
```

Isso cria:

```text
data/datasets/recycle30/
  raw/
  train/
  val/
  test/
```

## 2. Inserir as imagens brutas das classes

Coloque todas as imagens primeiro em:

```text
data/datasets/recycle30/raw/<classe>/
```

Exemplo:

```text
data/datasets/recycle30/raw/plastic_bottle/
data/datasets/recycle30/raw/glass_bottle/
data/datasets/recycle30/raw/metal_can/
```

Os nomes das pastas devem ser exatamente os mesmos ids do arquivo:

- `configs/class_catalog.yaml`

## 3. Rodar a divisao automatica

Com as imagens em `raw/`, execute:

```bash
.venv/bin/python scripts/split_dataset.py
```

Exemplo com configuracao explicita:

```bash
.venv/bin/python scripts/split_dataset.py \
  --train-ratio 0.70 \
  --val-ratio 0.15 \
  --test-ratio 0.15 \
  --seed 42 \
  --mode copy
```

Resultado:

- `raw/` continua com as imagens originais se usar `--mode copy`
- `train/`, `val/` e `test/` serao preenchidos automaticamente

Se quiser mover em vez de copiar:

```bash
.venv/bin/python scripts/split_dataset.py --mode move
```

## 4. Treinar o modelo

Depois da divisao:

```bash
.venv/bin/python scripts/train.py
```

O checkpoint principal sera salvo em:

- `artifacts/checkpoints/reuse_ai_best.pt`

## 5. Rodar inferencia

Imagem salva:

```bash
.venv/bin/python scripts/analyze_images.py --images caminho/imagem.jpg
```

Camera:

```bash
.venv/bin/python scripts/capture_and_analyze.py --camera-index 0
```

API local:

```bash
.venv/bin/python scripts/run_api.py --host 0.0.0.0 --port 8000
```

## Regras importantes

- Todas as classes listadas em `configs/class_catalog.yaml` devem ter imagens em `raw/`
- Cada classe precisa ter pelo menos 3 imagens
- O script apaga e recria o conteudo de `train/`, `val/` e `test/` a cada nova divisao
- O modo mais seguro para comecar e `--mode copy`
